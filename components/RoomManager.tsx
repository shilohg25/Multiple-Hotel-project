'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Hotel, Room } from '@/types/app';
import { currency } from '@/lib/money';

export function RoomManager({ hotels, rooms }: { hotels: Hotel[]; rooms: Room[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedHotelId = searchParams.get('hotel') || hotels[0]?.id || '';
  const selectedHotel = hotels.find((hotel) => hotel.id === selectedHotelId) || hotels[0];
  const visibleRooms = useMemo(() => rooms.filter((room) => room.hotel_id === selectedHotel?.id), [rooms, selectedHotel?.id]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  function changeHotel(hotelId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('hotel', hotelId);
    router.push(`/rooms?${params.toString()}`);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setMessage('');
    setLoading(true);
    const form = new FormData(formElement);
    form.set('hotel_id', selectedHotel.id);
    const response = await fetch('/api/rooms', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(form.entries())),
      headers: { 'Content-Type': 'application/json' }
    });
    setLoading(false);
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      setMessage(json.error || 'Failed to save room');
      return;
    }
    formElement.reset();
    setMessage('Room saved.');
    router.refresh();
  }

  if (!selectedHotel) {
    return <div className="card p-6 text-sm text-slate-500">Add a hotel first.</div>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section className="card overflow-hidden">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center">
          <h2 className="text-lg font-bold">Rooms</h2>
          <select value={selectedHotel.id} onChange={(event) => changeHotel(event.target.value)}>
            {hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Room</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Capacity</th>
                <th className="px-5 py-3">Base rate</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleRooms.map((room) => (
                <tr key={room.id}>
                  <td className="px-5 py-3 font-semibold">{room.name}</td>
                  <td className="px-5 py-3 text-slate-600">{room.room_type_name || '-'}</td>
                  <td className="px-5 py-3 text-slate-600">{room.capacity}</td>
                  <td className="px-5 py-3 text-slate-600">{currency(room.base_rate, selectedHotel.default_currency)}</td>
                  <td className="px-5 py-3 text-slate-600">{room.active ? 'Active' : 'Inactive'}</td>
                </tr>
              ))}
              {!visibleRooms.length ? <tr><td className="px-5 py-6 text-slate-500" colSpan={5}>No rooms for this hotel yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-bold">Add room</h2>
        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          {message ? <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm">{message}</div> : null}
          <div className="space-y-2">
            <label>Room name / number</label>
            <input name="name" required placeholder="RM 201 or 601" className="w-full" />
          </div>
          <div className="space-y-2">
            <label>Room type</label>
            <input name="room_type_name" placeholder="Couple, Family, Glamping" className="w-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label>Capacity</label>
              <input name="capacity" type="number" min="1" defaultValue="2" className="w-full" />
            </div>
            <div className="space-y-2">
              <label>Base rate</label>
              <input name="base_rate" type="number" min="0" step="0.01" defaultValue="0" className="w-full" />
            </div>
          </div>
          <div className="space-y-2">
            <label>Sort order</label>
            <input name="sort_order" type="number" defaultValue="100" className="w-full" />
          </div>
          <button className="btn-primary w-full" disabled={loading} type="submit">{loading ? 'Saving...' : 'Save room'}</button>
        </form>
      </section>
    </div>
  );
}
