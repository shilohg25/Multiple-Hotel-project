'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  stayPickerActionHref,
  stayPickerRows,
  type StayPickerLabels,
  type StayPickerStay
} from '@/lib/stay-picker';

export function StayActionLinks({
  stays,
  labels,
  chargeLabel,
  paymentLabel,
  prompt = 'Which stay for a charge or payment?',
  chooseLabel = 'Choose a room or guest first',
  emptyLabel = 'No stays to add a charge or payment to today.'
}: {
  stays: StayPickerStay[];
  labels: StayPickerLabels;
  chargeLabel: string;
  paymentLabel: string;
  prompt?: string;
  chooseLabel?: string;
  emptyLabel?: string;
}) {
  const [stayId, setStayId] = useState('');
  const rows = stayPickerRows(stays, labels);
  const chargeHref = stayPickerActionHref(stayId, 'charge');
  const paymentHref = stayPickerActionHref(stayId, 'payment');

  return (
    <section className="card space-y-3 p-4">
      <p className="text-sm font-medium text-slate-800">{prompt}</p>
      {rows.length ? (
        <div role="radiogroup" aria-label={prompt} className="max-h-80 space-y-2 overflow-y-auto">
          {rows.map((row) => {
            const selected = stayId === row.id;
            return (
              <label
                key={row.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 ${selected ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:bg-slate-50'}`}
              >
                <input
                  type="radio"
                  name="stay-picker"
                  value={row.id}
                  checked={selected}
                  onChange={() => setStayId(row.id)}
                  className="mt-1"
                />
                <span>
                  <span className="block font-bold text-slate-900">{row.guestName}</span>
                  <span className="block text-sm text-slate-600">{row.roomLabel} · {row.dates}</span>
                  <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800">{row.statusLabel}</span>
                </span>
              </label>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-slate-500">{emptyLabel}</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {chargeHref ? <Link href={chargeHref} className="btn-primary min-h-12 text-base">{chargeLabel}</Link> : <span className="btn-primary min-h-12 cursor-not-allowed text-base opacity-50">{chargeLabel}</span>}
        {paymentHref ? <Link href={paymentHref} className="btn-primary min-h-12 text-base">{paymentLabel}</Link> : <span className="btn-primary min-h-12 cursor-not-allowed text-base opacity-50">{paymentLabel}</span>}
      </div>
      {rows.length && !stayId ? <p className="text-sm text-slate-500">{chooseLabel}</p> : null}
    </section>
  );
}
