'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient, getMissingBrowserSupabaseEnv } from '@/lib/supabase-client';

function getSafeNext(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/dashboard';
  }

  return value;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const missingEnv = getMissingBrowserSupabaseEnv();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (missingEnv.length) {
      setError(`Missing required environment variables: ${missingEnv.join(', ')}. Add them in Vercel, then redeploy.`);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

      if (authError) {
        setError(authError.message);
        return;
      }

      router.replace(getSafeNext(searchParams.get('next')));
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Login failed. Check Supabase environment variables.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card mx-auto mt-16 max-w-md space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-black">Staff login</h1>
        <p className="mt-1 text-sm text-slate-500">Use the account created in Supabase Auth.</p>
      </div>
      {missingEnv.length ? (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Missing Supabase setup: {missingEnv.join(', ')}. Add these in Vercel Environment Variables, then redeploy.
        </div>
      ) : null}
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
