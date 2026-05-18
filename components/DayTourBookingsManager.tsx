'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DayTourBooking, Hotel } from '@/types/app';
import { currency } from '@/lib/money';

const statuses = ['tentative', 'payment_submitted', 'secured', 'completed', 'cancelled', 'no_show'];

export function DayTourBookingsManager({
  hotels,
  selectedHotel,
  bookings,
  canManage
}: {
  hotels: Hotel[];
  selectedHotel: Hotel;
  bookings: DayTourBooking[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  function changeHotel(hotelId: string) {
    router.push(`/day-tours?hotel=${hotelId}`);
  }

  async function updateStatus(id: string, status: string) {
    setMessage('');
    setSavingId(id);
    try {
      const response = await fetch(`/api/day-tours/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(json.error || 'Failed to update day tour booking.');
        return;
      }
      setMessage('Day tour booking updated.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to update day tour booking.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-end">
          <div className="space-y-2">
            <label>Hotel</label>
            <select value={selectedHotel.id} onChange={(event) => changeHotel(event.target.value)} className="w-full">
              {hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}
            </select>
          </div>
          <Link href={`/day-tours/new?hotel=${selectedHotel.id}`} className="btn-primary">New booking</Link>
          <Link href={`/day-tours/packages?hotel=${selectedHotel.id}`} className="btn-secondary">Packages</Link>
        </div>
      </section>
      {message ? <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</div> : null}
      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Guest</th>
                <th className="px-5 py-3">Package</th>
                <th className="px-5 py-3">Guests</th>
                <th className="px-5 py-3">Total</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bookings.map((booking) => (
                <tr key={booking.id}>
                  <td className="px-5 py-3 font-semibold">{booking.tour_date}</td>
                  <td className="px-5 py-3">
                    <p className="font-semibold">{booking.guest_name}</p>
                    <p className="text-xs text-slate-500">{booking.guest_phone || 'No phone'} - {booking.guest_email || 'No email'}</p>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{booking.day_tour_packages?.name || 'Package deleted'}</td>
                  <td className="px-5 py-3 text-slate-600">{booking.adult_count} adult / {booking.child_count} child</td>
                  <td className="px-5 py-3 font-semibold">{currency(booking.total_amount, selectedHotel.default_currency)}</td>
                  <td className="px-5 py-3">
                    {canManage ? (
                      <select
                        value={booking.status}
                        disabled={savingId === booking.id}
                        onChange={(event) => void updateStatus(booking.id, event.target.value)}
                      >
                        {statuses.map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}
                      </select>
                    ) : (
                      <span className="capitalize">{booking.status.replace('_', ' ')}</span>
                    )}
                  </td>
                </tr>
              ))}
              {!bookings.length ? <tr><td className="px-5 py-6 text-slate-500" colSpan={6}>No day tour bookings yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
