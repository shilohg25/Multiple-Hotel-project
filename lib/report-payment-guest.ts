/** Guest label for a confirmed payment already loaded with its stay, guest, and room. */

type Named = { full_name?: string | null };
type NamedRoom = { name?: string | null };
type StayJoin = {
  guests?: Named | Named[] | null;
  rooms?: NamedRoom | NamedRoom[] | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function text(value: string | null | undefined): string {
  return (value || '').trim();
}

export function paymentGuestLabel(payment: { reservations?: StayJoin | StayJoin[] | null }): string {
  const stay = one(payment.reservations);
  const guestName = text(one(stay?.guests)?.full_name);
  if (guestName) return guestName;
  const roomName = text(one(stay?.rooms)?.name);
  if (roomName) return roomName;
  return 'Guest';
}
