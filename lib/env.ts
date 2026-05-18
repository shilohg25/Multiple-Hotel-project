export const PUBLIC_SUPABASE_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY'
] as const;

export const PROTECTED_SERVER_ENV_VARS = [
  ...PUBLIC_SUPABASE_ENV_VARS,
  'SUPABASE_SERVICE_ROLE_KEY'
] as const;

export const APP_ENV_VARS = [
  ...PROTECTED_SERVER_ENV_VARS,
  'APP_BASE_URL'
] as const;

export function getMissingEnvVars(names: readonly string[] = APP_ENV_VARS): string[] {
  return names.filter((name) => !process.env[name]);
}

export function getEnvErrorPath(missing: readonly string[], param = 'missing'): string {
  const searchParams = new URLSearchParams();
  searchParams.set(param, missing.join(','));
  return `/env-error?${searchParams.toString()}`;
}

export function getEnv(name: string, fallback = ''): string {
  const value = process.env[name];
  if (!value) return fallback;
  return value;
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
