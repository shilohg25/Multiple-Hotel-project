import 'server-only';

import { supabaseAdmin } from './supabase-admin';

export async function verifiedOutletId(hotelId: string, requested: unknown): Promise<string | null> {
  const outletId = String(requested || '').trim();
  if (!outletId) return null;
  const { data } = await supabaseAdmin.from('outlets').select('id').eq('id', outletId).eq('hotel_id', hotelId).maybeSingle();
  return data?.id ?? null;
}

export async function lockedDayMessage(hotelId: string, businessDate: string, outletId?: string | null) {
  const { data } = await supabaseAdmin
    .from('day_closes')
    .select('outlet_id')
    .eq('hotel_id', hotelId)
    .eq('business_date', businessDate)
    .eq('status', 'locked');
  const locked = (data || []).some((row) => row.outlet_id == null || (outletId != null && row.outlet_id === outletId));
  return locked ? 'This day is locked. A manager has to unlock it before anything else can be entered.' : null;
}
