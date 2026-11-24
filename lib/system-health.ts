export type SystemHealthEnvironment = {
  hasSupabaseUrl: boolean;
  hasSupabaseAnonKey: boolean;
  hasServiceRoleKey: boolean;
  hasAppBaseUrl: boolean;
};

export type SystemHealth = {
  status: 'ok' | 'setup_incomplete';
  environment: SystemHealthEnvironment;
  timestamp: string;
};

export function getSystemHealth(env: NodeJS.Dict<string> = process.env, now = () => new Date()): SystemHealth {
  const environment: SystemHealthEnvironment = {
    hasSupabaseUrl: Boolean(env.NEXT_PUBLIC_SUPABASE_URL),
    hasSupabaseAnonKey: Boolean(env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    hasServiceRoleKey: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
    hasAppBaseUrl: Boolean(env.APP_BASE_URL)
  };
  const setupComplete = Object.values(environment).every(Boolean);
  return {
    status: setupComplete ? 'ok' : 'setup_incomplete',
    environment,
    timestamp: now().toISOString()
  };
}

export const HEALTH_CHECKS: { key: keyof SystemHealthEnvironment; label: string; detail: string }[] = [
  { key: 'hasSupabaseUrl', label: 'Supabase URL', detail: 'The public Supabase project URL is set.' },
  { key: 'hasSupabaseAnonKey', label: 'Supabase anon key', detail: 'The public anon key is set.' },
  { key: 'hasServiceRoleKey', label: 'Service role key', detail: 'The server service-role key is set.' },
  { key: 'hasAppBaseUrl', label: 'App base URL', detail: 'APP_BASE_URL is set so links and emails can be built.' }
];
