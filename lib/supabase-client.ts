'use client';

import { createBrowserClient } from '@supabase/ssr';

const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === '1';

// Local demo (DEMO_MODE=1): sign-in and sign-out go to the local /api/demo routes. No Supabase.
function createDemoBrowserClient() {
  const post = async (path: string, body?: unknown) => {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
    const json = await response.json().catch(() => ({}));
    return response.ok ? { error: null } : { error: { message: json.error || 'Demo sign-in failed.' } };
  };
  return {
    auth: {
      signInWithPassword: (credentials: { email: string; password: string }) => post('/api/demo/auth/login', credentials),
      signOut: () => post('/api/demo/auth/logout')
    }
  };
}

export function getMissingBrowserSupabaseEnv(): string[] {
  if (demoMode) return [];
  const missing = [];
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return missing;
}

export function createClient() {
  if (demoMode) return createDemoBrowserClient() as unknown as ReturnType<typeof createBrowserClient>;
  const missing = getMissingBrowserSupabaseEnv();
  if (missing.length) {
    throw new Error(`Missing required Supabase browser environment variables: ${missing.join(', ')}`);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

  return createBrowserClient(
    supabaseUrl,
    supabaseAnonKey
  );
}
