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

function money(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null;
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
      const oldValue = money(before[field.key]);
      const newValue = money(after[field.key]);
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
    if (nameChanged || Object.keys(before).length || Object.keys(after).length) {
      entries.push({
        id: log.id,
        changed_type: 'payment channel',
        item_label: name,
        old_value: null,
        new_value: null,
        value_kind: 'percent',
        changed_by_name: actorName(log),
        created_at: log.created_at,
        notes: nameChanged ? `Renamed from ${String(before.name || 'previous name')} to ${name}.` : 'Payment channel updated.'
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
    const channels = Array.from(new Set([...Object.keys(rates), ...Object.keys(before)]));
    for (const channel of channels) {
      const oldValue = money(before[channel]);
      const newValue = money(rates[channel]);
      if (!changed(oldValue, newValue) && oldValue !== null) continue;
      if (newValue === null && oldValue === null) continue;
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
