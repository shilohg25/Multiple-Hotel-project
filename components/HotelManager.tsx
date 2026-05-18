'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Hotel, Role } from '@/types/app';
import { currency } from '@/lib/money';
import { downpaymentLabel } from '@/lib/downpayment';
import { slugify } from '@/lib/slug';

export type HotelRoomCount = {
  hotel_id: string;
  total: number;
  active: number;
  inactive: number;
};

export function HotelManager({
  hotels,
  role,
  roomCounts
}: {
  hotels: Hotel[];
  role: Role;
  roomCounts: HotelRoomCount[];
}) {
  const router = useRouter();
  const countByHotel = new Map(roomCounts.map((count) => [count.hotel_id, count]));
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [downpaymentType, setDownpaymentType] = useState('percent');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const previewSlug = slugify(slug || name);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setMessage('');
    setLoading(true);
    const form = new FormData(formElement);
    const response = await fetch('/api/hotels', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(form.entries())),
      headers: { 'Content-Type': 'application/json' }
    });
    setLoading(false);
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(json.error || 'Failed to save hotel');
      return;
    }
    if (json.hotel?.id) {
      router.push(`/rooms?hotel=${json.hotel.id}&focus=add`);
      router.refresh();
      return;
    }
    formElement.reset();
    setDownpaymentType('percent');
    setName('');
    setSlug('');
    setMessage('Hotel saved. Next step: add rooms/units for this hotel.');
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold">Hotels / Properties</h2>
          <p className="mt-1 text-sm text-slate-500">Each active property needs at least one active room/unit before it can accept reservations.</p>
        </div>
        <div className="divide-y divide-slate-100">
          {hotels.map((hotel) => {
            const counts = countByHotel.get(hotel.id) || { hotel_id: hotel.id, total: 0, active: 0, inactive: 0 };
            const setupNeeded = counts.active === 0;

            return (
              <div key={hotel.id} className="px-5 py-4">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold">{hotel.name}</p>
                      <span className={`rounded-full px-2 py-1 text-xs font-bold ${hotel.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {hotel.active ? 'Active' : 'Inactive'}
                      </span>
                      <span className={`rounded-full px-2 py-1 text-xs font-bold ${setupNeeded ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
                        {setupNeeded ? 'Setup needed' : 'Ready'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500">
                      /{hotel.slug} - {downpaymentLabel(hotel.downpayment_type)}
                      {hotel.downpayment_type === 'percent' ? ` ${hotel.default_downpayment_percent}%` : ''}
                      {hotel.downpayment_type === 'fixed' ? ` ${currency(hotel.default_downpayment_amount, hotel.default_currency)}` : ''}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">{hotel.address || 'Address not set'} - {hotel.contact_phone || 'Phone not set'}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-700">
                      Rooms / Units: {counts.active} active, {counts.inactive} inactive, {counts.total} total
                    </p>
                    {setupNeeded ? (
                      <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                        No rooms/units yet. Add at least one room/unit before creating reservations.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <a href={`/rooms?hotel=${hotel.id}`} className="btn-secondary">Manage rooms/units</a>
                    <a href={`/rooms?hotel=${hotel.id}&focus=add`} className={setupNeeded ? 'btn-primary' : 'btn-secondary'}>{setupNeeded ? 'Add first room/unit' : 'Add rooms/units'}</a>
                    <a href={`/settings/pricing?hotel=${hotel.id}`} className="btn-secondary">Room pricing</a>
                    <a href={`/book/${hotel.slug}`} className="btn-secondary" title={setupNeeded ? 'Public booking is not useful until rooms/units exist.' : undefined}>Open public page</a>
                  </div>
                </div>
              </div>
            );
          })}
          {!hotels.length ? <p className="px-5 py-6 text-sm text-slate-500">No hotels/properties yet.</p> : null}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-bold">Add hotel/property</h2>
        <p className="mt-1 text-sm text-slate-500">Only owners can create hotels/properties. Add rooms/units after saving the property.</p>
        {role !== 'owner' ? (
          <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Owner access is required to add hotels/properties.</div>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            {message ? <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm">{message}</div> : null}
            <div className="space-y-2">
              <label>Name</label>
              <input name="name" required value={name} onChange={(event) => setName(event.target.value)} className="w-full" />
            </div>
            <div className="space-y-2">
              <label>Slug</label>
              <input name="slug" placeholder="example-hotel" value={slug} onChange={(event) => setSlug(event.target.value)} className="w-full" />
              <p className="text-xs text-slate-500">Leave blank to auto-create from hotel name. Slug is used in the public booking URL.</p>
              <p className="text-xs font-semibold text-slate-600">Public booking URL: /book/{previewSlug || 'hotel-slug'}</p>
            </div>
            <div className="space-y-2">
              <label>Address <span className="text-slate-400">optional</span></label>
              <textarea name="address" rows={2} className="w-full" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label>Contact email <span className="text-slate-400">optional</span></label>
                <input name="contact_email" type="email" className="w-full" />
              </div>
              <div className="space-y-2">
                <label>Booking email <span className="text-slate-400">optional</span></label>
                <input name="booking_email" type="email" className="w-full" />
              </div>
              <div className="space-y-2">
                <label>Phone <span className="text-slate-400">optional</span></label>
                <input name="contact_phone" className="w-full" />
              </div>
              <div className="space-y-2">
                <label>Website <span className="text-slate-400">optional</span></label>
                <input name="website_url" placeholder="https://" className="w-full" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label>Check-in time <span className="text-slate-400">optional</span></label>
                <input name="check_in_time" type="time" className="w-full" />
              </div>
              <div className="space-y-2">
                <label>Check-out time <span className="text-slate-400">optional</span></label>
                <input name="check_out_time" type="time" className="w-full" />
              </div>
            </div>
            <div className="space-y-2">
              <label>Down payment rule</label>
              <select name="downpayment_type" className="w-full" value={downpaymentType} onChange={(event) => setDownpaymentType(event.target.value)}>
                <option value="percent">Percentage of booking total</option>
                <option value="fixed">Fixed amount</option>
                <option value="first_night">First-night room rate</option>
                <option value="manual">Manual amount per booking</option>
              </select>
            </div>
            {downpaymentType === 'percent' ? (
              <div className="space-y-2">
                <label>Default down payment %</label>
                <input name="default_downpayment_percent" type="number" min="0" max="100" step="1" defaultValue="50" className="w-full" />
              </div>
            ) : null}
            {downpaymentType === 'fixed' ? (
              <div className="space-y-2">
                <label>Default fixed down payment amount</label>
                <input name="default_downpayment_amount" type="number" min="0" step="0.01" defaultValue="0" className="w-full" />
              </div>
            ) : null}
            <div className="space-y-2">
              <label>Description <span className="text-slate-400">optional</span></label>
              <textarea name="description" rows={2} className="w-full" />
            </div>
            <div className="space-y-2">
              <label>House rules <span className="text-slate-400">can be updated later</span></label>
              <textarea name="house_rules" rows={4} className="w-full" />
            </div>
            <div className="space-y-2">
              <label>Booking terms <span className="text-slate-400">optional</span></label>
              <textarea name="booking_terms" rows={3} className="w-full" />
            </div>
            <button className="btn-primary w-full" disabled={loading} type="submit">{loading ? 'Saving...' : 'Save hotel/property'}</button>
          </form>
        )}
      </section>
    </div>
  );
}
