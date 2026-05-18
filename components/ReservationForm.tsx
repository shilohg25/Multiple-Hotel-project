'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Hotel, Room } from '@/types/app';
import { diffDays } from '@/lib/date';
import { currency } from '@/lib/money';
import { calculateDownpayment, downpaymentLabel } from '@/lib/downpayment';
import { queueOfflineItem } from '@/lib/offline/db';

export function ReservationForm({ hotels, rooms }: { hotels: Hotel[]; rooms: Room[] }) {
  const router = useRouter();
  const activeRooms = useMemo(() => rooms.filter((room) => room.active), [rooms]);
  const firstHotelWithRooms = useMemo(
    () => hotels.find((item) => activeRooms.some((room) => room.hotel_id === item.id)),
    [activeRooms, hotels]
  );

  const [hotelId, setHotelId] = useState(() => firstHotelWithRooms?.id || hotels[0]?.id || '');
  const [roomId, setRoomId] = useState('');
  const [hotelWasSelected, setHotelWasSelected] = useState(false);
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [surcharge, setSurcharge] = useState('0');
  const [manualDownpayment, setManualDownpayment] = useState('0');
  const [message, setMessage] = useState('');
  const [offlineDraft, setOfflineDraft] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  const hotel = useMemo(() => hotels.find((item) => item.id === hotelId), [hotelId, hotels]);
  const visibleRooms = useMemo(() => activeRooms.filter((room) => room.hotel_id === hotelId), [activeRooms, hotelId]);
  const selectedRoom = useMemo(() => visibleRooms.find((room) => room.id === roomId) || visibleRooms[0], [roomId, visibleRooms]);
  const hasAnyRooms = Boolean(firstHotelWithRooms);

  useEffect(() => {
    if (!hotels.length) {
      if (hotelId) setHotelId('');
      if (roomId) setRoomId('');
      return;
    }

    const selectedHotelExists = hotels.some((item) => item.id === hotelId);
    if (!selectedHotelExists) {
      setHotelId(firstHotelWithRooms?.id || hotels[0].id);
      setRoomId('');
      setHotelWasSelected(false);
      return;
    }

    if (!visibleRooms.length && firstHotelWithRooms && !hotelWasSelected) {
      setHotelId(firstHotelWithRooms.id);
      setRoomId('');
      return;
    }

    if (visibleRooms.length && (!roomId || !visibleRooms.some((room) => room.id === roomId))) {
      setRoomId(visibleRooms[0].id);
      return;
    }

    if (!visibleRooms.length && roomId) {
      setRoomId('');
    }
  }, [firstHotelWithRooms, hotelId, hotelWasSelected, hotels, roomId, visibleRooms]);

  function handleHotelChange(nextHotelId: string) {
    setHotelId(nextHotelId);
    setRoomId('');
    setHotelWasSelected(true);
  }

  const nights = checkIn && checkOut ? Math.max(1, diffDays(checkIn, checkOut)) : 1;
  const total = Number(selectedRoom?.base_rate || 0) * nights + Number(surcharge || 0);
  const downpayment = hotel
    ? calculateDownpayment({
        hotel,
        total,
        nightlyRate: Number(selectedRoom?.base_rate || 0),
        manualAmount: Number(manualDownpayment || 0)
      })
    : 0;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!hotel || !selectedRoom) {
      setMessage('Choose a hotel and room before saving the reservation.');
      return;
    }

    setMessage('');
    setLoading(true);
    const form = new FormData(event.currentTarget);
    form.set('hotel_id', hotel.id);
    form.set('room_id', selectedRoom.id);
    form.set('posted_room_rate', String(selectedRoom.base_rate));
    form.set('total_amount', String(total));
    form.set('downpayment_required', String(downpayment));
    form.set('surcharge_amount', String(Number(surcharge || 0)));
    const payload = Object.fromEntries(form.entries());

    try {
      const response = await fetch('/api/reservations', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' }
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(json.error || 'Failed to save reservation');
        return;
      }
      router.push(`/reservations/${json.reservation.id}`);
    } catch {
      setOfflineDraft(payload);
      setMessage('Network unavailable. You can save this reservation locally as a tentative draft and sync it later.');
    } finally {
      setLoading(false);
    }
  }

  async function saveOfflineDraft() {
    if (!offlineDraft) return;
    setLoading(true);
    try {
      await queueOfflineItem('reservation_draft', { ...offlineDraft, status: 'tentative' });
      setOfflineDraft(null);
      setMessage('Saved locally. Sync when internet returns. Offline drafts never secure or block room dates.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save offline draft.');
    } finally {
      setLoading(false);
    }
  }

  if (!hotels.length) {
    return <div className="card p-6 text-sm text-slate-500">Create at least one hotel before adding reservations.</div>;
  }

  if (!hasAnyRooms) {
    return <div className="card p-6 text-sm text-slate-500">Create at least one room before adding reservations.</div>;
  }

  if (!hotel || !visibleRooms.length) {
    return (
      <div className="card space-y-4 p-6 text-sm text-slate-500">
        <div className="space-y-2">
          <label>Hotel</label>
          <select name="hotel_id" value={hotelId} onChange={(event) => handleHotelChange(event.target.value)} className="w-full">
            {hotels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>
        <p>This hotel has no rooms yet. Add rooms first or choose another hotel.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card grid gap-5 p-6 lg:grid-cols-2">
      {message ? <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 lg:col-span-2">{message}</div> : null}

      <div className="space-y-2">
        <label>Hotel</label>
        <select name="hotel_id" value={hotelId} onChange={(event) => handleHotelChange(event.target.value)} className="w-full">
          {hotels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        <label>Room</label>
        <select name="room_id" value={selectedRoom.id} onChange={(event) => setRoomId(event.target.value)} className="w-full">
          {visibleRooms.map((room) => <option key={room.id} value={room.id}>{room.name} - {room.room_type_name || 'Room'}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        <label>Guest name</label>
        <input name="guest_name" required className="w-full" />
      </div>
      <div className="space-y-2">
        <label>Guest email</label>
        <input name="guest_email" type="email" className="w-full" placeholder="Used for manual email drafts" />
      </div>
      <div className="space-y-2">
        <label>Guest phone</label>
        <input name="guest_phone" className="w-full" />
      </div>
      <div className="space-y-2">
        <label>Booking source</label>
        <select name="booking_source" className="w-full">
          <option value="walk_in">Walk-in</option>
          <option value="facebook">Facebook</option>
          <option value="phone">Phone</option>
          <option value="booking_dot_com">Booking.com</option>
          <option value="trip_dot_com">Trip.com</option>
          <option value="online">Online booking form</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div className="space-y-2">
        <label>Check-in</label>
        <input name="check_in" type="date" required value={checkIn} onChange={(event) => setCheckIn(event.target.value)} className="w-full" />
      </div>
      <div className="space-y-2">
        <label>Check-out</label>
        <input name="check_out" type="date" required value={checkOut} onChange={(event) => setCheckOut(event.target.value)} className="w-full" />
      </div>
      <div className="space-y-2">
        <label>Number of guests</label>
        <input name="guest_count" type="number" min="1" defaultValue="1" className="w-full" />
      </div>
      <div className="space-y-2">
        <label>Breakfast</label>
        <select name="with_breakfast" className="w-full">
          <option value="false">No - room only</option>
          <option value="true">Yes</option>
        </select>
      </div>
      <div className="space-y-2">
        <label>Surcharge label</label>
        <input name="surcharge_label" placeholder="Extra bed, early check-in, pet fee" className="w-full" />
      </div>
      <div className="space-y-2">
        <label>Surcharge amount</label>
        <input name="surcharge_amount" type="number" min="0" step="0.01" value={surcharge} onChange={(event) => setSurcharge(event.target.value)} className="w-full" />
      </div>
      {hotel.downpayment_type === 'manual' ? (
        <div className="space-y-2 lg:col-span-2">
          <label>Manual down payment required</label>
          <input name="manual_downpayment_amount" type="number" min="0" step="0.01" value={manualDownpayment} onChange={(event) => setManualDownpayment(event.target.value)} className="w-full" />
        </div>
      ) : null}
      <div className="space-y-2 lg:col-span-2">
        <label>Notes</label>
        <textarea name="notes" rows={3} className="w-full" />
      </div>

      <div className="rounded-xl bg-slate-50 p-4 lg:col-span-2">
        <div className="grid gap-3 md:grid-cols-4">
          <div><p className="text-xs text-slate-500">Nights</p><p className="font-bold">{nights}</p></div>
          <div><p className="text-xs text-slate-500">Room rate</p><p className="font-bold">{currency(selectedRoom.base_rate, hotel.default_currency)}</p></div>
          <div><p className="text-xs text-slate-500">Total</p><p className="font-bold">{currency(total, hotel.default_currency)}</p></div>
          <div><p className="text-xs text-slate-500">Required down payment</p><p className="font-bold">{currency(downpayment, hotel.default_currency)}</p></div>
        </div>
        <p className="mt-3 text-xs text-slate-500">Down payment rule: {downpaymentLabel(hotel.downpayment_type)}. New staff-created reservations are tentative until payment is confirmed.</p>
      </div>

      <div className="lg:col-span-2">
        <button className="btn-primary" disabled={loading} type="submit">{loading ? 'Saving...' : 'Create tentative reservation'}</button>
        {offlineDraft ? (
          <button className="btn-secondary ml-2" disabled={loading} type="button" onClick={() => void saveOfflineDraft()}>
            Save offline draft
          </button>
        ) : null}
      </div>
    </form>
  );
}
