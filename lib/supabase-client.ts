'use client';

import { createBrowserClient } from '@supabase/ssr';

export function getMissingBrowserSupabaseEnv(): string[] {
  const missing = [];
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return missing;
}

export function createClient() {
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
