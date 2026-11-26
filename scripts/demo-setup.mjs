#!/usr/bin/env node
// Generates random passwords for the five local demo logins.
// Plaintext goes ONLY to the logins file (chmod 600, outside the repo).
// The repo-local .demo/logins.json (gitignored) holds scrypt hashes for the demo server.
// Nothing is printed except file paths.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEMO_ACCOUNTS } from '../lib/demo/accounts.mjs';

const loginsFile = process.env.DEMO_LOGINS_FILE || path.join(os.homedir(), '.secrets', 'hotel-demo-logins.txt');
const hashFile = path.join(process.cwd(), '.demo', 'logins.json');

function password() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(16);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

function hash(secret) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(secret, salt, 32);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

fs.mkdirSync(path.dirname(loginsFile), { recursive: true, mode: 0o700 });
fs.mkdirSync(path.dirname(hashFile), { recursive: true, mode: 0o700 });

const lines = [
  '# Local demo logins for the Multiple Hotel app (DEMO_MODE=1, http://127.0.0.1:3100).',
  `# Generated ${new Date().toISOString()}. Local PGlite only; these accounts do not exist in any Supabase project.`,
  ''
];
const hashes = [];
for (const account of DEMO_ACCOUNTS) {
  const secret = password();
  lines.push(`${account.role.padEnd(17)} ${account.email}  ${secret}`);
  hashes.push({ id: account.id, email: account.email, hash: hash(secret) });
}
fs.writeFileSync(loginsFile, lines.join('\n') + '\n', { mode: 0o600 });
fs.chmodSync(loginsFile, 0o600);
fs.writeFileSync(hashFile, JSON.stringify(hashes, null, 2) + '\n', { mode: 0o600 });
fs.chmodSync(hashFile, 0o600);
console.log(`Wrote demo logins to ${loginsFile} (chmod 600) and hashes to ${hashFile}.`);
