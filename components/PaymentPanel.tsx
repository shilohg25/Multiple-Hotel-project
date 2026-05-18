'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Payment } from '@/types/app';
import { currency } from '@/lib/money';
import { queueOfflineItem } from '@/lib/offline/db';
import { PaymentStatusBadge } from './StatusBadge';

type PaymentWithUrl = Payment & { proof_url?: string | null };
const maxOfflineProofSize = 10 * 1024 * 1024;

export function PaymentPanel({
  reservationId,
  payments,
  currencyCode = 'PHP',
  canConfirm
}: {
  reservationId: string;
  payments: PaymentWithUrl[];
  currencyCode?: string;
  canConfirm: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [offlineDraft, setOfflineDraft] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const confirmedTotal = payments.filter((payment) => payment.status === 'confirmed').reduce((sum, payment) => sum + Number(payment.amount), 0);

  async function uploadPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formElement = event.currentTarget;

    setMessage('');
    setLoading(true);

    try {
      const form = new FormData(formElement);
      form.set('reservation_id', reservationId);

      const response = await fetch('/api/payments', {
        method: 'POST',
        body: form
      });

      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(json.error || 'Payment upload failed');
        return;
      }

      formElement.reset();
      setMessage('Payment proof submitted for confirmation. Dates are still not blocked until payment is confirmed.');
      router.refresh();
    } catch (error) {
      const form = new FormData(formElement);
      form.set('reservation_id', reservationId);
      setOfflineDraft(Object.fromEntries(form.entries()));
      setMessage('Network unavailable. You can save this proof locally and sync it later; it will still require staff confirmation online.');
    } finally {
      setLoading(false);
    }
  }

  async function saveOfflineDraft() {
    if (!offlineDraft) return;
    const proof = offlineDraft.proof;
    if (!(proof instanceof File) || proof.size === 0) {
      setMessage('Payment proof file is required before saving an offline payment draft.');
      return;
    }
    if (proof.size > maxOfflineProofSize) {
      setMessage('Payment proof is too large for offline storage. Maximum size is 10 MB.');
      return;
    }

    setLoading(true);
    try {
      await queueOfflineItem('payment_draft', {
        ...offlineDraft,
        proof,
        proofName: proof.name
      });
      setOfflineDraft(null);
      setMessage('Saved locally. Sync when internet returns. Offline payment drafts are submitted only; they are never auto-confirmed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save offline payment draft.');
    } finally {
      setLoading(false);
    }
  }

  async function confirmPayment(id: string) {
    setMessage('Confirming payment...');
    const response = await fetch(`/api/payments/${id}/confirm`, { method: 'PATCH' });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(json.error || 'Payment confirmation failed');
      return;
    }
    setMessage('Payment confirmed. If the down payment requirement is met, the booking is now secured and blocks the room dates. Use the email draft panel to send the confirmation email.');
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold">Payment proofs</h2>
          <p className="mt-1 text-sm text-slate-500">Confirmed total: {currency(confirmedTotal, currencyCode)}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Amount</th>
                <th className="px-5 py-3">Method</th>
                <th className="px-5 py-3">Details</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Proof</th>
                <th className="px-5 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="px-5 py-3 font-semibold">{currency(payment.amount, currencyCode)}</td>
                  <td className="px-5 py-3 capitalize text-slate-600">{payment.method.replaceAll('_', ' ')}</td>
                  <td className="px-5 py-3 text-slate-600">
                    <div className="max-w-xs truncate" title={payment.payment_details}>{payment.payment_details}</div>
                    {payment.payment_reference ? <div className="text-xs text-slate-400">Ref: {payment.payment_reference}</div> : null}
                  </td>
                  <td className="px-5 py-3"><PaymentStatusBadge status={payment.status} /></td>
                  <td className="px-5 py-3">
                    {payment.proof_url ? <a href={payment.proof_url} target="_blank" className="text-sm font-semibold text-slate-900 underline">View proof</a> : <span className="text-slate-500">Unavailable</span>}
                  </td>
                  <td className="px-5 py-3">
                    {payment.status === 'submitted' && canConfirm ? (
                      <div className="flex flex-wrap gap-2">
                        <button className="btn-primary" type="button" onClick={() => void confirmPayment(payment.id)}>Confirm</button>
                        <a className="btn-secondary print-hidden" href={`/print/payments/${payment.id}/receipt`}>Print Submission</a>
                      </div>
                    ) : (
                      <a className="btn-secondary print-hidden" href={`/print/payments/${payment.id}/receipt`}>
                        {payment.status === 'confirmed' ? 'Print Payment Acknowledgement' : 'Print Payment Submission'}
                      </a>
                    )}
                  </td>
                </tr>
              ))}
              {!payments.length ? <tr><td colSpan={6} className="px-5 py-6 text-slate-500">No payment proofs uploaded yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-bold">Add payment proof</h2>
        <p className="mt-1 text-sm text-slate-500">Proof and payment details are mandatory. The booking remains tentative until payment is confirmed.</p>
        {message ? <div className="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-sm">{message}</div> : null}
        <form onSubmit={uploadPayment} className="mt-4 space-y-4">
          <div className="space-y-2">
            <label>Amount received</label>
            <input name="amount" type="number" min="1" step="0.01" required className="w-full" />
          </div>
          <div className="space-y-2">
            <label>Payment method</label>
            <select name="method" className="w-full">
              <option value="cash">Cash</option>
              <option value="gcash">GCash</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="card">Card / swipe</option>
              <option value="online_gateway">Online payment gateway</option>
              <option value="booking_dot_com">Booking.com</option>
              <option value="trip_dot_com">Trip.com</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="space-y-2">
            <label>Payer name <span className="text-slate-400">optional</span></label>
            <input name="payer_name" className="w-full" />
          </div>
          <div className="space-y-2">
            <label>Reference number <span className="text-slate-400">optional</span></label>
            <input name="payment_reference" className="w-full" />
          </div>
          <div className="space-y-2">
            <label>Payment information / notes</label>
            <textarea name="payment_details" rows={3} required className="w-full" placeholder="Reference, sender, date/time paid, or cashier notes." />
          </div>
          <div className="space-y-2">
            <label>Payment proof</label>
            <input name="proof" type="file" accept="image/*,application/pdf" required className="w-full" />
          </div>
          <button className="btn-primary w-full" type="submit" disabled={loading}>{loading ? 'Uploading...' : 'Submit proof'}</button>
          {offlineDraft ? (
            <button className="btn-secondary w-full" type="button" disabled={loading} onClick={() => void saveOfflineDraft()}>
              Save offline payment draft
            </button>
          ) : null}
        </form>
      </section>
    </div>
  );
}
