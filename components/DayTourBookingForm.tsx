'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DayTourPackage, Hotel } from '@/types/app';
import { currency } from '@/lib/money';

export function DayTourBookingForm({ hotels, selectedHotel, packages }: { hotels: Hotel[]; selectedHotel: Hotel; packages: DayTourPackage[] }) {
  const router = useRouter();
  const [packageId, setPackageId] = useState(packages[0]?.id || '');
  const [adultCount, setAdultCount] = useState('1');
  const [childCount, setChildCount] = useState('0');
  const [status, setStatus] = useState('tentative');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const selectedPackage = useMemo(() => packages.find((item) => item.id === packageId) || packages[0], [packageId, packages]);
  const total = Number(selectedPackage?.adult_price || 0) * Number(adultCount || 0) + Number(selectedPackage?.child_price || 0) * Number(childCount || 0);

  function changeHotel(hotelId: string) {
    router.push(`/day-tours/new?hotel=${hotelId}`);
  }

  async function createBooking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPackage) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    form.set('hotel_id', selectedHotel.id);
    form.set('package_id', selectedPackage.id);
    form.set('adult_count', adultCount);
    form.set('child_count', childCount);
    form.set('status', status);
    form.set('downpayment_required', String(Number(form.get('payment_amount') || 0)));

    setMessage('');
    setLoading(true);
    try {
      const response = await fetch('/api/day-tours/bookings', {
        method: 'POST',
        body: form
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(json.error || 'Failed to create day tour booking.');
        return;
      }
      setMessage('Day tour booking created.');
      router.push('/day-tours');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to create day tour booking.');
    } finally {
      setLoading(false);
    }
  }

  if (!packages.length) {
    return (
      <div className="card p-6 text-sm text-slate-500">
        Create an active day tour package before adding bookings.
      </div>
    );
  }

  return (
    <form onSubmit={createBooking} className="card grid gap-5 p-6 lg:grid-cols-2">
      {message ? <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 lg:col-span-2">{message}</div> : null}
      <div className="space-y-2">
        <label>Hotel</label>
        <select value={selectedHotel.id} onChange={(event) => changeHotel(event.target.value)} className="w-full">
          {hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        <label>Package</label>
        <select value={selectedPackage?.id || ''} onChange={(event) => setPackageId(event.target.value)} className="w-full">
          {packages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        <label>Guest name</label>
        <input name="guest_name" required className="w-full" />
      </div>
      <div className="space-y-2">
        <label>Guest phone</label>
        <input name="guest_phone" className="w-full" />
      </div>
      <div className="space-y-2">
        <label>Guest email</label>
        <input name="guest_email" type="email" className="w-full" />
      </div>
      <div className="space-y-2">
        <label>Tour date</label>
        <input name="tour_date" type="date" required className="w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label>Adults</label>
          <input value={adultCount} onChange={(event) => setAdultCount(event.target.value)} type="number" min="0" className="w-full" />
        </div>
        <div className="space-y-2">
          <label>Children</label>
          <input value={childCount} onChange={(event) => setChildCount(event.target.value)} type="number" min="0" className="w-full" />
        </div>
      </div>
      <div className="space-y-2">
        <label>Status</label>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="w-full">
          <option value="tentative">Tentative</option>
          <option value="payment_submitted">Payment submitted</option>
        </select>
      </div>
      {status === 'payment_submitted' ? (
        <>
          <div className="space-y-2">
            <label>Amount paid</label>
            <input name="payment_amount" type="number" min="1" step="0.01" required className="w-full" />
          </div>
          <div className="space-y-2">
            <label>Payer name</label>
            <input name="payer_name" className="w-full" />
          </div>
          <div className="space-y-2">
            <label>Reference</label>
            <input name="payment_reference" className="w-full" />
          </div>
          <div className="space-y-2 lg:col-span-2">
            <label>Payment details</label>
            <textarea name="payment_details" rows={3} required className="w-full" />
          </div>
          <div className="space-y-2 lg:col-span-2">
            <label>Payment proof</label>
            <input name="proof" type="file" accept="image/*,application/pdf" required className="w-full" />
          </div>
        </>
      ) : null}
      <div className="space-y-2 lg:col-span-2">
        <label>Notes</label>
        <textarea name="notes" rows={3} className="w-full" />
      </div>
      <div className="rounded-xl bg-slate-50 p-4 lg:col-span-2">
        <p className="text-xs text-slate-500">Estimated total</p>
        <p className="mt-1 text-xl font-black">{currency(total, selectedHotel.default_currency)}</p>
        <p className="mt-2 text-xs text-slate-500">Day tours do not block rooms. Only secured/completed day tours count against day tour capacity.</p>
      </div>
      <div className="lg:col-span-2">
        <button className="btn-primary" type="submit" disabled={loading}>{loading ? 'Saving...' : 'Create day tour booking'}</button>
      </div>
    </form>
  );
}
