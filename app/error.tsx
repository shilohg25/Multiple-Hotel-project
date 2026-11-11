'use client';

import { useEffect } from 'react';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-16">
      <section className="card w-full space-y-4 p-6">
        <h1 className="text-2xl font-black">This page did not load</h1>
        <p className="text-sm text-slate-600">Nothing was saved. Try again, or sign in once more if the problem stays.</p>
        <button className="btn-primary" type="button" onClick={() => reset()}>Try again</button>
      </section>
    </main>
  );
}
