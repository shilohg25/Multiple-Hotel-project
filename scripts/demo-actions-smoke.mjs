#!/usr/bin/env node
// Exercises the main write paths on the LOCAL demo server (in-memory data; restart to reset).
// Prints only roles, actions and status codes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const base = process.env.DEMO_URL || 'http://127.0.0.1:3100';
const loginsFile = process.env.DEMO_LOGINS_FILE || path.join(os.homedir(), '.secrets', 'hotel-demo-logins.txt');
const logins = Object.fromEntries(
  fs.readFileSync(loginsFile, 'utf8').split('\n').filter((line) => line && !line.startsWith('#'))
    .map((line) => line.trim().split(/\s+/)).map(([role, email, password]) => [role, { email, password }])
);
const HOTEL = 'd0000000-0000-4000-8000-000000000001';
const ADA = 'd6000000-0000-4000-8000-000000000001';
const DAN_PAYMENT = 'd7000000-0000-4000-8000-000000000004';
const CASHIER = 'd1000000-0000-4000-8000-000000000004';
const RESTAURANT = 'd1000000-0000-4000-8000-000000000005';

const cookies = {};
async function as(role) {
  if (!cookies[role]) {
    const response = await fetch(`${base}/api/demo/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(logins[role]) });
    cookies[role] = (response.headers.get('set-cookie') || '').split(';')[0];
  }
  return cookies[role];
}
let failures = 0;
async function step(role, label, method, url, body, expect) {
  const response = await fetch(`${base}${url}`, { method, headers: { cookie: await as(role), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const json = await response.json().catch(() => ({}));
  const ok = response.status === expect;
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${role.padEnd(16)} ${label}: ${response.status}${ok ? '' : ` (expected ${expect}) ${json.error || ''}`}`);
  return json;
}

await step('front_desk', 'confirm a payment proof (should be refused)', 'PATCH', `/api/payments/${DAN_PAYMENT}/confirm`, {}, 403);
await step('manager', 'confirm TEST- Dan Online payment proof', 'PATCH', `/api/payments/${DAN_PAYMENT}/confirm`, {}, 200);
await step('cashier', 'approve a price change (should be refused)', 'PATCH', '/api/rate-overrides/d8000000-0000-4000-8000-000000000001', { status: 'approved' }, 403);
await step('manager', 'approve pending price-change request', 'PATCH', '/api/rate-overrides/d8000000-0000-4000-8000-000000000001', { status: 'approved', review_note: 'TEST- ok' }, 200);
await step('manager', 'approve late check-out request', 'PATCH', '/api/stay-time-requests/d8000000-0000-4000-8000-000000000002', { status: 'approved', review_note: 'TEST- ok' }, 200);
await step('front_desk', 'check in TEST- Ada Arrival', 'PATCH', `/api/reservations/${ADA}`, { status: 'checked_in' }, 200);
const asRestaurant = await step('owner', 'change TEST- Demo Cashier role to restaurant_staff', 'PATCH', `/api/settings/staff/${CASHIER}`, { full_name: 'TEST- Demo Cashier', role: 'restaurant_staff', hotel_id: HOTEL }, 200);
console.log(`     saved role = ${asRestaurant.profile?.role}`);
const back = await step('owner', 'save TEST- Demo Cashier back as cashier (POST upsert)', 'POST', '/api/settings/staff', { id: CASHIER, full_name: 'TEST- Demo Cashier', role: 'cashier', hotel_id: HOTEL }, 200);
console.log(`     saved role = ${back.profile?.role}`);
const kept = await step('owner', 'save TEST- Demo Restaurant as restaurant_staff', 'PATCH', `/api/settings/staff/${RESTAURANT}`, { full_name: 'TEST- Demo Restaurant', role: 'restaurant_staff', hotel_id: HOTEL }, 200);
console.log(`     saved role = ${kept.profile?.role}`);
await step('owner', 'unknown role "admin" (should be refused, not saved as front desk)', 'PATCH', `/api/settings/staff/${RESTAURANT}`, { role: 'admin', hotel_id: HOTEL }, 400);
if (asRestaurant.profile?.role !== 'restaurant_staff' || back.profile?.role !== 'cashier' || kept.profile?.role !== 'restaurant_staff') failures += 1;
console.log(failures ? `\n${failures} problem(s)` : '\nall actions behaved as expected');
process.exit(failures ? 1 : 0);
