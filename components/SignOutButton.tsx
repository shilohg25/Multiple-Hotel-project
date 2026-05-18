'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient, getMissingBrowserSupabaseEnv } from '@/lib/supabase-client';

export function SignOutButton() {
  const router = useRouter();
  const missingEnv = getMissingBrowserSupabaseEnv();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function signOut() {
    if (missingEnv.length) {
      setMessage(`Cannot sign out because env setup is missing: ${missingEnv.join(', ')}`);
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace('/login');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sign out failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button className="btn-secondary" type="button" onClick={signOut} disabled={loading}>
        {loading ? 'Signing out...' : 'Sign out and return to login'}
      </button>
      {message ? <p className="text-sm text-red-700">{message}</p> : null}
    </div>
  );
}
