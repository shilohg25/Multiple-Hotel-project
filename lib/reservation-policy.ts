export type PolicyRole = 'owner' | 'manager' | 'front_desk';
export type PolicyStatus =
  | 'tentative'
  | 'payment_submitted'
  | 'secured'
  | 'checked_in'
  | 'checked_out'
  | 'cancelled'
  | 'no_show';

export const RESERVATION_MONEY_FIELDS = ['posted_room_rate', 'total_amount', 'downpayment_required'] as const;

export type MoneyField = (typeof RESERVATION_MONEY_FIELDS)[number];

const STATUSES: PolicyStatus[] = [
  'tentative',
  'payment_submitted',
  'secured',
  'checked_in',
  'checked_out',
  'cancelled',
  'no_show'
];

const FRONT_DESK_STATUS_TARGETS: Partial<Record<PolicyStatus, PolicyStatus[]>> = {
  tentative: ['checked_in'],
  payment_submitted: ['checked_in'],
  secured: ['checked_in'],
  checked_in: ['checked_out']
};

export type ReservationChange = {
  field: string;
  before: unknown;
  after: unknown;
};

export type ReservationPolicyResult =
  | { ok: true; changes: ReservationChange[] }
  | { ok: false; status: number; error: string };

function numbersEqual(before: unknown, after: unknown): boolean {
  return Number(before || 0) === Number(after || 0);
}

export function decideReservationUpdate(input: {
  role: PolicyRole;
  currentStatus: PolicyStatus;
  currentMoney: Record<MoneyField, number>;
  nextStatus?: PolicyStatus;
  nextMoney?: Partial<Record<MoneyField, number>>;
  reason?: string | null;
}): ReservationPolicyResult {
  const changes: ReservationChange[] = [];

  if (input.nextStatus && input.nextStatus !== input.currentStatus) {
    if (!STATUSES.includes(input.nextStatus)) {
      return { ok: false, status: 400, error: 'Unknown reservation status.' };
    }
    if (input.role === 'front_desk') {
      const allowed = FRONT_DESK_STATUS_TARGETS[input.currentStatus] || [];
      if (!allowed.includes(input.nextStatus)) {
        return {
          ok: false,
          status: 403,
          error: 'Front desk can check a guest in or out. Other status changes need a manager.'
        };
      }
    }
    changes.push({ field: 'status', before: input.currentStatus, after: input.nextStatus });
  }

  for (const field of RESERVATION_MONEY_FIELDS) {
    if (!input.nextMoney || !(field in input.nextMoney)) continue;
    const after = Number(input.nextMoney[field]);
    if (!Number.isFinite(after) || after < 0) {
      return { ok: false, status: 400, error: 'Rate, total, and down payment must be zero or more.' };
    }
    if (numbersEqual(input.currentMoney[field], after)) continue;
    if (input.role === 'front_desk') {
      return {
        ok: false,
        status: 403,
        error: 'Front desk cannot change the room rate, total, or down payment. Ask a manager.'
      };
    }
    changes.push({ field, before: Number(input.currentMoney[field] || 0), after });
  }

  const needsReason = changes.some((change) => change.field === 'status' || RESERVATION_MONEY_FIELDS.includes(change.field as MoneyField));
  if (needsReason && input.role !== 'front_desk' && !String(input.reason || '').trim()) {
    return { ok: false, status: 400, error: 'A reason is required when a manager changes the rate, total, down payment, or status.' };
  }

  return { ok: true, changes };
}
