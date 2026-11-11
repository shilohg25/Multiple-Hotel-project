import 'server-only';

import { AUTO_BREAKFAST_REMOVED_ACTION, autoChargeRemovedFromRead } from './breakfast-toggle';
import { stayFolioView } from './stay-total';
import { supabaseAdmin } from './supabase-admin';

export type StayMoney = {
  total: number;
  confirmed: number;
  submitted: number;
  payments: Array<{ id: string; amount: number; status: string }>;
};

/** The same stay total the folio shows, plus confirmed and submitted payments. */
export async function loadStayMoney(reservationId: string): Promise<{ ok: true; money: StayMoney } | { ok: false; error: string }> {
  const { data: reservation, error: reservationError } = await supabaseAdmin
    .from('reservations')
    .select('id, posted_room_rate, total_amount, nights, guest_count, with_breakfast, hotels(slug), rooms(room_type_name)')
    .eq('id', reservationId)
    .maybeSingle();
  if (reservationError || !reservation) {
    if (reservationError) console.error(reservationError);
    return { ok: false, error: 'The stay total could not be checked. Try again.' };
  }
  const [{ data: charges, error: chargeError }, { data: payments, error: paymentError }, removed] = await Promise.all([
    supabaseAdmin.from('reservation_charges').select('category, notes, total_amount').eq('reservation_id', reservationId),
    supabaseAdmin.from('payments').select('id, amount, status').eq('reservation_id', reservationId),
    supabaseAdmin.from('audit_logs').select('id').eq('reservation_id', reservationId).eq('action', AUTO_BREAKFAST_REMOVED_ACTION).limit(1)
  ]);
  if (chargeError || paymentError || removed.error) {
    console.error(chargeError || paymentError || removed.error);
    return { ok: false, error: 'The stay total could not be checked. Try again.' };
  }
  const hotel = Array.isArray(reservation.hotels) ? reservation.hotels[0] : reservation.hotels;
  const room = Array.isArray(reservation.rooms) ? reservation.rooms[0] : reservation.rooms;
  const folio = stayFolioView({
    hotelSlug: hotel?.slug,
    roomTypeName: room?.room_type_name,
    postedRoomRate: Number(reservation.posted_room_rate || 0),
    roomTotal: Number(reservation.total_amount || 0),
    nights: Number(reservation.nights || 1),
    guestCount: Number(reservation.guest_count || 1),
    withBreakfast: Boolean(reservation.with_breakfast),
    removed: autoChargeRemovedFromRead(removed.error, removed.data),
    charges: charges || []
  });
  const rows = (payments || []) as Array<{ id: string; amount: number; status: string }>;
  const confirmed = rows.filter((row) => row.status === 'confirmed').reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const submitted = rows.filter((row) => row.status === 'submitted').reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return { ok: true, money: { total: folio.total, confirmed, submitted, payments: rows } };
}
