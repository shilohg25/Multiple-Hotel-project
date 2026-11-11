'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Hotel, Room } from '@/types/app';
import { diffDays } from '@/lib/date';
import { currency } from '@/lib/money';
import { calculateDownpayment, downpaymentLabel } from '@/lib/downpayment';
import { roomAmountLabel } from '@/lib/hotel-pricing';
import { clampGuestCount, quotePublicStay } from '@/lib/public-quote';
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
  const [guestCount, setGuestCount] = useState(1);
  const [withBreakfast, setWithBreakfast] = useState(true);
  const [bookingSource, setBookingSource] = useState('walk_in');
  const [paymentKind, setPaymentKind] = useState('desk_cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [otaName, setOtaName] = useState('');
  const [deskPayment, setDeskPayment] = useState('');
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

  const nights = checkIn && checkOut && checkOut > checkIn ? Math.max(1, diffDays(checkIn, checkOut)) : 1;
  const roomCapacity = Math.max(1, Math.floor(Number(selectedRoom?.capacity || 1)));
  const guests = clampGuestCount(guestCount, roomCapacity);
  const quote = hotel && selectedRoom
    ? quotePublicStay({
      hotelSlug: hotel.slug,
      roomTypeName: selectedRoom.room_type_name,
      nightlyRate: Number(selectedRoom.base_rate || 0),
      checkIn: checkIn || '2026-01-01',
      checkOut: checkOut && checkOut > (checkIn || '2026-01-01') ? checkOut : '2026-01-02',
      guestCount: guests,
      withBreakfast,
      downpaymentType: hotel.downpayment_type,
      defaultPercent: Number(hotel.default_downpayment_percent || 0),
      defaultAmount: Number(hotel.default_downpayment_amount || 0)
    })
    : null;
  const surchargeAmount = Number(surcharge || 0);
  const stayTotal = (quote?.total || 0) + surchargeAmount;
  const downpayment = !hotel || !quote
    ? 0
    : quote.fixedDownpaymentPercent != null
      ? Math.round(stayTotal * quote.fixedDownpaymentPercent) / 100
      : calculateDownpayment({
        hotel,
        total: stayTotal,
        nightlyRate: quote.nightlyRate,
        manualAmount: Number(manualDownpayment || 0)
      });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!hotel || !selectedRoom || !quote) {
      setMessage('Choose a hotel and room before saving the reservation.');
      return;
    }
    const paid = Number(deskPayment || 0);
    if (!['walk_in', 'booking_dot_com', 'trip_dot_com', 'agoda', 'expedia', 'lgu', 'company'].includes(bookingSource)) {
      setMessage('Pencil bookings are not allowed. This source needs a payment record before the room is held.');
      return;
    }
    if (paid + 0.001 < downpayment) {
      setMessage('A room cannot be held without a payment that covers the down payment.');
      return;
    }
    if (paid > stayTotal + 0.001) {
      setMessage('The payment cannot be more than the stay total.');
      return;
    }
    if (bookingSource !== 'walk_in' && !paymentReference.trim()) {
      setMessage(paymentKind === 'invoice' ? 'An invoice or PO number is required.' : 'A reference number is required.');
      return;
    }
    if (paymentKind === 'ota_prepaid' && bookingSource !== 'walk_in' && !otaName.trim()) {
      setMessage('The OTA name is required.');
      return;
    }

    setMessage('');
    setLoading(true);
    const form = new FormData(event.currentTarget);
    form.set('hotel_id', hotel.id);
    form.set('room_id', selectedRoom.id);
    form.set('guest_count', String(guests));
    form.set('with_breakfast', quote?.withBreakfast ? 'true' : 'false');
    form.set('posted_room_rate', String(quote?.nightlyRate || selectedRoom.base_rate));
    form.set('total_amount', String((quote?.roomTotal || 0) + surchargeAmount));
    form.set('downpayment_required', String(downpayment));
    form.set('booking_source', bookingSource);
    form.set('payment_kind', bookingSource === 'walk_in' ? 'desk_cash' : paymentKind);
    form.set('payment_reference', paymentReference);
    form.set('ota_name', otaName);
    form.set('desk_payment', String(Number(deskPayment || 0)));
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
      setMessage('Network unavailable. A local draft does not hold the room.');
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
      setMessage('Saved locally. It will not hold a room until it syncs as a paid walk-in.');
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
    return (
      <div className="card space-y-4 p-6 text-sm text-slate-500">
        <p>Create at least one room/unit before adding reservations.</p>
        <Link href="/rooms" className="btn-primary">Go to Rooms / Units</Link>
      </div>
    );
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
        <p>{hotel?.name || 'This hotel/property'} has no active rooms/units yet. Add rooms/units first or choose another hotel.</p>
        {hotel ? <Link href={`/rooms?hotel=${hotel.id}&focus=add`} className="btn-primary">Add rooms/units for this hotel</Link> : null}
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
        <select name="booking_source" className="w-full" value={bookingSource} onChange={(event) => {
          const next = event.target.value;
          setBookingSource(next);
          if (next === 'walk_in') setPaymentKind('desk_cash');
          else if (next === 'lgu' || next === 'company') setPaymentKind('invoice');
          else setPaymentKind('ota_prepaid');
          if (next === 'booking_dot_com') setOtaName('Booking.com');
          else if (next === 'trip_dot_com') setOtaName('Trip.com');
          else if (next === 'agoda') setOtaName('Agoda');
          else if (next === 'expedia') setOtaName('Expedia');
        }}>
          <option value="walk_in">Walk-in</option>
          <option value="booking_dot_com">Booking.com</option>
          <option value="trip_dot_com">Trip.com</option>
          <option value="agoda">Agoda</option>
          <option value="expedia">Expedia</option>
          <option value="lgu">LGU</option>
          <option value="company">Company</option>
          <option value="facebook">Facebook</option>
          <option value="phone">Phone</option>
          <option value="online">Online booking form</option>
          <option value="other">Other</option>
        </select>
        {!['walk_in', 'booking_dot_com', 'trip_dot_com', 'agoda', 'expedia', 'lgu', 'company'].includes(bookingSource) ? <p className="text-sm text-red-700">Pencil bookings are not allowed. This source needs a payment record before the room is held.</p> : null}
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
        <select name="guest_count" value={guests} onChange={(event) => setGuestCount(clampGuestCount(Number(event.target.value || 1), roomCapacity))} className="w-full">
          {Array.from({ length: roomCapacity }, (_, index) => index + 1).map((count) => (
            <option key={count} value={count}>{count}</option>
          ))}
        </select>
        <p className="text-sm text-slate-600">This room allows up to {roomCapacity} guests.</p>
      </div>
      <div className="space-y-2">
        <label>Breakfast</label>
        {quote?.breakfastChoiceEnabled ? (
          <select name="with_breakfast" className="w-full" value={withBreakfast ? 'true' : 'false'} onChange={(event) => setWithBreakfast(event.target.value === 'true')}>
            <option value="true">Yes, breakfast included</option>
            <option value="false">No - room only</option>
          </select>
        ) : quote?.breakfastIncluded ? (
          <p className="rounded-md bg-slate-50 px-3 py-2 text-sm">Breakfast for 2 is included in the room rate.</p>
        ) : (
          <p className="rounded-md bg-slate-50 px-3 py-2 text-sm">Room only</p>
        )}
      </div>
      {bookingSource !== 'walk_in' && ['booking_dot_com', 'trip_dot_com', 'agoda', 'expedia', 'lgu', 'company'].includes(bookingSource) ? (
        <div className="space-y-2">
          <label>How it was paid</label>
          <select className="w-full" value={paymentKind} onChange={(event) => setPaymentKind(event.target.value)}>
            {bookingSource === 'lgu' || bookingSource === 'company' ? <option value="invoice">Invoice or PO</option> : <option value="ota_prepaid">OTA prepaid</option>}
            <option value="bank_transfer">Bank transfer</option>
          </select>
        </div>
      ) : null}
      {paymentKind === 'ota_prepaid' && bookingSource !== 'walk_in' ? (
        <div className="space-y-2">
          <label>OTA name</label>
          <input className="w-full" value={otaName} onChange={(event) => setOtaName(event.target.value)} />
        </div>
      ) : null}
      {bookingSource !== 'walk_in' && ['booking_dot_com', 'trip_dot_com', 'agoda', 'expedia', 'lgu', 'company'].includes(bookingSource) ? (
        <div className="space-y-2">
          <label>{paymentKind === 'invoice' ? 'Invoice or PO number' : 'Reference number'}</label>
          <input className="w-full" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} />
        </div>
      ) : null}
      <div className="space-y-2">
        <label>{bookingSource === 'walk_in' ? 'Amount paid at the desk' : 'Payment amount'}</label>
        <input name="desk_payment" type="number" min="0" step="0.01" max={stayTotal || undefined} value={deskPayment} onChange={(event) => setDeskPayment(event.target.value)} className="w-full" />
        <p className="text-sm text-slate-600">Must cover the down payment of {currency(downpayment, hotel.default_currency)} and cannot exceed the stay total. The room is held only after this payment is saved.</p>
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
          <div><p className="text-xs text-slate-500">{roomAmountLabel(Boolean(quote?.breakfastIncluded))}</p><p className="font-bold">{currency(quote?.roomTotal || 0, hotel.default_currency)}</p></div>
          <div><p className="text-xs text-slate-500">Extra bed</p><p className="font-bold">{quote?.extraBedLine || 'No extra bed'}</p></div>
          <div><p className="text-xs text-slate-500">Stay total</p><p className="font-bold">{currency(stayTotal, hotel.default_currency)}</p></div>
          <div><p className="text-xs text-slate-500">Required down payment</p><p className="font-bold">{currency(downpayment, hotel.default_currency)}</p></div>
        </div>
        <p className="mt-3 text-xs text-slate-500">Down payment rule: {downpaymentLabel(hotel.downpayment_type)}. A paid walk-in is secured. OTA, LGU, and company payments hold the room once saved. A manager confirms a payment entered by front desk.</p>
      </div>

      <div className="lg:col-span-2">
        <button className="btn-primary" disabled={loading || !['walk_in', 'booking_dot_com', 'trip_dot_com', 'agoda', 'expedia', 'lgu', 'company'].includes(bookingSource)} type="submit">{loading ? 'Saving...' : 'Save with payment'}</button>
        {offlineDraft ? (
          <button className="btn-secondary ml-2" disabled={loading} type="button" onClick={() => void saveOfflineDraft()}>
            Save offline draft
          </button>
        ) : null}
      </div>
    </form>
  );
}
