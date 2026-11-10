'use client';

import { useState } from 'react';
import Link from 'next/link';
import { helpGuides } from '@/lib/help-content';

export function HelpPanel({ screen }: { screen: 'today' | 'close' }) {
  const [open, setOpen] = useState(false);
  const guides = helpGuides.filter((guide) => guide.screen === screen || guide.screen === 'general');
  return (
    <div className="relative">
      <button className="btn-secondary" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        Help
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-[min(100vw-2rem,28rem)] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
          {guides.map((guide) => (
            <article key={guide.id} className="mb-4">
              <h2 className="font-bold">{guide.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{guide.summary}</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
                {guide.steps.slice(0, 4).map((step) => <li key={step}>{step}</li>)}
              </ol>
            </article>
          ))}
          <Link href="/help" className="text-sm font-semibold underline">Open all guides</Link>
        </div>
      ) : null}
    </div>
  );
}
