export type PriceHistoryValueKind = 'money' | 'percent';

export type PriceHistoryEntry = {
  id: string;
  changed_type: string;
  item_label: string;
  old_value: number | null;
  new_value: number | null;
  value_kind: PriceHistoryValueKind;
  changed_by_name: string;
  created_at: string;
  notes: string | null;
};

export type PriceChangeLogLike = {
  id: string;
  changed_type: string;
  old_value?: number | string | null;
  new_value?: number | string | null;
  notes?: string | null;
  created_at: string;
  rooms?: { name?: string | null } | null;
  service_items?: { name?: string | null } | null;
  profiles?: { full_name?: string | null } | null;
};

export type AuditLogLike = {
  id: string;
  action: string;
  details?: unknown;
  created_at: string;
  profiles?: { full_name?: string | null } | null;
};

function numeric(value: unknown, places: number): number | null {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  const factor = 10 ** places;
  return Math.round(amount * factor) / factor;
}

/** Peso amounts are stored to 2 decimals. */
function money(value: unknown): number | null {
  return numeric(value, 2);
}

/** Payment-channel surcharge/MDR are numeric(6,3) and the form allows step 0.001. */
function percent(value: unknown): number | null {
  return numeric(value, 3);
}

function changed(before: number | null, after: number | null) {
  if (before === null && after === null) return false;
  if (before === null || after === null) return true;
  return Math.abs(before - after) >= 0.0005;
}

function actorName(row: { profiles?: { full_name?: string | null } | null }) {
  return row.profiles?.full_name || 'Unknown';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}


export type PaymentChannelSnapshot = {
  name?: unknown;
  surcharge_percent?: unknown;
  mdr_percent?: unknown;
  requires_proof?: unknown;
  active?: unknown;
};

/** True when a payment-channel save changes a field the API actually writes. */
export function paymentChannelHasChanges(before: PaymentChannelSnapshot, after: PaymentChannelSnapshot): boolean {
  if (String(before.name ?? '').trim() !== String(after.name ?? '').trim()) return true;
  if (changed(percent(before.surcharge_percent), percent(after.surcharge_percent))) return true;
  if (changed(percent(before.mdr_percent), percent(after.mdr_percent))) return true;
  if (Boolean(before.requires_proof) !== Boolean(after.requires_proof)) return true;
  if (Boolean(before.active) !== Boolean(after.active)) return true;
  return false;
}

export function entriesFromPriceChangeLogs(logs: PriceChangeLogLike[]): PriceHistoryEntry[] {
  return logs.map((log) => ({
    id: log.id,
    changed_type: log.changed_type.replaceAll('_', ' '),
    item_label:
      log.changed_type === 'room_price'
        ? log.rooms?.name || 'Room deleted'
        : log.changed_type === 'service_price'
          ? log.service_items?.name || 'Service deleted'
          : log.notes || 'Price change',
    old_value: money(log.old_value),
    new_value: money(log.new_value),
    value_kind: 'money',
    changed_by_name: actorName(log),
    created_at: log.created_at,
    notes: log.notes || null
  }));
}

type ChannelDetails = {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
};

export function entriesFromPaymentChannelAudits(logs: AuditLogLike[]): PriceHistoryEntry[] {
  const entries: PriceHistoryEntry[] = [];
  for (const log of logs) {
    if (log.action !== 'payment_channel.updated') continue;
    const details = asRecord(log.details) as ChannelDetails;
    const before = asRecord(details.before);
    const after = asRecord(details.after);
    const name = String(after.name || before.name || 'Payment channel');
    const fields: { key: string; label: string }[] = [
      { key: 'surcharge_percent', label: 'guest surcharge' },
      { key: 'mdr_percent', label: 'bank MDR' }
    ];
    const nameChanged = String(before.name || '') !== String(after.name || '') && (before.name != null || after.name != null);
    const rateRows: PriceHistoryEntry[] = [];
    for (const field of fields) {
      const oldValue = percent(before[field.key]);
      const newValue = percent(after[field.key]);
      if (!changed(oldValue, newValue)) continue;
      rateRows.push({
        id: `${log.id}:${field.key}`,
        changed_type: 'payment channel',
        item_label: `${name} · ${field.label}`,
        old_value: oldValue,
        new_value: newValue,
        value_kind: 'percent',
        changed_by_name: actorName(log),
        created_at: log.created_at,
        notes: nameChanged ? `Renamed from ${String(before.name || 'previous name')} to ${name}.` : null
      });
    }
    if (rateRows.length) {
      entries.push(...rateRows);
      continue;
    }
    // Name-only changes are still history. A no-op (identical before/after) is not.
    if (nameChanged) {
      entries.push({
        id: log.id,
        changed_type: 'payment channel',
        item_label: name,
        old_value: null,
        new_value: null,
        value_kind: 'percent',
        changed_by_name: actorName(log),
        created_at: log.created_at,
        notes: `Renamed from ${String(before.name || 'previous name')} to ${name}.`
      });
    }
  }
  return entries;
}

type ChannelRateDetails = {
  room_type?: unknown;
  rates?: unknown;
  before?: unknown;
};

export function entriesFromChannelRateAudits(logs: AuditLogLike[]): PriceHistoryEntry[] {
  const entries: PriceHistoryEntry[] = [];
  for (const log of logs) {
    if (log.action !== 'rate.channel_defaults_updated') continue;
    const details = asRecord(log.details) as ChannelRateDetails;
    const roomType = String(details.room_type || 'Room type');
    const rates = asRecord(details.rates);
    const before = asRecord(details.before);
    // Only channels actually submitted in payload.rates. The API skips absent keys,
    // so unioning with `before` would invent prev -> — rows for untouched channels.
    for (const channel of Object.keys(rates)) {
      const oldValue = money(before[channel]);
      const newValue = money(rates[channel]);
      if (!changed(oldValue, newValue)) continue;
      entries.push({
        id: `${log.id}:${channel}`,
        changed_type: 'channel rate',
        item_label: `${roomType} · ${channel.replaceAll('_', '-')}`,
        old_value: oldValue,
        new_value: newValue,
        value_kind: 'money',
        changed_by_name: actorName(log),
        created_at: log.created_at,
        notes: null
      });
    }
  }
  return entries;
}

export function mergePriceHistory(groups: PriceHistoryEntry[][]): PriceHistoryEntry[] {
  return groups.flat().sort((left, right) => {
    const byDate = right.created_at.localeCompare(left.created_at);
    return byDate !== 0 ? byDate : left.id.localeCompare(right.id);
  });
}

export function formatHistoryValue(value: number | null, kind: PriceHistoryValueKind, currencyFormat: (amount: number) => string) {
  if (value === null) return '—';
  if (kind === 'percent') {
    const text = Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
    return `${text}%`;
  }
  return currencyFormat(value);
}
