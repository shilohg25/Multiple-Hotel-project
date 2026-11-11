'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toBeBilledMode } from '@/lib/public-quote';

export function BillingReferenceField({ reservationId, reference }: { reservationId: string; reference: string }) {
  const router = useRouter();
  const [value, setValue] = useState(reference);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = value.trim();
    if (!next) {
      setMessage('An invoice or PO number is required.');
      return;
    }
    if (next === reference) {
      setMessage('That is already the invoice or PO reference.');
      return;
    }
    setLoading(true);
    setMessage('');
    const response = await fetch(`/api/reservations/${reservationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode_of_payment: toBeBilledMode(next) })
    });
    const json = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setMessage(json.error || 'The reference could not be saved.');
      return;
    }
    setMessage('Reference saved.');
    router.refresh();
  }

  return (
    <form onSubmit={save} className="mt-3 space-y-2">
      <label className="block space-y-1">
        Edit invoice/PO reference
        <input className="w-full" value={value} onChange={(event) => setValue(event.target.value)} />
      </label>
      <button className="btn-secondary" type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save reference'}</button>
      {message ? <p className="text-sm text-slate-600">{message}</p> : null}
    </form>
  );
}
