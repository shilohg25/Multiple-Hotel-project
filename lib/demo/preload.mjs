// Loaded with NODE_OPTIONS=--import by `npm run demo`, so it runs in every Node process
// of the dev server before Next.js itself. DEMO_MODE=1 only.
// 1. Refuses to start if any Supabase / deploy / production setting is present.
// 2. Makes the process offline: fetch and DNS to anything but loopback are refused,
//    and every refusal is logged to .demo/network.log.
import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import { assertDemoModeSafe, installDemoDnsGuard, installDemoFetchGuard, isDemoMode } from './guard.mjs';

if (isDemoMode()) {
  assertDemoModeSafe();
  const logFile = path.join(process.cwd(), '.demo', 'network.log');
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const log = (line) => fs.appendFileSync(logFile, `${line}\n`);
  log(`${new Date().toISOString()} pid=${process.pid} offline guard installed (${process.argv.slice(1, 2).map((arg) => path.basename(arg)).join(' ')})`);
  installDemoFetchGuard(log);
  installDemoDnsGuard(dns, log);
}
