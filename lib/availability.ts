import { HOLDING_STATUSES } from './public-quote';
import { supabaseAdmin } from './supabase-admin';

export async function hasReservationConflict(input: {
  roomId: string;
  checkIn: string;
  checkOut: string;
  businessToday: string;
  ignoreReservationId?: string;
}): Promise<boolean> {
  let holding = supabaseAdmin
    .from('reservations')
    .select('id')
    .eq('room_id', input.roomId)
    .in('status', [...HOLDING_STATUSES])
    .lt('check_in', input.checkOut)
    .gt('check_out', input.checkIn)
    .limit(1);

  // Still-checked-in overdue stays have check_out in the past, so the overlap
  // filter above misses them. They occupy the room until checkout.
  let overdue = supabaseAdmin
    .from('reservations')
    .select('id')
    .eq('room_id', input.roomId)
    .eq('status', 'checked_in')
    .lt('check_in', input.checkOut)
    .lt('check_out', input.businessToday)
    .limit(1);

  if (input.ignoreReservationId) {
    holding = holding.neq('id', input.ignoreReservationId);
    overdue = overdue.neq('id', input.ignoreReservationId);
  }

  const [holdingResult, overdueResult] = await Promise.all([holding, overdue]);
  if (holdingResult.error) throw holdingResult.error;
  if (overdueResult.error) throw overdueResult.error;
  return Boolean((holdingResult.data && holdingResult.data.length > 0) || (overdueResult.data && overdueResult.data.length > 0));
}
