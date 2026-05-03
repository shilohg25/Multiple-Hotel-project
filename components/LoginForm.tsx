'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    router.replace(searchParams.get('next') || '/dashboard');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card mx-auto mt-16 max-w-md space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-black">Staff login</h1>
        <p className="mt-1 text-sm text-slate-500">Use the account created in Supabase Auth.</p>
      </div>
      {error ? <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <div className="space-y-2">
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="w-full" />
      </div>
      <div className="space-y-2">
        <label htmlFor="password">Password</label>
        <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required className="w-full" />
      </div>
      <button className="btn-primary w-full" disabled={loading} type="submit">
        {loading ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  );
}
