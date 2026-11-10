export type StaySlice = {
  id: string;
  room_id: string;
  status: string;
  check_in: string;
  check_out: string;
  guest_name: string;
};

export type RoomDayStatus = 'vacant' | 'arrival' | 'in_house' | 'departure';

export function stayOnDate(stay: StaySlice, date: string): RoomDayStatus | null {
  if (stay.status === 'cancelled' || stay.status === 'no_show') return null;
  if (stay.check_out === date && (stay.status === 'checked_in' || stay.status === 'checked_out')) return 'departure';
  if (stay.status === 'checked_in' && stay.check_in <= date && date < stay.check_out) return 'in_house';
  if (stay.check_in === date && ['tentative', 'payment_submitted', 'secured'].includes(stay.status)) return 'arrival';
  return null;
}

export function roomStatus(stays: StaySlice[], date: string): { status: RoomDayStatus; stay: StaySlice | null } {
  const ranked: RoomDayStatus[] = ['departure', 'in_house', 'arrival'];
  const matches = stays
    .map((stay) => ({ stay, status: stayOnDate(stay, date) }))
    .filter((item): item is { stay: StaySlice; status: RoomDayStatus } => item.status !== null);
  for (const status of ranked) {
    const found = matches.find((item) => item.status === status);
    if (found) return found;
  }
  return { status: 'vacant', stay: null };
}
