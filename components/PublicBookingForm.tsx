'use client';

import { useMemo, useState } from 'react';
import type { Hotel, Room } from '@/types/app';
import { proofFileProblem } from '@/lib/guest-contact';
import { currency } from '@/lib/money';
import { roomAmountLabel, roomOnlyChoiceEnabled, stayPricingFor } from '@/lib/hotel-pricing';
import { paymentAccountForHotel, paymentInstructionLines } from '@/lib/payment-instructions';
import { clampGuestCount, publicFormHold, quotePublicStay } from '@/lib/public-quote';

type BookRoom = Room & { quoted_rate?: number };
type Receipt = {
  reference: string;
  room: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guestCount: number;
  breakfastLine: string;
  extraBedLine: string;
  total: number;
  downpaymentRequired: number;
  amountPaid: number;
};

export function PublicBookingForm({ hotel, rooms, today }: { hotel: Hotel; rooms: BookRoom[]; today: string }) {
  const [roomId, setRoomId] = useState(rooms[0]?.id || '');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guestCount, setGuestCount] = useState(1);
  const [withBreakfast, setWithBreakfast] = useState(true);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [proofSelected, setProofSelected] = useState(false);
  const [message, setMessage] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(false);

  const room = useMemo(() => rooms.find((item) => item.id === roomId) || rooms[0], [rooms, roomId]);
  const capacity = Math.max(1, Math.floor(Number(room?.capacity || 1)));
  const guests = clampGuestCount(guestCount, capacity);
  const datesReady = Boolean(checkIn && checkOut && checkOut > checkIn);
  const nightly = Number(room?.quoted_rate ?? room?.base_rate ?? 0);
  const quote = datesReady && room
    ? quotePublicStay({
      hotelSlug: hotel.slug,
      roomTypeName: room.room_type_name,
      nightlyRate: nightly,
      checkIn,
      checkOut,
      guestCount: guests,
      withBreakfast,
      downpaymentType: hotel.downpayment_type,
      defaultPercent: Number(hotel.default_downpayment_percent || 0),
      defaultAmount: Number(hotel.default_downpayment_amount || 0)
    })
    : null;
  const payTo = paymentAccountForHotel(hotel);
  const pricing = stayPricingFor({ slug: hotel.slug, roomTypeName: room?.room_type_name });
  const breakfastChoiceEnabled = quote ? quote.breakfastChoiceEnabled : roomOnlyChoiceEnabled(pricing);
  const breakfastIncluded = quote ? quote.breakfastIncluded : pricing.breakfastInRoomRate && !breakfastChoiceEnabled;
  const hold = publicFormHold({
    datesReady,
    checkIn,
    today,
    guestCount: guests,
    capacity,
    nights: quote?.nights || 0,
    paidText: paymentAmount,
    stayTotal: quote?.total,
    downpaymentRequired: quote?.downpaymentRequired,
    proofSelected
  });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!room || !quote) return;
    const formElement = event.currentTarget;
    const proof = formElement.querySelector<HTMLInputElement>('input[name="proof"]')?.files?.[0];
    if (!proof) {
      setMessage('Payment proof is required before the room can be held.');
      return;
    }
    const problem = proofFileProblem(proof);
    if (problem) {
      setMessage(problem);
      return;
    }
    if (hold.paymentTooLow) {
      setMessage(`The payment must be at least the required down payment of ${currency(quote.downpaymentRequired, hotel.default_currency)}.`);
      return;
    }
    if (hold.pastCheckIn) {
      setMessage(`Check-in cannot be before ${today}.`);
      return;
    }
    if (hold.stayTooLong) {
      setMessage('A stay can be at most 30 nights.');
      return;
    }
    if (hold.paymentTooHigh) {
      setMessage('The payment cannot be more than the stay total.');
      return;
    }
    if (guests > capacity) {
      setMessage(`This room allows up to ${capacity} guests.`);
      return;
    }
    setMessage('');
    setLoading(true);
    const form = new FormData(formElement);
    form.set('hotel_id', hotel.id);
    form.set('room_id', room.id);
    form.set('guest_count', String(guests));
    form.set('with_breakfast', quote.withBreakfast ? 'true' : 'false');
    if (!payTo.gcash) form.set('payment_method', 'bank_transfer');

    const response = await fetch('/api/public/bookings', { method: 'POST', body: form });
    setLoading(false);
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error(json);
      setMessage(json.error || 'The booking could not be saved. Please try again.');
      return;
    }
    setReceipt(json.summary as Receipt);
    formElement.reset();
  }

  if (!room) {
    return (
      <div className="card p-6">
        <h2 className="text-xl font-bold">This property is not accepting online room bookings yet.</h2>
        <p className="mt-2 text-sm text-slate-500">Please contact the hotel directly.</p>
      </div>
    );
  }

  if (receipt) {
    return (
      <section className="card space-y-4 p-6">
        <h2 className="text-2xl font-black">Booking request received</h2>
        <p className="text-sm text-slate-600">Save this reference. The hotel will review the proof. The room is held against other online requests until staff confirm or release it.</p>
        <p className="text-lg font-black">Reference {receipt.reference}</p>
        <ul className="space-y-1 text-sm text-slate-700">
          <li>{receipt.room}</li>
          <li>{receipt.checkIn} to {receipt.checkOut} · {receipt.nights} night(s)</li>
          <li>{receipt.guestCount} guest(s)</li>
          <li>{receipt.breakfastLine}</li>
          <li>{receipt.extraBedLine}</li>
          <li>Stay total {currency(receipt.total, hotel.default_currency)}</li>
          <li>Down payment required {currency(receipt.downpaymentRequired, hotel.default_currency)}</li>
          <li>Amount submitted {currency(receipt.amountPaid, hotel.default_currency)}</li>
        </ul>
        <PaymentInstructions slug={hotel.slug} />
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-5 p-6">
      <div>
        <h2 className="text-2xl font-black">Online booking request</h2>
        <p className="mt-1 text-sm text-slate-500">Send the down payment with a photo or PDF of the proof. The hotel confirms it before the stay is secured.</p>
      </div>
      {message ? <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</div> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label>Full name</label>
          <input name="guest_name" required className="public-field w-full" />
        </div>
        <div className="space-y-2">
          <label>Email</label>
          <input name="guest_email" type="email" required className="public-field w-full" />
        </div>
        <div className="space-y-2">
          <label>Phone</label>
          <input name="guest_phone" required className="public-field w-full" placeholder="09XXXXXXXXX" inputMode="tel" />
        </div>
        <div className="space-y-2">
          <label>Room</label>
          <select name="room_id" value={room.id} onChange={(event) => setRoomId(event.target.value)} className="public-field w-full">
            {rooms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <p className="text-sm text-slate-600">{room.name} · {currency(nightly, hotel.default_currency)} a night · up to {room.capacity} guests</p>
        </div>
        <div className="space-y-2">
          <label>Check-in</label>
          <input name="check_in" type="date" required min={today} value={checkIn} onChange={(event) => setCheckIn(event.target.value)} className="public-field w-full" />
          {hold.pastCheckIn ? <p className="text-sm text-red-700">Check-in cannot be before {today}.</p> : null}
        </div>
        <div className="space-y-2">
          <label>Check-out</label>
          <input name="check_out" type="date" required min={checkIn || today} value={checkOut} onChange={(event) => setCheckOut(event.target.value)} className="public-field w-full" />
        </div>
        <div className="space-y-2">
          <label>Number of guests</label>
          <select name="guest_count" value={guests} onChange={(event) => setGuestCount(clampGuestCount(Number(event.target.value || 1), capacity))} className="public-field w-full">
            {Array.from({ length: capacity }, (_, index) => index + 1).map((count) => (
              <option key={count} value={count}>{count}</option>
            ))}
          </select>
          <p className="text-sm text-slate-600">This room allows up to {capacity} guests.</p>
        </div>
        <div className="space-y-2">
          <label>Breakfast</label>
          {breakfastChoiceEnabled ? (
            <select name="with_breakfast" className="public-field w-full" value={withBreakfast ? 'true' : 'false'} onChange={(event) => setWithBreakfast(event.target.value === 'true')}>
              <option value="true">Yes, breakfast included</option>
              <option value="false">No - room only</option>
            </select>
          ) : breakfastIncluded ? (
            <p className="public-field w-full bg-slate-50">Breakfast for 2 is included in the room rate.</p>
          ) : (
            <p className="public-field w-full bg-slate-50">Room only</p>
          )}
        </div>
        <div className="space-y-2">
          <label>How you paid</label>
          <select name="payment_method" className="public-field w-full" defaultValue={payTo.gcash ? 'gcash' : 'bank_transfer'}>
            {payTo.gcash ? <option value="gcash">GCash</option> : null}
            <option value="bank_transfer">Bank transfer</option>
          </select>
        </div>
        <div className="space-y-2">
          <label>Payer name</label>
          <input name="payer_name" required className="public-field w-full" placeholder="Name shown on the proof" />
        </div>
        <div className="space-y-2">
          <label>Amount paid{quote ? ` (up to ${currency(quote.total, hotel.default_currency)})` : ''}</label>
          <input name="payment_amount" type="number" min="1" step="0.01" max={quote?.total || undefined} required value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} className="public-field w-full" />
          {hold.paymentTooLow && paymentAmount.trim() !== '' ? <p className="text-sm text-red-700">The payment must be at least the required down payment{quote ? ` of ${currency(quote.downpaymentRequired, hotel.default_currency)}` : ''}.</p> : null}
          {hold.paymentTooHigh ? <p className="text-sm text-red-700">The payment cannot be more than the stay total.</p> : null}
        </div>
        <div className="space-y-2">
          <label>Reference number <span className="font-normal text-slate-400">optional</span></label>
          <input name="payment_reference" className="public-field w-full" />
        </div>
        <div className="space-y-2 md:col-span-2">
          <label>Payment notes</label>
          <textarea name="payment_details" rows={3} required className="public-field w-full" placeholder="Sender name, date and time paid, and the reference if you have it." />
        </div>
        <div className="space-y-2 md:col-span-2">
          <label>Payment proof (JPG, PNG, or PDF, up to 4 MB)</label>
          <input name="proof" type="file" accept="image/jpeg,image/png,application/pdf" required className="public-field w-full" onChange={(event) => setProofSelected(Boolean(event.target.files?.length))} />
          {!proofSelected ? <p className="text-sm text-slate-600">Upload a payment proof. The room is not held without it.</p> : null}
        </div>
        <div className="space-y-2 md:col-span-2">
          <label>Booking notes</label>
          <textarea name="notes" rows={3} className="public-field w-full" placeholder="Arrival time or other requests" />
        </div>
      </div>

      <div className="rounded-xl bg-slate-50 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><p className="text-xs text-slate-500">Nights</p><p className="font-bold">{datesReady ? quote?.nights : 'Choose dates'}</p></div>
          <div><p className="text-xs text-slate-500">{roomAmountLabel(breakfastIncluded)}</p><p className="font-bold">{datesReady ? currency(quote?.roomTotal || 0, hotel.default_currency) : currency(nightly, hotel.default_currency)} {datesReady ? '' : 'a night'}</p></div>
          <div><p className="text-xs text-slate-500">Breakfast</p><p className="font-bold">{datesReady ? (quote?.breakfastLine || 'Room only') : 'Shown after you pick dates'}</p></div>
          <div><p className="text-xs text-slate-500">Extra bed</p><p className="font-bold">{datesReady ? (quote?.extraBedLine || 'No extra bed') : 'Shown after you pick dates'}</p></div>
          <div><p className="text-xs text-slate-500">Stay total</p><p className="font-bold">{datesReady ? currency(quote?.total || 0, hotel.default_currency) : '—'}</p></div>
          <div><p className="text-xs text-slate-500">Required down payment</p><p className="font-bold">{datesReady ? currency(quote?.downpaymentRequired || 0, hotel.default_currency) : '—'}</p></div>
        </div>
        {hold.stayTooLong ? <p className="mt-3 text-sm text-red-700">A stay can be at most 30 nights.</p> : null}
        {quote?.downpaymentDefaulted ? <p className="mt-3 text-xs text-slate-500">This property has no manual down-payment amount, so the request uses 50% of the stay.</p> : null}
      </div>

      <PaymentInstructions slug={hotel.slug} />
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">The room is held only after this proof is saved. If the hotel rejects the payment, the room is released. A request without payment does not hold the room.</p>
      <button className="btn-primary w-full" disabled={loading || hold.submitDisabled} type="submit">{loading ? 'Submitting...' : 'Submit booking request'}</button>
    </form>
  );
}

function PaymentInstructions({ slug }: { slug?: string | null }) {
  const account = paymentAccountForHotel({ slug });
  const lines = paymentInstructionLines({ slug });
  return (
    <div className={`rounded-lg border p-3 text-sm ${account.placeholder ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-slate-200 bg-slate-50 text-slate-800'}`}>
      {account.placeholder ? null : <p className="font-bold">Pay the down payment here</p>}
      {lines.map((line) => <p key={line} className={account.placeholder ? '' : 'mt-1'}>{line}</p>)}
    </div>
  );
}
