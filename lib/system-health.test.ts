import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getSystemHealth } from './system-health.ts';

describe('system health', () => {
  it('reports ok only when every required variable is present', () => {
    const complete = getSystemHealth({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
      APP_BASE_URL: 'http://127.0.0.1:3000'
    }, () => new Date('2026-11-23T18:00:00.000Z'));
    assert.equal(complete.status, 'ok');
    assert.equal(complete.timestamp, '2026-11-23T18:00:00.000Z');
    assert.equal(Object.values(complete.environment).every(Boolean), true);
  });

  it('reports setup_incomplete when a required variable is missing', () => {
    const incomplete = getSystemHealth({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid',
      APP_BASE_URL: 'http://127.0.0.1:3000'
    });
    assert.equal(incomplete.status, 'setup_incomplete');
    assert.equal(incomplete.environment.hasSupabaseUrl, true);
    assert.equal(incomplete.environment.hasSupabaseAnonKey, false);
    assert.equal(incomplete.environment.hasServiceRoleKey, false);
    assert.equal(incomplete.environment.hasAppBaseUrl, true);
  });
});
