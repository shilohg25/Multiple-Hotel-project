'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Role } from '@/types/app';
import { currency } from '@/lib/money';
import { formatHotelTime, hourlyCharge } from '@/lib/stay-hours';

export type StayTimeRequest = {
  id: string;
  kind: string;
  hours: number;
  hourly_rate: number;
  reason: string;
  status: string;
};

export function StayHoursPanel({
  reservationId,
  role,
  checkInTime,
  checkOutTime,
  earlyRate,
  lateRate,
  currencyCode,
  requests
}: {
  reservationId: string;
  role: Role;
  checkInTime: string | null;
  checkOutTime: string | null;
  earlyRate: number;
  lateRate: number;
  currencyCode: string;
  requests: StayTimeRequest[];
}) {
  const router = useRouter();
  const manager = role === 'owner' || role === 'manager';
  const [message, setMessage] = useState('');
  const checkInLabel = formatHotelTime(checkInTime, '14:00');
  const checkOutLabel = formatHotelTime(checkOutTime, '12:00');

  async function requestCharge(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/stay-time-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reservation_id: reservationId,
        kind: form.get('kind'),
        hours: Number(form.get('hours')),
        reason: form.get('reason')
      })
    });
    const json = await response.json().catch(() => ({}));
    setMessage(response.ok ? 'Sent to a manager for approval.' : json.error || 'Could not send the request.');
    if (response.ok) router.refresh();
  }

  async function review(id: string, status: 'approved' | 'rejected', reviewNote: string) {
    const response = await fetch(`/api/stay-time-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, review_note: reviewNote })
    });
    const json = await response.json().catch(() => ({}));
    setMessage(response.ok ? 'Decision saved. An approved charge is on the folio.' : json.error || 'Could not save the decision.');
    if (response.ok) router.refresh();
  }

  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="text-lg font-bold">Check-in and check-out times</h2>
        <p className="mt-1 text-sm text-slate-600">Standard check-in is {checkInLabel}. Standard check-out is {checkOutLabel === '12:00 PM' ? '12:00 noon' : checkOutLabel}.</p>
        <p className="mt-1 text-sm text-slate-500">Early check-in is {currency(earlyRate, currencyCode)} per hour. Late check-out is {currency(lateRate, currencyCode)} per hour. Front desk requests the hours. A manager approves before it is charged.</p>
      </div>
      {message ? <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm">{message}</p> : null}
      <form className="grid gap-3 md:grid-cols-4" onSubmit={requestCharge}>
        <label className="space-y-1">Which one
          <select name="kind" className="w-full">
            <option value="early_check_in">Early check-in</option>
            <option value="late_check_out">Late check-out</option>
          </select>
        </label>
        <label className="space-y-1">Hours
          <input name="hours" type="number" min="0.5" step="0.5" defaultValue="1" className="w-full" required />
        </label>
        <label className="space-y-1 md:col-span-2">Reason
          <input name="reason" className="w-full" required placeholder="Guest arrives at 11:00, two hours early" />
        </label>
        <button className="btn-secondary md:col-span-4" type="submit">Request hour charge</button>
      </form>
      <div className="space-y-3">
        {requests.map((item) => (
          <article key={item.id} className="rounded-lg border border-slate-200 p-3 text-sm">
            <p className="font-semibold">{item.kind === 'early_check_in' ? 'Early check-in' : 'Late check-out'} · {item.hours} h · {currency(hourlyCharge(Number(item.hours), Number(item.hourly_rate)), currencyCode)} · {item.status}</p>
            <p className="text-slate-600">{item.reason}</p>
            {manager && item.status === 'pending' ? (
              <form className="mt-2 flex flex-wrap gap-2" onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
                review(item.id, submitter?.value === 'rejected' ? 'rejected' : 'approved', String(form.get('review_note') || ''));
              }}>
                <input name="review_note" className="min-w-48 flex-1" placeholder="Manager note" required />
                <button className="btn-primary" value="approved" type="submit">Approve</button>
                <button className="btn-secondary" value="rejected" type="submit">Reject</button>
              </form>
            ) : null}
          </article>
        ))}
        {!requests.length ? <p className="text-sm text-slate-500">No early or late hours requested for this stay.</p> : null}
      </div>
    </section>
  );
}
