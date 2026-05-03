'use client';

import { useMemo, useState } from 'react';
import type { Hotel, Room } from '@/types/app';
import { currency } from '@/lib/money';
import { diffDays } from '@/lib/date';
import { calculateDownpayment, downpaymentLabel } from '@/lib/downpayment';

export function PublicBookingForm({ hotel, rooms }: { hotel: Hotel; rooms: Room[] }) {
  const [roomId, setRoomId] = useState(rooms[0]?.id || '');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [surcharge, setSurcharge] = useState('0');
  const [manualDownpayment, setManualDownpayment] = useState('0');
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const room = useMemo(() => rooms.find((item) => item.id === roomId) || rooms[0], [rooms, roomId]);
  const nights = checkIn && checkOut ? Math.max(1, diffDays(checkIn, checkOut)) : 1;
  const total = Number(room?.base_rate || 0) * nights + Number(surcharge || 0);
  const requiredDownpayment = calculateDownpayment({
    hotel,
    total,
    nightlyRate: Number(room?.base_rate || 0),
    manualAmount: Number(manualDownpayment || 0)
  });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!room) return;
    setMessage('');
    setSuccess(false);
    setLoading(true);
    const form = new FormData(event.currentTarget);
    form.set('hotel_id', hotel.id);
    form.set('room_id', room.id);
    form.set('posted_room_rate', String(room.base_rate));
    form.set('surcharge_amount', String(Number(surcharge || 0)));
    form.set('total_amount', String(total));
    form.set('downpayment_required', String(requiredDownpayment));

    const response = await fetch('/api/public/bookings', { method: 'POST', body: form });
    setLoading(false);
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(json.error || 'Booking request failed');
      return;
    }
    setSuccess(true);
    setMessage('Booking request submitted. It is visible for follow-up, but dates are not blocked until the hotel confirms the down payment. Hotel staff can send house rules and confirmation through editable email drafts.');
    event.currentTarget.reset();
    setCheckIn('');
    setCheckOut('');
    setSurcharge('0');
    setManualDownpayment('0');
  }

  if (!room) {
    return <div className="card p-6 text-sm text-slate-500">No rooms are currently available for online booking.</div>;
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-5 p-6">
      <div>
        <h2 className="text-2xl font-black">Online booking request</h2>
        <p className="mt-1 text-sm text-slate-500">Down payment information and proof upload are required. The hotel confirms payments manually before securing bookings.</p>
      </div>
      {message ? <div className={`rounded-lg px-3 py-2 text-sm ${success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{message}</div> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label>Full name</label>
          <input name="guest_name" required className="w-full" />
        </div>
        <div className="space-y-2">
          <label>Email</label>
          <input name="guest_email" type="email" required className="w-full" />
        </div>
        <div className="space-y-2">
          <label>Phone</label>
          <input name="guest_phone" required className="w-full" />
        </div>
        <div className="space-y-2">
          <label>Room</label>
          <select name="room_id" value={room.id} onChange={(event) => setRoomId(event.target.value)} className="w-full">
            {rooms.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.room_type_name || 'Room'} · {currency(item.base_rate, hotel.default_currency)}</option>)}
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
        {hotel.downpayment_type === 'manual' ? (
          <div className="space-y-2 md:col-span-2">
            <label>Required down payment amount</label>
            <input name="manual_downpayment_amount" type="number" min="0" step="0.01" value={manualDownpayment} onChange={(event) => setManualDownpayment(event.target.value)} className="w-full" />
          </div>
        ) : null}
        <div className="space-y-2">
          <label>Payer name</label>
          <input name="payer_name" required className="w-full" placeholder="Name shown on payment proof" />
        </div>
        <div className="space-y-2">
          <label>Amount paid</label>
          <input name="payment_amount" type="number" min="1" step="0.01" required className="w-full" />
        </div>
        <div className="space-y-2 md:col-span-2">
          <label>Payment information / reference</label>
          <textarea name="payment_details" rows={3} required className="w-full" placeholder="Enter sender details, reference number, date/time paid, payment channel, or any payment notes." />
        </div>
        <div className="space-y-2 md:col-span-2">
          <label>Payment proof</label>
          <input name="proof" type="file" accept="image/*,application/pdf" required className="w-full" />
        </div>
        <div className="space-y-2 md:col-span-2">
          <label>Booking notes</label>
          <textarea name="notes" rows={3} className="w-full" placeholder="Special requests, extra bed, estimated arrival time" />
        </div>
      </div>

      <div className="rounded-xl bg-slate-50 p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div><p className="text-xs text-slate-500">Nights</p><p className="font-bold">{nights}</p></div>
          <div><p className="text-xs text-slate-500">Room rate</p><p className="font-bold">{currency(room.base_rate, hotel.default_currency)}</p></div>
          <div><p className="text-xs text-slate-500">Estimated total</p><p className="font-bold">{currency(total, hotel.default_currency)}</p></div>
          <div><p className="text-xs text-slate-500">Required down payment</p><p className="font-bold">{currency(requiredDownpayment, hotel.default_currency)}</p></div>
        </div>
        <p className="mt-3 text-xs text-slate-500">Rule: {downpaymentLabel(hotel.downpayment_type)}.</p>
      </div>

      <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        Bookings are visible for follow-up after submission, but dates are blocked only after the hotel confirms payment.
      </div>
      <button className="btn-primary w-full" disabled={loading} type="submit">{loading ? 'Submitting...' : 'Submit booking request'}</button>
    </form>
  );
}
