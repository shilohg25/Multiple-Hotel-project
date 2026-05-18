'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Hotel, ServiceItem } from '@/types/app';
import { currency } from '@/lib/money';
import { serviceCategoryOptions } from '@/lib/service-categories';

type ServiceDraft = {
  name: string;
  category: string;
  default_price: string;
  description: string;
  remittance_required: boolean;
  remittance_note: string;
  active: boolean;
};

function draftFromService(item: ServiceItem): ServiceDraft {
  return {
    name: item.name || '',
    category: item.category || 'other',
    default_price: String(Number(item.default_price || 0)),
    description: item.description || '',
    remittance_required: Boolean(item.remittance_required),
    remittance_note: item.remittance_note || '',
    active: Boolean(item.active)
  };
}

export function ServiceCatalogManager({ hotels, serviceItems }: { hotels: Hotel[]; serviceItems: ServiceItem[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedHotelId = searchParams.get('hotel') || hotels[0]?.id || '';
  const selectedHotel = hotels.find((hotel) => hotel.id === selectedHotelId) || hotels[0];
  const visibleItems = useMemo(
    () => serviceItems.filter((item) => item.hotel_id === selectedHotel?.id),
    [selectedHotel?.id, serviceItems]
  );
  const [drafts, setDrafts] = useState<Record<string, ServiceDraft>>(() =>
    Object.fromEntries(serviceItems.map((item) => [item.id, draftFromService(item)]))
  );
  const [message, setMessage] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createCategory, setCreateCategory] = useState('other');
  const [createRemittance, setCreateRemittance] = useState(false);
  const [createActive, setCreateActive] = useState(true);

  function changeHotel(hotelId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('hotel', hotelId);
    router.push(`/settings/services?${params.toString()}`);
  }

  function updateDraft(item: ServiceItem, key: keyof ServiceDraft, value: string | boolean) {
    setDrafts((current) => ({
      ...current,
      [item.id]: {
        ...(current[item.id] || draftFromService(item)),
        [key]: value
      }
    }));
  }

  async function createService(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedHotel) return;

    const formElement = event.currentTarget;
    setMessage('');
    setCreating(true);

    try {
      const form = new FormData(formElement);
      const response = await fetch('/api/settings/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hotel_id: selectedHotel.id,
          name: form.get('name'),
          category: createCategory,
          default_price: Number(form.get('default_price') || 0),
          description: form.get('description'),
          remittance_required: createRemittance,
          remittance_note: form.get('remittance_note'),
          active: createActive
        })
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(json.error || 'Failed to create service item.');
        return;
      }

      formElement.reset();
      setCreateCategory('other');
      setCreateRemittance(false);
      setCreateActive(true);
      setMessage('Service item created.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to create service item.');
    } finally {
      setCreating(false);
    }
  }

  async function saveService(item: ServiceItem) {
    const draft = drafts[item.id] || draftFromService(item);
    setMessage('');
    setSavingId(item.id);

    try {
      const response = await fetch(`/api/settings/services/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name,
          category: draft.category,
          default_price: Number(draft.default_price || 0),
          description: draft.description,
          remittance_required: draft.remittance_required,
          remittance_note: draft.remittance_note,
          active: draft.active
        })
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(json.error || 'Failed to save service item.');
        return;
      }
      setDrafts((current) => ({
        ...current,
        [item.id]: draftFromService(json.service_item as ServiceItem)
      }));
      setMessage('Service item saved.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save service item.');
    } finally {
      setSavingId(null);
    }
  }

  if (!selectedHotel) {
    return <div className="card p-6 text-sm text-slate-500">Add an active hotel before managing service items.</div>;
  }

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_260px] md:items-end">
          <div>
            <h2 className="text-lg font-bold">Services & Charges</h2>
            <p className="mt-1 text-sm text-slate-500">
              &ldquo;Changing default service price affects new charges only. Existing reservation charges keep their saved unit price.&rdquo;
            </p>
          </div>
          <div className="space-y-2">
            <label>Hotel</label>
            <select value={selectedHotel.id} onChange={(event) => changeHotel(event.target.value)} className="w-full">
              {hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}
            </select>
          </div>
        </div>
      </section>

      {message ? <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</div> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <section className="card overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-bold">Catalog</h2>
            <p className="mt-1 text-sm text-slate-500">Services are hotel-specific. Remittance fields are ready for future restaurant and breakfast settlement.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {visibleItems.map((item) => {
              const draft = drafts[item.id] || draftFromService(item);
              return (
                <form key={item.id} className="grid gap-3 px-5 py-4 lg:grid-cols-6 lg:items-end" onSubmit={(event) => { event.preventDefault(); void saveService(item); }}>
                  <div className="space-y-2 lg:col-span-2">
                    <label>Name</label>
                    <input value={draft.name} onChange={(event) => updateDraft(item, 'name', event.target.value)} className="w-full" />
                  </div>
                  <div className="space-y-2">
                    <label>Category</label>
                    <select value={draft.category} onChange={(event) => updateDraft(item, 'category', event.target.value)} className="w-full">
                      {serviceCategoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label>Default price</label>
                    <input value={draft.default_price} onChange={(event) => updateDraft(item, 'default_price', event.target.value)} type="number" min="0" step="0.01" className="w-full" />
                    <p className="text-xs text-slate-500">{currency(item.default_price, selectedHotel.default_currency)}</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={draft.active} onChange={(event) => updateDraft(item, 'active', event.target.checked)} />
                    Active
                  </label>
                  <div>
                    <button className="btn-primary w-full" type="submit" disabled={savingId === item.id}>{savingId === item.id ? 'Saving...' : 'Save'}</button>
                  </div>
                  <div className="space-y-2 lg:col-span-3">
                    <label>Description</label>
                    <input value={draft.description} onChange={(event) => updateDraft(item, 'description', event.target.value)} className="w-full" />
                  </div>
                  <label className="flex items-center gap-2 text-sm lg:col-span-1">
                    <input type="checkbox" checked={draft.remittance_required} onChange={(event) => updateDraft(item, 'remittance_required', event.target.checked)} />
                    Remit
                  </label>
                  <div className="space-y-2 lg:col-span-2">
                    <label>Remittance note</label>
                    <input value={draft.remittance_note} onChange={(event) => updateDraft(item, 'remittance_note', event.target.value)} className="w-full" />
                  </div>
                </form>
              );
            })}
            {!visibleItems.length ? <p className="px-5 py-6 text-sm text-slate-500">No service items for this hotel yet.</p> : null}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-lg font-bold">Create service</h2>
          <form onSubmit={createService} className="mt-4 space-y-4">
            <div className="space-y-2">
              <label>Name</label>
              <input name="name" required className="w-full" />
            </div>
            <div className="space-y-2">
              <label>Category</label>
              <select value={createCategory} onChange={(event) => setCreateCategory(event.target.value)} className="w-full">
                {serviceCategoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label>Default price</label>
              <input name="default_price" type="number" min="0" step="0.01" defaultValue="0" className="w-full" />
            </div>
            <div className="space-y-2">
              <label>Description</label>
              <textarea name="description" rows={2} className="w-full" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={createRemittance} onChange={(event) => setCreateRemittance(event.target.checked)} />
              Remittance required
            </label>
            <div className="space-y-2">
              <label>Remittance note</label>
              <textarea name="remittance_note" rows={2} className="w-full" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={createActive} onChange={(event) => setCreateActive(event.target.checked)} />
              Active
            </label>
            <button className="btn-primary w-full" type="submit" disabled={creating}>{creating ? 'Creating...' : 'Create service'}</button>
          </form>
        </section>
      </div>
    </div>
  );
}
