import { createClient } from '@supabase/supabase-js';
import { getEnv } from './env';

const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
const supabaseServiceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY', 'missing-service-role-key');

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});
