'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ChannelRate, Hotel, Room, RoomType } from '@/types/app';
import { currency } from '@/lib/money';

export function ChannelRatesManager({
  hotels,
  roomTypes,
  rates,
  rooms
}: {
  hotels: Hotel[];
  roomTypes: RoomType[];
  rates: ChannelRate[];
  rooms: Room[];
}) {
  const router = useRouter();
  const [hotelId, setHotelId] = useState(hotels[0]?.id || '');
  const [message, setMessage] = useState('');
  const hotel = hotels.find((item) => item.id === hotelId) || hotels[0];
  const types = useMemo(() => roomTypes.filter((item) => item.hotel_id === hotel?.id), [hotel?.id, roomTypes]);
  const hotelRooms = rooms.filter((room) => room.hotel_id === hotel?.id);

  function rateValue(roomTypeId: string, channel: string) {
    return rates.find((item) => item.room_type_id === roomTypeId && item.channel === channel)?.rate ?? '';
  }

  async function saveRates(event: React.FormEvent<HTMLFormElement>, roomTypeId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage('');
    const response = await fetch('/api/settings/channel-rates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_type_id: roomTypeId,
        rates: {
          walk_in: Number(form.get('walk_in')),
          ota: Number(form.get('ota')),
          short_time: Number(form.get('short_time'))
        }
      })
    });
    const json = await response.json().catch(() => ({}));
    setMessage(response.ok ? 'Rates saved.' : json.error || 'Could not save rates.');
    if (response.ok) router.refresh();
  }

  async function assignRoom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage('');
    const response = await fetch('/api/settings/room-assignment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: form.get('room_id'), room_type_id: form.get('room_type_id') })
    });
    const json = await response.json().catch(() => ({}));
    setMessage(response.ok ? 'Room type assigned. The room rate now follows the walk-in price.' : json.error || 'Could not assign the room.');
    if (response.ok) router.refresh();
  }

  if (!hotel) return <p className="text-sm text-slate-500">Add a property first.</p>;

  return (
    <div className="space-y-6">
      {message ? <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm">{message}</p> : null}
      <label className="block max-w-sm space-y-1">
        Property
        <select className="w-full" value={hotel.id} onChange={(event) => setHotelId(event.target.value)}>
          {hotels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <p className="text-sm text-slate-500">
        Walk-in and OTA prices are separate. Short-time is its own price. Navarro rooms that were still “Regular” at ₱2,500 are treated as Deluxe King until you move them.
      </p>
      {types.map((roomType) => (
        <form key={roomType.id} className="card grid gap-3 p-4 md:grid-cols-4" onSubmit={(event) => saveRates(event, roomType.id)}>
          <div>
            <p className="font-bold">{roomType.name}</p>
            <p className="text-xs text-slate-500">Sleeps {roomType.capacity}. List rate {currency(roomType.base_rate, hotel.default_currency)}</p>
          </div>
          <label className="space-y-1">Walk-in<input name="walk_in" type="number" min="0" step="0.01" defaultValue={rateValue(roomType.id, 'walk_in')} className="w-full" required /></label>
          <label className="space-y-1">OTA<input name="ota" type="number" min="0" step="0.01" defaultValue={rateValue(roomType.id, 'ota')} className="w-full" required /></label>
          <label className="space-y-1">Short-time<input name="short_time" type="number" min="0" step="0.01" defaultValue={rateValue(roomType.id, 'short_time')} className="w-full" required /></label>
          <button className="btn-secondary md:col-span-4" type="submit">Save {roomType.name}</button>
        </form>
      ))}
      {!types.length ? <p className="text-sm text-slate-500">No room types for this property yet.</p> : null}
      <form className="card grid gap-3 p-4 md:grid-cols-[1fr_1fr_auto]" onSubmit={assignRoom}>
        <label className="space-y-1">Room
          <select name="room_id" className="w-full" required>
            {hotelRooms.map((room) => <option key={room.id} value={room.id}>{room.name} · {room.room_type_name || 'No type'}</option>)}
          </select>
        </label>
        <label className="space-y-1">Room type
          <select name="room_type_id" className="w-full" required>
            {types.map((roomType) => <option key={roomType.id} value={roomType.id}>{roomType.name}</option>)}
          </select>
        </label>
        <button className="btn-primary self-end" type="submit">Assign</button>
      </form>
    </div>
  );
}
