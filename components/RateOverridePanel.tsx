'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ChannelRate, RateOverrideRequest, Role } from '@/types/app';
import { currency } from '@/lib/money';

export function RateOverridePanel({
  hotelId,
  reservationId,
  roomTypeId,
  currencyCode,
  rates,
  requests,
  role
}: {
  hotelId: string;
  reservationId: string;
  roomTypeId: string | null;
  currencyCode: string;
  rates: ChannelRate[];
  requests: RateOverrideRequest[];
  role: Role;
}) {
  const router = useRouter();
  const manager = role === 'owner' || role === 'manager';
  const [message, setMessage] = useState('');

  async function requestRate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/rate-overrides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hotel_id: hotelId,
        reservation_id: reservationId,
        room_type_id: roomTypeId,
        channel: form.get('channel'),
        requested_rate: Number(form.get('requested_rate')),
        reason: form.get('reason')
      })
    });
    const json = await response.json().catch(() => ({}));
    setMessage(response.ok ? 'Request sent to a manager.' : json.error || 'Could not send the request.');
    if (response.ok) router.refresh();
  }

  async function review(id: string, status: 'approved' | 'rejected', reviewNote: string) {
    const response = await fetch(`/api/rate-overrides/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, review_note: reviewNote })
    });
    const json = await response.json().catch(() => ({}));
    setMessage(response.ok ? 'Decision saved.' : json.error || 'Could not save the decision.');
    if (response.ok) router.refresh();
  }

  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="text-lg font-bold">Room rate</h2>
        <p className="mt-1 text-sm text-slate-500">Walk-in and OTA prices are different. Front desk can ask for another price. A manager approves it.</p>
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        {rates.map((rate) => (
          <span key={rate.id} className="rounded-full bg-slate-100 px-3 py-1">{rate.channel.replaceAll('_', ' ')} {currency(rate.rate, currencyCode)}</span>
        ))}
        {!rates.length ? <span className="text-slate-500">No channel prices for this room type yet.</span> : null}
      </div>
      {message ? <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm">{message}</p> : null}
      <form className="grid gap-3 md:grid-cols-4" onSubmit={requestRate}>
        <label className="space-y-1">Channel
          <select name="channel" className="w-full"><option value="walk_in">Walk-in</option><option value="ota">OTA</option><option value="short_time">Short-time</option></select>
        </label>
        <label className="space-y-1">Requested nightly rate
          <input name="requested_rate" type="number" min="0" step="0.01" className="w-full" required />
        </label>
        <label className="space-y-1 md:col-span-2">Reason
          <input name="reason" className="w-full" required placeholder="Why is this price different?" />
        </label>
        <button className="btn-secondary md:col-span-4" type="submit">Request rate change</button>
      </form>
      <div className="space-y-3">
        {requests.map((item) => (
          <article key={item.id} className="rounded-lg border border-slate-200 p-3 text-sm">
            <p className="font-semibold">{item.channel.replaceAll('_', ' ')} {currency(item.requested_rate, currencyCode)} · {item.status}</p>
            <p className="text-slate-600">{item.reason}</p>
            {manager && item.status === 'pending' ? (
              <form className="mt-2 flex flex-wrap gap-2" onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
                review(item.id, submitter?.value === 'rejected' ? 'rejected' : 'approved', String(form.get('review_note') || ''));
              }}>
                <input name="review_note" className="min-w-48 flex-1" placeholder="Manager note" required />
                <button className="btn-primary" name="decision" value="approved" type="submit">Approve</button>
                <button className="btn-secondary" name="decision" value="rejected" type="submit">Reject</button>
              </form>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
