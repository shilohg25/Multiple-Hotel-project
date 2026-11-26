import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireEnv } from './env';
import { isDemoMode } from './demo/guard.mjs';
import { createDemoAdminClient } from './demo/client';

let adminClient: SupabaseClient | null = null;

function getSupabaseAdminClient() {
  if (!adminClient && isDemoMode()) {
    // Local demo: in-process PGlite. Never a Supabase connection.
    adminClient = createDemoAdminClient();
  }
  if (!adminClient) {
    adminClient = createClient(
      requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
      requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
  }

  return adminClient;
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseAdminClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === 'function' ? value.bind(client) : value;
  }
});
