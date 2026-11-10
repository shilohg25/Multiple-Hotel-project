'use client';

import { useState } from 'react';
import Link from 'next/link';

export function StayActionLinks({
  stays,
  chargeLabel,
  paymentLabel,
  prompt = 'Which stay for a charge or payment?',
  chooseLabel = 'Choose a room or guest first'
}: {
  stays: { id: string; label: string }[];
  chargeLabel: string;
  paymentLabel: string;
  prompt?: string;
  chooseLabel?: string;
}) {
  const [stayId, setStayId] = useState('');
  const href = stayId ? `/reservations/${stayId}` : '';

  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
      <label className="space-y-1 text-sm">
        {prompt}
        <select className="w-full" value={stayId} onChange={(event) => setStayId(event.target.value)}>
          <option value="">{chooseLabel}</option>
          {stays.map((stay) => <option key={stay.id} value={stay.id}>{stay.label}</option>)}
        </select>
      </label>
      {href ? <Link href={href} className="btn-primary min-h-12 text-base">{chargeLabel}</Link> : <span className="btn-primary min-h-12 cursor-not-allowed text-base opacity-50">{chargeLabel}</span>}
      {href ? <Link href={href} className="btn-primary min-h-12 text-base">{paymentLabel}</Link> : <span className="btn-primary min-h-12 cursor-not-allowed text-base opacity-50">{paymentLabel}</span>}
    </div>
  );
}
