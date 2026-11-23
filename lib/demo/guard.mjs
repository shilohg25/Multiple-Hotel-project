// Local demo mode safety gate. Plain JS so next.config.mjs, instrumentation and tests share it.
// DEMO_MODE=1 swaps the Supabase data/auth layer for an in-process PGlite database.
// It must never be able to reach a real Supabase project, so it refuses to start when
// anything Supabase-shaped or production-shaped is in the environment.

export const LIVE_PROJECT_REFS = ['xsswimvltqfaxflumewc', 'hghssblwbezmyrrfthri'];
const BLOCKED_HOST = /(^|\.)supabase\.(co|in|com|net|io)$/i;

export function isDemoMode(env = process.env) {
  return env.DEMO_MODE === '1';
}

/** Names (never values) of everything that makes demo mode unsafe. */
export function demoGuardProblems(env = process.env) {
  const problems = [];
  for (const [name, value] of Object.entries(env)) {
    if (!value) continue;
    if (/SUPABASE|SERVICE_ROLE|^SBP_|^SB_/i.test(name)) problems.push(`${name} is set`);
    else if (LIVE_PROJECT_REFS.some((ref) => value.includes(ref)) || /supabase\.(co|in|com)/i.test(value)) {
      problems.push(`${name} points at Supabase`);
    }
  }
  if (env.NODE_ENV === 'production') problems.push('NODE_ENV is production');
  for (const [name, value] of Object.entries(env)) if (value && /^VERCEL/i.test(name)) problems.push(`${name} is set`);
  return problems;
}

export function assertDemoModeSafe(env = process.env) {
  if (!isDemoMode(env)) return;
  const problems = demoGuardProblems(env);
  if (problems.length) {
    throw new Error(`DEMO_MODE=1 refused to start: ${problems.join('; ')}. Demo mode is local-only and must not see any Supabase or deploy settings.`);
  }
}

export function isBlockedHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  return BLOCKED_HOST.test(host) || LIVE_PROJECT_REFS.some((ref) => host.includes(ref));
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

/** Demo mode is fully offline: only loopback hosts are allowed. */
export function isLoopbackHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  return LOOPBACK.has(host) || host.endsWith('.localhost') || /^127\./.test(host);
}

function hostOf(input) {
  try {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
    return new URL(String(raw), 'http://localhost').hostname;
  } catch {
    return '';
  }
}

/**
 * Wraps fetch so any request to a Supabase host (or, in demo mode, any non-loopback host)
 * throws before a socket opens. `log(line)` receives one line per refused request.
 */
export function installDemoFetchGuard(log = () => {}) {
  const g = globalThis;
  if (g.__hotelDemoFetchGuard) return g.__hotelDemoFetchGuard;
  const original = g.fetch;
  const guarded = async function demoGuardedFetch(input, init) {
    const host = hostOf(input);
    if (isBlockedHost(host)) {
      log(`${new Date().toISOString()} pid=${process.pid} BLOCKED fetch ${host} (Supabase)`);
      throw new Error(`Demo mode blocked a request to ${host}. Demo mode never talks to Supabase.`);
    }
    if (host && !isLoopbackHost(host)) {
      log(`${new Date().toISOString()} pid=${process.pid} BLOCKED fetch ${host} (demo mode is offline)`);
      throw new Error(`Demo mode is offline and blocked a request to ${host}.`);
    }
    return original(input, init);
  };
  g.fetch = guarded;
  g.__hotelDemoFetchGuard = { original, guarded };
  return g.__hotelDemoFetchGuard;
}

/** Makes DNS lookups fail for every non-loopback name in this process (covers http/https/undici too). */
export function installDemoDnsGuard(dns, log = () => {}) {
  if (!dns || dns.__hotelDemoDnsGuard) return;
  const refuse = (hostname) => {
    log(`${new Date().toISOString()} pid=${process.pid} BLOCKED dns ${hostname}${isBlockedHost(hostname) ? ' (Supabase)' : ''}`);
    const error = new Error(`Demo mode blocked DNS for ${hostname}`);
    error.code = 'ENOTFOUND';
    return error;
  };
  const lookup = dns.lookup;
  dns.lookup = function guardedLookup(hostname, ...rest) {
    if (isBlockedHost(hostname) || (!isLoopbackHost(hostname) && !/^[\d.:]+$/.test(String(hostname)))) {
      const callback = rest[rest.length - 1];
      if (typeof callback === 'function') return process.nextTick(() => callback(refuse(hostname)));
      throw refuse(hostname);
    }
    return lookup.call(this, hostname, ...rest);
  };
  if (dns.promises?.lookup) {
    const plookup = dns.promises.lookup;
    dns.promises.lookup = function guardedPromiseLookup(hostname, ...rest) {
      if (isBlockedHost(hostname) || (!isLoopbackHost(hostname) && !/^[\d.:]+$/.test(String(hostname)))) return Promise.reject(refuse(hostname));
      return plookup.call(this, hostname, ...rest);
    };
  }
  dns.__hotelDemoDnsGuard = true;
}
