'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Hotel, Role } from '@/types/app';

export function HotelManager({ hotels, role }: { hotels: Hotel[]; role: Role }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/hotels', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(form.entries())),
      headers: { 'Content-Type': 'application/json' }
    });
    setLoading(false);
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      setMessage(json.error || 'Failed to save hotel');
      return;
    }
    event.currentTarget.reset();
    setMessage('Hotel saved.');
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold">Hotels</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {hotels.map((hotel) => (
            <div key={hotel.id} className="px-5 py-4">
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                <div>
                  <p className="font-bold">{hotel.name}</p>
                  <p className="text-sm text-slate-500">/{hotel.slug} · down payment {hotel.default_downpayment_percent}%</p>
                  <p className="mt-1 text-sm text-slate-500">{hotel.address || 'No address set'}</p>
                </div>
                <a href={`/book/${hotel.slug}`} className="btn-secondary">Open public page</a>
              </div>
            </div>
          ))}
          {!hotels.length ? <p className="px-5 py-6 text-sm text-slate-500">No hotels yet.</p> : null}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-bold">Add hotel</h2>
        <p className="mt-1 text-sm text-slate-500">Only owners should create hotels. Managers can still view assigned hotel data.</p>
        {role !== 'owner' ? (
          <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Owner access is required to add hotels.</div>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            {message ? <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm">{message}</div> : null}
            <div className="space-y-2">
              <label>Name</label>
              <input name="name" required className="w-full" />
            </div>
            <div className="space-y-2">
              <label>Slug</label>
              <input name="slug" placeholder="example-hotel" className="w-full" />
            </div>
            <div className="space-y-2">
              <label>Address</label>
              <textarea name="address" rows={2} className="w-full" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label>Contact email</label>
                <input name="contact_email" type="email" className="w-full" />
              </div>
              <div className="space-y-2">
                <label>Phone</label>
                <input name="contact_phone" className="w-full" />
              </div>
            </div>
            <div className="space-y-2">
              <label>Default down payment %</label>
              <input name="default_downpayment_percent" type="number" min="0" max="100" step="1" defaultValue="50" className="w-full" />
            </div>
            <div className="space-y-2">
              <label>House rules</label>
              <textarea name="house_rules" rows={4} className="w-full" />
            </div>
            <button className="btn-primary w-full" disabled={loading} type="submit">{loading ? 'Saving...' : 'Save hotel'}</button>
          </form>
        )}
      </section>
    </div>
  );
}
