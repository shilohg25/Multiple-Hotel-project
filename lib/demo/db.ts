import 'server-only';

import fs from 'node:fs';
import path from 'node:path';
import { assertDemoModeSafe, isDemoMode } from './guard.mjs';
import { DEMO_ACCOUNTS } from './accounts.mjs';
import { loadCatalog, type Catalog, type SqlRunner } from './postgrest';

// In-process Postgres (PGlite, WebAssembly) for DEMO_MODE=1. It has no network
// listener and no connection string: nothing here can reach a Supabase project.

type DemoState = { db: SqlRunner; catalog: Catalog; logins: { id: string; email: string; hash: string }[] };

const PRELUDE = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text unique, encrypted_password text, created_at timestamptz default now());
-- The app talks to the database as the service role, so auth.uid() is null, like the live admin client.
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'service_role') $$;
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now());
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb, created_at timestamptz default now());
alter table storage.objects enable row level security;
`;

function root() {
  return process.cwd();
}

function readLogins() {
  const file = path.join(root(), '.demo', 'logins.json');
  if (!fs.existsSync(file)) throw new Error('Demo logins are missing. Run `npm run demo:setup` first.');
  return JSON.parse(fs.readFileSync(file, 'utf8')) as DemoState['logins'];
}

async function boot(): Promise<DemoState> {
  assertDemoModeSafe();
  const started = Date.now();
  const { PGlite } = await import('@electric-sql/pglite');
  const { btree_gist } = await import('@electric-sql/pglite/contrib/btree_gist');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const pg = new PGlite({ extensions: { btree_gist, pgcrypto } });
  await pg.exec(PRELUDE);

  const migrationsDir = path.join(root(), 'supabase', 'migrations');
  const seedDir = path.join(root(), 'supabase', 'seed');
  const files = fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
  for (const file of files) {
    await pg.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
    if (file === '0001_schema.sql') await pg.exec(fs.readFileSync(path.join(seedDir, 'local-demo-hotels.sql'), 'utf8'));
  }

  const logins = readLogins();
  for (const account of DEMO_ACCOUNTS) {
    const login = logins.find((item) => item.id === account.id);
    await pg.query('insert into auth.users (id, email, encrypted_password) values ($1, $2, $3)', [account.id, account.email, login?.hash ?? null]);
    await pg.query('insert into public.profiles (id, full_name, role, hotel_id) values ($1, $2, $3::public.app_role, $4)', [account.id, account.fullName, account.role, account.hotelId]);
  }
  await pg.exec(fs.readFileSync(path.join(seedDir, 'local-demo.sql'), 'utf8'));

  const db: SqlRunner = {
    query: async (sql, params = []) => {
      const result = await pg.query(sql, params);
      return { rows: result.rows as Record<string, unknown>[] };
    }
  };
  const catalog = await loadCatalog(db);
  console.log(`[demo] local PGlite database ready in ${Date.now() - started} ms (${files.length} migrations, TEST demo seed). No Supabase connection exists.`);
  return { db, catalog, logins };
}

const KEY = Symbol.for('hotel.demo.db');

export function getDemoState(): Promise<DemoState> {
  if (!isDemoMode()) throw new Error('Demo database requested outside DEMO_MODE=1.');
  assertDemoModeSafe();
  const g = globalThis as unknown as Record<symbol, Promise<DemoState> | undefined>;
  if (!g[KEY]) {
    g[KEY] = boot().catch((error) => {
      g[KEY] = undefined;
      throw error;
    });
  }
  return g[KEY]!;
}
