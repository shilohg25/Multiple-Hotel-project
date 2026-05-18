'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ReservationCharge, ServiceItem } from '@/types/app';
import { currency } from '@/lib/money';
import { serviceCategoryOptions } from '@/lib/service-categories';

export function ReservationFolio({
  reservationId,
  currencyCode,
  roomTotal,
  confirmedPaymentsTotal,
  charges,
  serviceItems,
  canAdd,
  canDelete
}: {
  reservationId: string;
  currencyCode: string;
  roomTotal: number;
  confirmedPaymentsTotal: number;
  charges: ReservationCharge[];
  serviceItems: ServiceItem[];
  canAdd: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const activeServices = useMemo(() => serviceItems.filter((item) => item.active), [serviceItems]);
  const [serviceItemId, setServiceItemId] = useState(activeServices[0]?.id || '');
  const selectedService = useMemo(
    () => activeServices.find((item) => item.id === serviceItemId) || activeServices[0],
    [activeServices, serviceItemId]
  );
  const [description, setDescription] = useState(selectedService?.name || '');
  const [category, setCategory] = useState(selectedService?.category || 'other');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState(String(Number(selectedService?.default_price || 0)));
  const [remittanceRequired, setRemittanceRequired] = useState(Boolean(selectedService?.remittance_required));
  const [remittanceNote, setRemittanceNote] = useState(selectedService?.remittance_note || '');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const chargesSubtotal = charges.reduce((sum, charge) => sum + Number(charge.total_amount || 0), 0);
  const displayTotal = Number(roomTotal || 0) + chargesSubtotal;
  const balance = displayTotal - Number(confirmedPaymentsTotal || 0);
  const draftTotal = Math.round(Number(quantity || 0) * Number(unitPrice || 0) * 100) / 100;

  useEffect(() => {
    if (!selectedService) return;
    setServiceItemId(selectedService.id);
    setDescription(selectedService.name);
    setCategory(selectedService.category || 'other');
    setUnitPrice(String(Number(selectedService.default_price || 0)));
    setRemittanceRequired(Boolean(selectedService.remittance_required));
    setRemittanceNote(selectedService.remittance_note || '');
  }, [selectedService]);

  async function addCharge(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setMessage('');
    setLoading(true);

    try {
      const response = await fetch(`/api/reservations/${reservationId}/charges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_item_id: serviceItemId,
          description,
          category,
          quantity: Number(quantity || 1),
          unit_price: Number(unitPrice || 0),
          remittance_required: remittanceRequired,
          remittance_note: remittanceNote,
          notes
        })
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(json.error || 'Failed to add charge.');
        return;
      }

      formElement.reset();
      setQuantity('1');
      setNotes('');
      setMessage('Charge added to folio.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to add charge.');
    } finally {
      setLoading(false);
    }
  }

  async function deleteCharge(chargeId: string) {
    if (!window.confirm('Delete this charge from the reservation folio?')) return;
    setMessage('');
    setDeletingId(chargeId);

    try {
      const response = await fetch(`/api/reservations/${reservationId}/charges/${chargeId}`, { method: 'DELETE' });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(json.error || 'Failed to delete charge.');
        return;
      }
      setMessage('Charge deleted.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to delete charge.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-lg font-bold">Charges / Folio</h2>
        <p className="mt-1 text-sm text-slate-500">Additional services are displayed separately from the saved room reservation total.</p>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Qty</th>
                  <th className="px-4 py-3">Unit price</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Notes</th>
                  {canDelete ? <th className="px-4 py-3">Action</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {charges.map((charge) => (
                  <tr key={charge.id}>
                    <td className="px-4 py-3 font-semibold">
                      {charge.description}
                      {charge.remittance_required ? <p className="text-xs font-normal text-amber-700">Remittance required</p> : null}
                    </td>
                    <td className="px-4 py-3 capitalize text-slate-600">{charge.category.replaceAll('_', ' ')}</td>
                    <td className="px-4 py-3 text-slate-600">{Number(charge.quantity || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-slate-600">{currency(charge.unit_price, currencyCode)}</td>
                    <td className="px-4 py-3 font-semibold">{currency(charge.total_amount, currencyCode)}</td>
                    <td className="px-4 py-3 text-slate-600">{charge.notes || '-'}</td>
                    {canDelete ? (
                      <td className="px-4 py-3">
                        <button className="btn-secondary" type="button" disabled={deletingId === charge.id} onClick={() => void deleteCharge(charge.id)}>
                          {deletingId === charge.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
                {!charges.length ? (
                  <tr>
                    <td className="px-4 py-6 text-slate-500" colSpan={canDelete ? 7 : 6}>No additional charges yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <SummaryItem label="Room total" value={currency(roomTotal, currencyCode)} />
            <SummaryItem label="Additional charges" value={currency(chargesSubtotal, currencyCode)} />
            <SummaryItem label="Confirmed payments" value={currency(confirmedPaymentsTotal, currencyCode)} />
            <SummaryItem label="Total balance" value={currency(balance, currencyCode)} />
          </div>
          <p className="text-sm text-slate-500">Display total: {currency(displayTotal, currencyCode)}</p>
        </div>

        <div>
          <h3 className="text-base font-bold">Add charge</h3>
          {message ? <div className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</div> : null}
          {!canAdd ? <p className="mt-3 text-sm text-slate-500">You do not have permission to add reservation charges.</p> : null}
          {canAdd && !activeServices.length ? <p className="mt-3 text-sm text-slate-500">No active service items are available for this hotel.</p> : null}
          {canAdd && activeServices.length ? (
            <form onSubmit={addCharge} className="mt-4 space-y-4">
              <div className="space-y-2">
                <label>Service item</label>
                <select value={selectedService?.id || ''} onChange={(event) => setServiceItemId(event.target.value)} className="w-full">
                  {activeServices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label>Description</label>
                <input value={description} onChange={(event) => setDescription(event.target.value)} required className="w-full" />
              </div>
              <div className="space-y-2">
                <label>Category</label>
                <select value={category} onChange={(event) => setCategory(event.target.value)} className="w-full">
                  {serviceCategoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label>Quantity</label>
                  <input value={quantity} onChange={(event) => setQuantity(event.target.value)} type="number" min="0.01" step="0.01" required className="w-full" />
                </div>
                <div className="space-y-2">
                  <label>Unit price</label>
                  <input value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} type="number" min="0" step="0.01" required className="w-full" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={remittanceRequired} onChange={(event) => setRemittanceRequired(event.target.checked)} />
                Remittance required
              </label>
              <div className="space-y-2">
                <label>Remittance note</label>
                <textarea value={remittanceNote} onChange={(event) => setRemittanceNote(event.target.value)} rows={2} className="w-full" />
              </div>
              <div className="space-y-2">
                <label>Notes</label>
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} className="w-full" />
              </div>
              <div className="rounded-lg bg-slate-50 p-3 text-sm">
                <span className="text-slate-500">Charge total</span>
                <span className="ml-2 font-bold">{currency(draftTotal, currencyCode)}</span>
              </div>
              <button className="btn-primary w-full" type="submit" disabled={loading}>{loading ? 'Adding...' : 'Add charge'}</button>
            </form>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-bold">{value}</p>
    </div>
  );
}
