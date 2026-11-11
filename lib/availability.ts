import { HOLDING_STATUSES } from './public-quote';
import { supabaseAdmin } from './supabase-admin';

export async function hasReservationConflict(input: {
  roomId: string;
  checkIn: string;
  checkOut: string;
  ignoreReservationId?: string;
}): Promise<boolean> {
  let query = supabaseAdmin
    .from('reservations')
    .select('id')
    .eq('room_id', input.roomId)
    .in('status', [...HOLDING_STATUSES])
    .lt('check_in', input.checkOut)
    .gt('check_out', input.checkIn)
    .limit(1);

  if (input.ignoreReservationId) {
    query = query.neq('id', input.ignoreReservationId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return Boolean(data && data.length > 0);
}
