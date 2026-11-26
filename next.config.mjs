import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDemoModeSafe, isDemoMode } from './lib/demo/guard.mjs';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

// DEMO_MODE=1 is local-only. Refuse to start if any Supabase, deploy or production setting is present.
assertDemoModeSafe();

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: projectRoot,
  serverExternalPackages: ['@electric-sql/pglite'],
  env: {
    NEXT_PUBLIC_DEMO_MODE: isDemoMode() ? '1' : ''
  }
};

export default nextConfig;
