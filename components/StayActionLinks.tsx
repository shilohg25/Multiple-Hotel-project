'use client';

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import {
  stayPickerActionHref,
  stayPickerActions,
  stayPickerLinkActivatesOnKey,
  stayPickerListMaxHeightFromRowBoxes,
  stayPickerListMaxHeightPx,
  stayPickerListNeedsMaxHeight,
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
  emptyLabel = 'No stays to add a charge or payment to today.',
  stayCountLabel,
  canAddCharge = true
}: {
  stays: StayPickerStay[];
  labels: StayPickerLabels;
  chargeLabel: string;
  paymentLabel: string;
  prompt?: string;
  chooseLabel?: string;
  emptyLabel?: string;
  stayCountLabel?: string;
  canAddCharge?: boolean;
}) {
  const [stayId, setStayId] = useState('');
  const rows = stayPickerRows(stays, labels);
  const actions = stayPickerActions(canAddCharge);
  const showCharge = actions.includes('charge');
  const chargeHref = stayPickerActionHref(stayId, 'charge');
  const paymentHref = stayPickerActionHref(stayId, 'payment');
  const needsMaxHeight = stayPickerListNeedsMaxHeight(rows.length);
  const listRef = useRef<HTMLDivElement>(null);
  const [measuredMaxHeight, setMeasuredMaxHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    if (!needsMaxHeight) {
      setMeasuredMaxHeight(undefined);
      return;
    }
    const list = listRef.current;
    if (!list) return;

    const measure = () => {
      const boxes = Array.from(list.querySelectorAll<HTMLElement>('[data-stay-row]')).map((el) => {
        const rect = el.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      });
      const next = stayPickerListMaxHeightFromRowBoxes(boxes);
      setMeasuredMaxHeight((prev) => (prev === next ? prev : next));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    for (const row of list.querySelectorAll('[data-stay-row]')) observer.observe(row);
    return () => observer.disconnect();
  }, [needsMaxHeight, rows.length]);

  function activateLinkOnSpace(event: KeyboardEvent<HTMLAnchorElement>) {
    if (!stayPickerLinkActivatesOnKey(event.key)) return;
    event.preventDefault();
    event.currentTarget.click();
  }

  return (
    <section className="card space-y-3 p-4">
      <p className="text-sm font-medium text-slate-800">{prompt}</p>
      {rows.length ? (
        <>
          {stayCountLabel ? <p className="text-sm text-slate-700">{stayCountLabel}</p> : null}
          <div
            ref={listRef}
            role="radiogroup"
            aria-label={prompt}
            className={needsMaxHeight ? 'space-y-2 overflow-y-auto scroll-smooth snap-y snap-proximity [scrollbar-gutter:stable]' : 'space-y-2'}
            style={needsMaxHeight ? { maxHeight: measuredMaxHeight ?? stayPickerListMaxHeightPx() } : undefined}
          >
            {rows.map((row) => {
              const selected = stayId === row.id;
              return (
                <label
                  key={row.id}
                  data-stay-row=""
                  className={`flex min-h-[96px] shrink-0 snap-start cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-slate-900 has-[:focus-visible]:ring-offset-2 ${selected ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:bg-slate-50'}`}
                >
                  <input
                    type="radio"
                    name="stay-picker"
                    value={row.id}
                    checked={selected}
                    onChange={() => setStayId(row.id)}
                    className="mt-1 focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                  />
                  <span className="min-w-0">
                    <span className="block break-words font-bold text-slate-900">{row.guestName}</span>
                    <span className="block break-words text-base text-slate-800">{row.roomLabel} · {row.dates}</span>
                    <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800">{row.statusLabel}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-500">{emptyLabel}</p>
      )}
      <div className={showCharge ? 'grid gap-3 sm:grid-cols-2' : 'grid gap-3'}>
        {showCharge ? (
          chargeHref ? (
            <Link href={chargeHref} className="btn-primary min-h-12 text-base" onKeyDown={activateLinkOnSpace}>
              {chargeLabel}
            </Link>
          ) : (
            <span className="btn-primary min-h-12 cursor-not-allowed text-base opacity-50">{chargeLabel}</span>
          )
        ) : null}
        {paymentHref ? (
          <Link href={paymentHref} className="btn-primary min-h-12 text-base" onKeyDown={activateLinkOnSpace}>
            {paymentLabel}
          </Link>
        ) : (
          <span className="btn-primary min-h-12 cursor-not-allowed text-base opacity-50">{paymentLabel}</span>
        )}
      </div>
      {rows.length && !stayId ? <p className="text-sm text-slate-500">{chooseLabel}</p> : null}
    </section>
  );
}
