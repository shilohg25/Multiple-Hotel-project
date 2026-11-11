import { supabaseAdmin } from './supabase-admin';
import { interpretStayCleanup } from './stay-cleanup';

/** Remove pieces of a stay that must not keep holding a room. Every delete is checked. */
export async function undoStayPieces(ids: {
  reservationId?: string;
  guestId?: string;
  paymentId?: string;
  ledgerId?: string;
  proofPath?: string;
}) {
  let reservationDeleteFailed = false;
  let reservationCancelFailed = false;
  let guestDeleteFailed = false;
  let ledgerDeleteFailed = false;

  if (ids.ledgerId) {
    const deleted = await supabaseAdmin.from('ledger_entries').delete().eq('id', ids.ledgerId);
    if (deleted.error) {
      console.error(deleted.error);
      ledgerDeleteFailed = true;
    }
  }
  if (ids.paymentId) {
    const deleted = await supabaseAdmin.from('payments').delete().eq('id', ids.paymentId);
    if (deleted.error) console.error(deleted.error);
  }
  if (ids.reservationId) {
    const deleted = await supabaseAdmin.from('reservations').delete().eq('id', ids.reservationId);
    if (deleted.error) {
      console.error(deleted.error);
      reservationDeleteFailed = true;
      const cancelled = await supabaseAdmin.from('reservations').update({ status: 'cancelled' }).eq('id', ids.reservationId);
      if (cancelled.error) {
        console.error(cancelled.error);
        reservationCancelFailed = true;
      }
    }
  }
  if (ids.guestId) {
    const deleted = await supabaseAdmin.from('guests').delete().eq('id', ids.guestId);
    if (deleted.error) {
      console.error(deleted.error);
      guestDeleteFailed = true;
    }
  }
  if (ids.proofPath) {
    const removed = await supabaseAdmin.storage.from('payment-proofs').remove([ids.proofPath]);
    if (removed.error) console.error(removed.error);
  }

  return interpretStayCleanup({
    reservationDeleteFailed,
    reservationCancelFailed,
    guestDeleteFailed,
    ledgerDeleteFailed
  });
}
