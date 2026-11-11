'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function ProtectedError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="card mx-auto max-w-lg space-y-4 p-6">
      <h1 className="text-2xl font-black">This screen did not load</h1>
      <p className="text-sm text-slate-600">The rest of the hotel is unchanged. Try again, or go back to Today.</p>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" type="button" onClick={() => reset()}>Try again</button>
        <Link href="/today" className="btn-secondary">Go to Today</Link>
      </div>
    </section>
  );
}
