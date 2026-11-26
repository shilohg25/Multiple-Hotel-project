#!/usr/bin/env node
// Smoke test for the local demo server: signs in as each demo role and opens its main screens.
// Reads passwords from the logins file; prints only roles, paths, status codes and checks.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const base = process.env.DEMO_URL || 'http://127.0.0.1:3100';
const loginsFile = process.env.DEMO_LOGINS_FILE || path.join(os.homedir(), '.secrets', 'hotel-demo-logins.txt');
const logins = Object.fromEntries(
  fs.readFileSync(loginsFile, 'utf8').split('\n').filter((line) => line && !line.startsWith('#'))
    .map((line) => line.trim().split(/\s+/)).map(([role, email, password]) => [role, { email, password }])
);

const frontline = ['/today', '/sales', '/today/close', '/offline', '/help'];
const managerScreens = ['/dashboard', '/today', '/today/close', '/reservations', '/reservations/d6000000-0000-4000-8000-000000000001', '/reservations/d6000000-0000-4000-8000-000000000004', '/payments', '/sales', '/reports/daily', '/reports/monthly', '/rooms', '/remittances', '/day-tours', '/settings', '/settings/rates', '/settings/channels', '/settings/services', '/settings/price-history', '/help', '/print/reports/day-close', '/print/reports/pending-payments'];
const plan = {
  owner: [...managerScreens, '/hotels', '/settings/staff', '/settings/pricing', '/settings/price-history'],
  manager: managerScreens,
  front_desk: frontline,
  cashier: frontline,
  restaurant_staff: frontline
};
const blockedForFrontline = ['/reservations', '/reports/monthly', '/settings', '/payments', '/settings/staff'];

const filter = process.argv[2];
let failures = 0;
for (const [role, screens] of Object.entries(plan)) {
  if (filter && filter !== role) continue;
  const login = logins[role];
  const signIn = await fetch(`${base}/api/demo/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(login) });
  const cookie = (signIn.headers.get('set-cookie') || '').split(';')[0];
  const bad = await fetch(`${base}/api/demo/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: login.email, password: 'wrong-password' }) });
  console.log(`\n== ${role} (${login.email}) login ${signIn.status}${cookie ? ' cookie ok' : ' NO COOKIE'}; wrong password ${bad.status}`);
  if (!cookie) { failures += 1; continue; }
  for (const screen of screens) {
    const response = await fetch(`${base}${screen}`, { headers: { cookie }, redirect: 'manual' });
    const html = response.status === 200 ? await response.text() : '';
    const problems = [];
    if (response.status !== 200) problems.push(`→ ${response.headers.get('location') || ''}`);
    if (/Application error|Unhandled Runtime Error|could not load|Could not find a relationship|does not exist/i.test(html)) problems.push('error text on page');
    if (/This screen is for a manager/.test(html)) problems.push('manager-only notice');
    const marks = ['TEST- Ada Arrival', 'TEST- Ben In-House', 'TEST- Cora Departure', 'TEST- Dan Online'].filter((name) => html.includes(name)).map((name) => name.split(' ')[1]);
    if (problems.length) failures += 1;
    console.log(`  ${problems.length ? 'FAIL' : 'ok  '} ${response.status} ${screen}${marks.length ? ` [${marks.join(', ')}]` : ''}${problems.length ? ` ${problems.join('; ')}` : ''}`);
  }
  if (role !== 'owner' && role !== 'manager') {
    for (const screen of blockedForFrontline) {
      const response = await fetch(`${base}${screen}`, { headers: { cookie }, redirect: 'manual' });
      const html = response.status === 200 ? await response.text() : '';
      const gated = response.status !== 200 || /This screen is for a manager/.test(html);
      if (!gated) failures += 1;
      console.log(`  ${gated ? 'ok  ' : 'FAIL'} gated ${screen} (${response.status}${gated && response.status === 200 ? ' manager-only notice' : ''})`);
    }
  }
}
const anon = await fetch(`${base}/today`, { redirect: 'manual' });
console.log(`\nsigned out /today → ${anon.status} ${anon.headers.get('location') || ''}`);
console.log(failures ? `\n${failures} problem(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
