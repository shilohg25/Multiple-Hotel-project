import 'server-only';

import { supabaseAdmin } from './supabase-admin';

export async function lockedDayMessage(hotelId: string, businessDate: string, outletId?: string | null) {
  let query = supabaseAdmin.from('day_closes').select('id').eq('hotel_id', hotelId).eq('business_date', businessDate).eq('status', 'locked');
  query = outletId ? query.eq('outlet_id', outletId) : query.is('outlet_id', null);
  const { data } = await query.maybeSingle();
  return data ? 'This day is locked. A manager has to unlock it before anything else can be entered.' : null;
}
