import 'server-only';

import { businessToday, businessTimeZone } from './date';
import { supabaseAdmin } from './supabase-admin';

export async function businessDateForHotel(hotelId: string, requested?: string | null): Promise<string> {
  const explicit = String(requested || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(explicit)) return explicit;
  const { data } = await supabaseAdmin.from('hotels').select('timezone').eq('id', hotelId).maybeSingle();
  return businessToday(businessTimeZone(data?.timezone));
}
