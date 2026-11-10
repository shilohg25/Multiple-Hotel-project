'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Hotel, Role } from '@/types/app';

export function PropertyHoursForm({ hotels, role }: { hotels: Hotel[]; role: Role }) {
  const router = useRouter();
  const [hotelId, setHotelId] = useState(hotels[0]?.id || '');
  const [message, setMessage] = useState('');
  const hotel = hotels.find((item) => item.id === hotelId) || hotels[0];
  if (!hotel || (role !== 'owner' && role !== 'manager')) return null;

  return (
    <form
      key={hotel.id}
      className="card grid gap-3 p-4 md:grid-cols-5"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const response = await fetch('/api/settings/property-hours', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hotel_id: hotel.id,
            check_in_time: form.get('check_in_time'),
            check_out_time: form.get('check_out_time'),
            early_checkin_hourly_rate: Number(form.get('early_checkin_hourly_rate')),
            late_checkout_hourly_rate: Number(form.get('late_checkout_hourly_rate'))
          })
        });
        const json = await response.json().catch(() => ({}));
        setMessage(response.ok ? 'Hours saved.' : json.error || 'Could not save hours.');
        if (response.ok) router.refresh();
      }}
    >
      <div className="md:col-span-5">
        <h2 className="text-lg font-bold">Check-in and check-out</h2>
        <p className="text-sm text-slate-500">Defaults are 2:00 PM and 12:00 noon. Early and late hours are charged per hour after a manager approves them.</p>
        {message ? <p className="mt-2 text-sm">{message}</p> : null}
      </div>
      <label className="space-y-1">Property
        <select className="w-full" value={hotel.id} onChange={(event) => setHotelId(event.target.value)}>
          {hotels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label className="space-y-1">Check-in
        <input name="check_in_time" type="time" defaultValue={(hotel.check_in_time || '14:00').slice(0, 5)} className="w-full" />
      </label>
      <label className="space-y-1">Check-out
        <input name="check_out_time" type="time" defaultValue={(hotel.check_out_time || '12:00').slice(0, 5)} className="w-full" />
      </label>
      <label className="space-y-1">Early / hour
        <input name="early_checkin_hourly_rate" type="number" min="0" step="0.01" defaultValue={Number(hotel.early_checkin_hourly_rate ?? 200)} className="w-full" />
      </label>
      <label className="space-y-1">Late / hour
        <input name="late_checkout_hourly_rate" type="number" min="0" step="0.01" defaultValue={Number(hotel.late_checkout_hourly_rate ?? 200)} className="w-full" />
      </label>
      <button className="btn-secondary md:col-span-5" type="submit">Save hours</button>
    </form>
  );
}
