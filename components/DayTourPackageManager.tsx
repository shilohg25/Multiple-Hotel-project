'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DayTourPackage, Hotel, Outlet } from '@/types/app';
import { currency } from '@/lib/money';

export function DayTourPackageManager({
  hotels,
  selectedHotel,
  packages,
  outlets,
  canManage
}: {
  hotels: Hotel[];
  selectedHotel: Hotel;
  packages: DayTourPackage[];
  outlets: Outlet[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  function changeHotel(hotelId: string) {
    router.push(`/day-tours/packages?hotel=${hotelId}`);
  }

  async function createPackage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setMessage('');
    setLoading(true);

    try {
      const response = await fetch('/api/day-tours/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hotel_id: selectedHotel.id,
          name: form.get('name'),
          description: form.get('description'),
          adult_price: Number(form.get('adult_price') || 0),
          child_price: Number(form.get('child_price') || 0),
          capacity_per_day: form.get('capacity_per_day'),
          breakfast_included: form.get('breakfast_included') === 'true',
          lunch_included: form.get('lunch_included') === 'true',
          restaurant_remittance_per_guest: Number(form.get('restaurant_remittance_per_guest') || 0),
          remittance_outlet_id: form.get('remittance_outlet_id') || null,
          active: true
        })
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(json.error || 'Failed to create package.');
        return;
      }
      formElement.reset();
      setMessage('Day tour package created.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to create package.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section className="card overflow-hidden">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-bold">Packages</h2>
            <p className="mt-1 text-sm text-slate-500">Secured day tour bookings count against package capacity.</p>
          </div>
          <select value={selectedHotel.id} onChange={(event) => changeHotel(event.target.value)}>
            {hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Package</th>
                <th className="px-5 py-3">Adult</th>
                <th className="px-5 py-3">Child</th>
                <th className="px-5 py-3">Capacity</th>
                <th className="px-5 py-3">Meals</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {packages.map((item) => (
                <tr key={item.id}>
                  <td className="px-5 py-3">
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-xs text-slate-500">{item.description || '-'}</p>
                  </td>
                  <td className="px-5 py-3">{currency(item.adult_price, selectedHotel.default_currency)}</td>
                  <td className="px-5 py-3">{currency(item.child_price, selectedHotel.default_currency)}</td>
                  <td className="px-5 py-3">{item.capacity_per_day || 'No cap'}</td>
                  <td className="px-5 py-3 text-slate-600">{[item.breakfast_included ? 'Breakfast' : '', item.lunch_included ? 'Lunch' : ''].filter(Boolean).join(', ') || '-'}</td>
                  <td className="px-5 py-3">{item.active ? 'Active' : 'Inactive'}</td>
                </tr>
              ))}
              {!packages.length ? <tr><td className="px-5 py-6 text-slate-500" colSpan={6}>No day tour packages yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-bold">Create package</h2>
        {message ? <div className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm">{message}</div> : null}
        {!canManage ? <p className="mt-3 text-sm text-slate-500">Owner or manager access is required.</p> : null}
        {canManage ? (
          <form onSubmit={createPackage} className="mt-4 space-y-4">
            <div className="space-y-2">
              <label>Name</label>
              <input name="name" required className="w-full" />
            </div>
            <div className="space-y-2">
              <label>Description</label>
              <textarea name="description" rows={2} className="w-full" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label>Adult price</label>
                <input name="adult_price" type="number" min="0" step="0.01" defaultValue="0" className="w-full" />
              </div>
              <div className="space-y-2">
                <label>Child price</label>
                <input name="child_price" type="number" min="0" step="0.01" defaultValue="0" className="w-full" />
              </div>
            </div>
            <div className="space-y-2">
              <label>Capacity per day</label>
              <input name="capacity_per_day" type="number" min="1" className="w-full" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input name="breakfast_included" type="checkbox" value="true" />
                Breakfast
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input name="lunch_included" type="checkbox" value="true" />
                Lunch
              </label>
            </div>
            <div className="space-y-2">
              <label>Remittance per guest</label>
              <input name="restaurant_remittance_per_guest" type="number" min="0" step="0.01" defaultValue="0" className="w-full" />
            </div>
            <div className="space-y-2">
              <label>Remittance outlet</label>
              <select name="remittance_outlet_id" className="w-full">
                <option value="">None</option>
                {outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
              </select>
            </div>
            <button className="btn-primary w-full" type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create package'}</button>
          </form>
        ) : null}
      </section>
    </div>
  );
}
