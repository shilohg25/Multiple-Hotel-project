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
