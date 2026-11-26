export type StaySlice = {
  id: string;
  room_id: string;
  status: string;
  check_in: string;
  check_out: string;
  guest_name: string;
};

export type RoomDayStatus = 'vacant' | 'arrival' | 'in_house' | 'departure' | 'overdue';

export type DatedStay = { stay: StaySlice; status: Exclude<RoomDayStatus, 'vacant'> };

export function stayOnDate(stay: StaySlice, date: string): RoomDayStatus | null {
  if (stay.status === 'cancelled' || stay.status === 'no_show') return null;
  if (stay.status === 'checked_in' && stay.check_in <= date && date > stay.check_out) return 'overdue';
  if (stay.check_out === date && (stay.status === 'checked_in' || stay.status === 'checked_out')) return 'departure';
  if (stay.status === 'checked_in' && stay.check_in <= date && date < stay.check_out) return 'in_house';
  if (stay.check_in === date && ['tentative', 'payment_submitted', 'secured'].includes(stay.status)) return 'arrival';
  return null;
}

/** Every stay that belongs on the Today lists or charge/payment picker for `date`. */
export function staysOnDate(stays: StaySlice[], date: string): DatedStay[] {
  return stays
    .map((stay) => ({ stay, status: stayOnDate(stay, date) }))
    .filter((item): item is DatedStay => item.status !== null);
}

export function roomStatus(stays: StaySlice[], date: string): { status: RoomDayStatus; stay: StaySlice | null } {
  const ranked: RoomDayStatus[] = ['overdue', 'departure', 'in_house', 'arrival'];
  const matches = staysOnDate(stays, date);
  for (const status of ranked) {
    const found = matches.find((item) => item.status === status);
    if (found) return found;
  }
  return { status: 'vacant', stay: null };
}
