import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertDemoModeSafe, demoGuardProblems, installDemoFetchGuard, isBlockedHost } from './guard.mjs';

const base = { DEMO_MODE: '1', NODE_ENV: 'development' };

describe('local demo guard', () => {
  it('starts with a clean local environment', () => {
    assert.deepEqual(demoGuardProblems(base), []);
    assert.doesNotThrow(() => assertDemoModeSafe(base));
  });

  it('does nothing when DEMO_MODE is off', () => {
    assert.doesNotThrow(() => assertDemoModeSafe({ NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', NODE_ENV: 'production' }));
  });

  it('refuses any Supabase variable, deploy variable or production build', () => {
    for (const extra of [
      { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' },
      { NEXT_PUBLIC_SUPABASE_ANON_KEY: 'x' },
      { SUPABASE_SERVICE_ROLE_KEY: 'x' },
      { SUPABASE_ACCESS_TOKEN: 'x' },
      { OTHER_URL: 'https://xsswimvltqfaxflumewc.example' },
      { OTHER_URL: 'https://abc.supabase.co' },
      { NODE_ENV: 'production' },
      { VERCEL: '1' },
      { VERCEL_ENV: 'preview' },
      { VERCEL_TOKEN: 'x' }
    ]) {
      assert.throws(() => assertDemoModeSafe({ ...base, ...extra }), /DEMO_MODE=1 refused to start/);
    }
  });

  it('never puts a variable value in the error', () => {
    assert.throws(() => assertDemoModeSafe({ ...base, SUPABASE_SERVICE_ROLE_KEY: 'sekrit-value' }), (error: Error) => !error.message.includes('sekrit-value'));
  });

  it('blocks Supabase hosts and the live project refs', () => {
    assert.equal(isBlockedHost('xsswimvltqfaxflumewc.supabase.co'), true);
    assert.equal(isBlockedHost('hghssblwbezmyrrfthri.supabase.co'), true);
    assert.equal(isBlockedHost('api.supabase.com'), true);
    assert.equal(isBlockedHost('SUPABASE.CO.'), true);
    assert.equal(isBlockedHost('127.0.0.1'), false);
    assert.equal(isBlockedHost('notsupabase.co.example'), false);
  });

  it('fetch guard throws before any request leaves', async () => {
    const lines: string[] = [];
    const g = globalThis as unknown as { fetch: typeof fetch; __hotelDemoFetchGuard?: unknown };
    const realFetch = g.fetch;
    let called = 0;
    g.fetch = (async () => { called += 1; return new Response('ok'); }) as typeof fetch;
    delete g.__hotelDemoFetchGuard;
    try {
      installDemoFetchGuard((line) => lines.push(line));
      await assert.rejects(() => fetch('https://xsswimvltqfaxflumewc.supabase.co/rest/v1/profiles'), /blocked/);
      assert.equal(called, 0);
      assert.match(lines[0], /BLOCKED fetch xsswimvltqfaxflumewc\.supabase\.co/);
      await assert.rejects(() => fetch('https://registry.npmjs.org/-/package/next/dist-tags'), /offline/);
      assert.equal(called, 0);
      await fetch('http://127.0.0.1:1/ok');
      assert.equal(called, 1);
    } finally {
      g.fetch = realFetch;
      delete g.__hotelDemoFetchGuard;
    }
  });
});
