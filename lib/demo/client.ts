import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { getDemoState } from './db';
import { DemoQuery, runRpc } from './postgrest';
import { DEMO_SESSION_COOKIE, readSessionToken } from './session';

// Stand-ins for the Supabase admin and server clients when DEMO_MODE=1.
// They answer from the in-process PGlite database and never open a network connection.

const getDb = async () => {
  const state = await getDemoState();
  return { db: state.db, catalog: state.catalog };
};

type StoredFile = { body: Uint8Array; contentType: string };
const FILES_KEY = Symbol.for('hotel.demo.files');

function files(): Map<string, StoredFile> {
  const g = globalThis as unknown as Record<symbol, Map<string, StoredFile> | undefined>;
  if (!g[FILES_KEY]) {
    const map = new Map<string, StoredFile>();
    for (const name of ['ada', 'dan']) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300"><rect width="100%" height="100%" fill="#f1f5f9"/><text x="24" y="60" font-family="sans-serif" font-size="26" fill="#0f172a">TEST- payment proof</text><text x="24" y="110" font-family="sans-serif" font-size="18" fill="#334155">Demo image for TEST- ${name}. Not a real receipt.</text></svg>`;
      map.set(`payment-proofs/demo/test-proof-${name}.svg`, { body: new TextEncoder().encode(svg), contentType: 'image/svg+xml' });
    }
    g[FILES_KEY] = map;
  }
  return g[FILES_KEY]!;
}

export function readDemoFile(bucket: string, filePath: string): StoredFile | null {
  return files().get(`${bucket}/${filePath}`) || null;
}

async function toBytes(body: unknown): Promise<{ bytes: Uint8Array; type: string }> {
  if (body instanceof Uint8Array) return { bytes: body, type: 'application/octet-stream' };
  if (body instanceof ArrayBuffer) return { bytes: new Uint8Array(body), type: 'application/octet-stream' };
  if (body && typeof (body as Blob).arrayBuffer === 'function') {
    const blob = body as Blob;
    return { bytes: new Uint8Array(await blob.arrayBuffer()), type: blob.type || 'application/octet-stream' };
  }
  return { bytes: new TextEncoder().encode(String(body ?? '')), type: 'text/plain' };
}

function storageBucket(bucket: string) {
  return {
    async upload(filePath: string, body: unknown, options: { contentType?: string } = {}) {
      const { bytes, type } = await toBytes(body);
      files().set(`${bucket}/${filePath}`, { body: bytes, contentType: options.contentType || type });
      return { data: { path: filePath, id: filePath, fullPath: `${bucket}/${filePath}` }, error: null };
    },
    async remove(paths: string[]) {
      for (const filePath of paths) files().delete(`${bucket}/${filePath}`);
      return { data: paths.map((name) => ({ name })), error: null };
    },
    async createSignedUrl(filePath: string) {
      return { data: { signedUrl: `/api/demo/file?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(filePath)}` }, error: null };
    },
    async download(filePath: string) {
      const file = files().get(`${bucket}/${filePath}`);
      if (!file) return { data: null, error: { message: 'Object not found' } };
      return { data: new Blob([file.body as BlobPart], { type: file.contentType }), error: null };
    }
  };
}

const unsupported = (name: string) => () => {
  throw new Error(`${name} is not available in local demo mode.`);
};

export function createDemoAdminClient(): SupabaseClient {
  const client = {
    from: (table: string) => new DemoQuery(getDb, table),
    rpc: (name: string, args?: Record<string, unknown>) => runRpc(getDb, name, args),
    storage: { from: storageBucket },
    auth: { admin: new Proxy({}, { get: (_t, prop) => unsupported(`auth.admin.${String(prop)}`) }) },
    channel: unsupported('realtime'),
    schema: unsupported('schema()')
  };
  return client as unknown as SupabaseClient;
}

type CookieStore = {
  get: (name: string) => { value: string } | undefined;
  set: (name: string, value: string, options?: Record<string, unknown>) => void;
};

export async function demoUserFromCookie(cookieStore: CookieStore) {
  const userId = readSessionToken(cookieStore.get(DEMO_SESSION_COOKIE)?.value);
  if (!userId) return null;
  const { db } = await getDb();
  const result = await db.query('select id::text as id, email from auth.users where id = $1::uuid', [userId]);
  const row = result.rows[0];
  return row ? { id: String(row.id), email: String(row.email), aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } : null;
}

export function createDemoServerClient(cookieStore: CookieStore): SupabaseClient {
  const admin = createDemoAdminClient() as unknown as Record<string, unknown>;
  const client = {
    ...admin,
    auth: {
      async getUser() {
        const user = await demoUserFromCookie(cookieStore);
        return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'Auth session missing!', name: 'AuthSessionMissingError', status: 400 } };
      },
      async getSession() {
        const user = await demoUserFromCookie(cookieStore);
        return { data: { session: user ? { user } : null }, error: null };
      },
      async signOut() {
        try {
          cookieStore.set(DEMO_SESSION_COOKIE, '', { path: '/', maxAge: 0 });
        } catch {
          // Server Components cannot set cookies; the sign-out route can.
        }
        return { error: null };
      }
    }
  };
  return client as unknown as SupabaseClient;
}
