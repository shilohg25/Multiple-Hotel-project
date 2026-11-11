'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BREAKFAST_TURN_OFF_BLOCKED } from '@/lib/breakfast-toggle';
import type { ReservationStatus, Role } from '@/types/app';

export function ReservationActions({
  reservationId,
  status,
  postedRoomRate,
  totalAmount,
  roomLabel = 'Room only',
  downpaymentRequired,
  withBreakfast,
  breakfastCharged,
  role
}: {
  reservationId: string;
  status: ReservationStatus;
  postedRoomRate: number;
  totalAmount: number;
  roomLabel?: string;
  downpaymentRequired: number;
  withBreakfast: boolean;
  breakfastCharged: boolean;
  role: Role;
}) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [rate, setRate] = useState(String(postedRoomRate));
  const [total, setTotal] = useState(String(totalAmount));
  const [downpayment, setDownpayment] = useState(String(downpaymentRequired));
  const [nextStatus, setNextStatus] = useState(status);
  const [breakfast, setBreakfast] = useState(withBreakfast);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const manager = role === 'owner' || role === 'manager';

  function reasonFor(prompt: string): string | null {
    const typed = reason.trim();
    if (typed) return typed;
    if (!manager) return '';
    const entered = window.prompt(prompt);
    if (entered === null) return null;
    const next = entered.trim();
    if (!next) return null;
    setReason(next);
    return next;
  }

  async function save(body: Record<string, unknown>) {
    setMessage('');
    setLoading(true);
    const response = await fetch(`/api/reservations/${reservationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const json = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setMessage(json.error || 'Could not update the stay.');
      return;
    }
    setMessage('Saved.');
    router.refresh();
  }

  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="text-lg font-bold">Stay actions</h2>
        <p className="mt-1 text-sm text-slate-500">
          Front desk can check a guest in or out. Changing the rate, total, down payment, or any other status needs a manager and a reason.
        </p>
      </div>
      {message ? <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm">{message}</p> : null}
      {manager ? (
        <label className="block space-y-1">
          Reason
          <textarea className="w-full" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required to check in, check out, or change the rate, total, down payment, or status." />
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {status !== 'checked_in' && status !== 'checked_out' && status !== 'cancelled' && status !== 'no_show' ? (
          <button className="btn-primary" type="button" disabled={loading} onClick={() => {
            const nextReason = reasonFor('Why are you checking this guest in?');
            if (nextReason === null) {
              setMessage('A reason is required to check this guest in.');
              return;
            }
            void save({ status: 'checked_in', reason: nextReason });
          }}>
            Check in
          </button>
        ) : null}
        {status === 'checked_in' ? (
          <button className="btn-primary" type="button" disabled={loading} onClick={() => {
            const nextReason = reasonFor('Why are you checking this guest out?');
            if (nextReason === null) {
              setMessage('A reason is required to check this guest out.');
              return;
            }
            void save({ status: 'checked_out', reason: nextReason });
          }}>
            Check out
          </button>
        ) : null}
      </div>
      {manager ? (
        <form
          className="grid gap-3 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!breakfast && withBreakfast && breakfastCharged) {
              setMessage(BREAKFAST_TURN_OFF_BLOCKED);
              return;
            }
            const needsReason = nextStatus !== status
              || Number(rate) !== postedRoomRate
              || Number(total) !== totalAmount
              || Number(downpayment) !== downpaymentRequired;
            const nextReason = needsReason ? reasonFor('Why are you changing this stay?') : reason.trim();
            if (nextReason === null) {
              setMessage('A reason is required when you change the rate, total, down payment, or status.');
              return;
            }
            save({
              status: nextStatus,
              posted_room_rate: Number(rate),
              total_amount: Number(total),
              downpayment_required: Number(downpayment),
              with_breakfast: breakfast,
              reason: nextReason
            });
          }}
        >
          <label className="space-y-1">
            Status
            <select className="w-full" value={nextStatus} onChange={(event) => setNextStatus(event.target.value as ReservationStatus)}>
              {['tentative', 'payment_submitted', 'secured', 'checked_in', 'checked_out', 'cancelled', 'no_show'].map((item) => (
                <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            Room rate
            <input className="w-full" inputMode="decimal" value={rate} onChange={(event) => setRate(event.target.value)} />
          </label>
          <label className="space-y-1">
            {roomLabel}
            <input className="w-full" inputMode="decimal" value={total} onChange={(event) => setTotal(event.target.value)} />
          </label>
          <label className="space-y-1">
            Down payment
            <input className="w-full" inputMode="decimal" value={downpayment} onChange={(event) => setDownpayment(event.target.value)} />
          </label>
          <label className="space-y-1">
            Breakfast
            <select className="w-full" value={breakfast ? 'true' : 'false'} disabled={breakfastCharged && withBreakfast} onChange={(event) => setBreakfast(event.target.value === 'true')}>
              <option value="true">Yes</option>
              <option value="false">No - room only</option>
            </select>
          </label>
          {breakfastCharged && withBreakfast ? <p className="text-sm text-slate-600 md:col-span-2">{BREAKFAST_TURN_OFF_BLOCKED}</p> : null}
          <button className="btn-secondary md:col-span-2" type="submit" disabled={loading}>Save manager changes</button>
        </form>
      ) : (
        <p className="text-sm text-slate-500">Rate, total, and down payment are locked for front desk.</p>
      )}
    </section>
  );
}
