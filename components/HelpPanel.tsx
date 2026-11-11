'use client';

import { useState } from 'react';
import Link from 'next/link';
export function HelpPanel({
  screen,
  helpLabel,
  allGuidesLabel,
  guides
}: {
  screen: 'today' | 'close';
  helpLabel: string;
  allGuidesLabel: string;
  guides: { id: string; title: string; summary: string; steps: string[] }[];
}) {
  const [open, setOpen] = useState(false);
  const visible = guides.filter((guide) => guide.id === screen || guide.id === 'general');
  return (
    <div className="relative">
      <button className="btn-secondary" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        {helpLabel}
      </button>
      {open ? (
        <div className="absolute left-0 z-20 mt-2 w-[min(100vw-2rem,28rem)] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl sm:left-auto sm:right-0">
          {visible.map((guide) => (
            <article key={guide.id} className="mb-4">
              <h2 className="font-bold">{guide.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{guide.summary}</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
                {(guide.steps || []).slice(0, 4).map((step) => <li key={step}>{step}</li>)}
              </ol>
            </article>
          ))}
          <Link href="/help" className="text-sm font-semibold underline">{allGuidesLabel}</Link>
        </div>
      ) : null}
    </div>
  );
}
