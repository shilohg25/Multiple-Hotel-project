import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import { installDemoDnsGuard, installDemoFetchGuard } from './guard.mjs';

/** Node runtime: block Supabase at fetch and DNS level and log every outbound request to .demo/network.log. */
export function installDemoNetworkGuards() {
  const logFile = path.join(process.cwd(), '.demo', 'network.log');
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const log = (line: string) => {
    fs.appendFileSync(logFile, `${line}\n`);
    if (line.includes('BLOCKED')) console.warn(`[demo-network] ${line}`);
  };
  log(`${new Date().toISOString()} guard installed pid=${process.pid}`);
  installDemoFetchGuard(log);
  installDemoDnsGuard(dns, log);
}
