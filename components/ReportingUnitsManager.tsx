'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Hotel, Outlet, Role } from '@/types/app';

export function ReportingUnitsManager({ hotels, outlets, role }: { hotels: Hotel[]; outlets: Outlet[]; role: Role }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  async function save(url: string, body: Record<string, unknown>) {
    setSaving(url);
    setMessage('');
    const response = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const json = await response.json().catch(() => ({}));
    setSaving(null);
    if (!response.ok) {
      setMessage(json.error || 'Could not save.');
      return;
    }
    setMessage('Saved.');
    router.refresh();
  }

  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="text-lg font-bold">Reporting units</h2>
        <p className="mt-1 text-sm text-slate-500">
          Monthly totals use these units. Navarro and Sotera Café are separate. Tagosilangan and Tago Resto are separate. Older restaurant rows are left in place.
        </p>
      </div>
      {message ? <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm">{message}</p> : null}
      {role !== 'owner' ? <p className="text-sm text-slate-500">Only an owner can edit legal names.</p> : null}
      <div className="space-y-4">
        {hotels.map((hotel) => {
          const hotelOutlets = outlets.filter((outlet) => outlet.hotel_id === hotel.id);
          return (
            <div key={hotel.id} className="rounded-xl border border-slate-200 p-4">
              <form
                className="grid gap-3 md:grid-cols-[1fr_1fr_auto]"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  save(`/api/hotels/${hotel.id}`, {
                    legal_name: form.get('legal_name'),
                    is_reporting_unit: form.get('is_reporting_unit') === 'on'
                  });
                }}
              >
                <div>
                  <p className="font-bold">{hotel.name}</p>
                  <p className="text-xs text-slate-500">Property · {hotel.timezone || 'Asia/Manila'}</p>
                </div>
                <label className="space-y-1">
                  Legal name
                  <input name="legal_name" defaultValue={hotel.legal_name || ''} className="w-full" disabled={role !== 'owner'} />
                </label>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input name="is_reporting_unit" type="checkbox" defaultChecked={hotel.is_reporting_unit !== false} disabled={role !== 'owner'} />
                  Reporting unit
                </label>
                {role === 'owner' ? <button className="btn-secondary md:col-span-3" disabled={saving === `/api/hotels/${hotel.id}`} type="submit">Save property</button> : null}
              </form>
              <div className="mt-4 space-y-3">
                {hotelOutlets.map((outlet) => (
                  <form
                    key={outlet.id}
                    className="grid gap-3 rounded-lg bg-slate-50 p-3 md:grid-cols-[1fr_1fr_auto]"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      save(`/api/outlets/${outlet.id}`, {
                        name: form.get('name'),
                        legal_name: form.get('legal_name'),
                        is_reporting_unit: form.get('is_reporting_unit') === 'on'
                      });
                    }}
                  >
                    <label className="space-y-1">
                      Outlet
                      <input name="name" defaultValue={outlet.name} className="w-full" disabled={role !== 'owner'} />
                    </label>
                    <label className="space-y-1">
                      Legal name
                      <input name="legal_name" defaultValue={outlet.legal_name || ''} className="w-full" disabled={role !== 'owner'} />
                    </label>
                    <label className="flex items-end gap-2 pb-2 text-sm">
                      <input name="is_reporting_unit" type="checkbox" defaultChecked={Boolean(outlet.is_reporting_unit)} disabled={role !== 'owner'} />
                      Reporting unit
                    </label>
                    {role === 'owner' ? <button className="btn-secondary md:col-span-3" type="submit">Save outlet</button> : null}
                  </form>
                ))}
                {!hotelOutlets.length ? <p className="text-sm text-slate-500">No outlets for this property yet.</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
