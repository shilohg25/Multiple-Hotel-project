import Link from 'next/link';
import { requireStaff, canAccessHotel } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { PrintButton } from '@/components/PrintButton';
import { PrintHeader } from '@/components/print/PrintHeader';
import { PrintFooter } from '@/components/print/PrintFooter';
import type { Hotel, Reservation } from '@/types/app';

export default async function TentativeFollowupsPrintPage() {
  const staff = await requireStaff();
  const { data: hotelsRaw } = await supabaseAdmin.from('hotels').select('*').eq('active', true).order('name');
  const hotels = ((hotelsRaw || []) as Hotel[]).filter((hotel) => canAccessHotel(staff.profile, hotel.id));
  const hotelIds = hotels.map((hotel) => hotel.id);
  const { data } = hotelIds.length
    ? await supabaseAdmin
        .from('reservations')
        .select('*, guests(full_name,email,phone), rooms(name,room_type_name), hotels(name)')
        .in('hotel_id', hotelIds)
        .in('status', ['tentative', 'payment_submitted'])
        .order('created_at', { ascending: true })
    : { data: [] };
  const reservations = (data || []) as (Reservation & { hotels?: { name: string } })[];
  const printedAt = new Date();
  const now = Date.now();

  return (
    <div className="print-page space-y-6">
      <div className="print-hidden flex gap-2"><PrintButton /><Link href="/dashboard" className="btn-secondary">Back to dashboard</Link></div>
      <PrintHeader hotelName="Hotel Operations" reportTitle="Tentative Follow-up Report" printedAt={printedAt} />
      <table className="print-table">
        <thead><tr><th>Guest</th><th>Hotel</th><th>Room</th><th>Dates</th><th>Status</th><th>Age</th><th>Notes</th></tr></thead>
        <tbody>
          {reservations.map((reservation) => {
            const ageDays = Math.max(0, Math.floor((now - new Date(reservation.created_at).getTime()) / 86400000));
            return (
              <tr key={reservation.id}>
                <td>{reservation.guests?.full_name || 'Guest'}<br />{reservation.guests?.phone || ''}<br />{reservation.guests?.email || ''}</td>
                <td>{reservation.hotels?.name || '-'}</td>
                <td>{reservation.rooms?.name || '-'}</td>
                <td>{reservation.check_in} to {reservation.check_out}</td>
                <td>{reservation.status.replaceAll('_', ' ')}</td>
                <td>{ageDays} day/s</td>
                <td>{reservation.notes || '-'}</td>
              </tr>
            );
          })}
          {!reservations.length ? <tr><td colSpan={7}>No tentative follow-ups.</td></tr> : null}
        </tbody>
      </table>
      <PrintFooter printedAt={printedAt} staffName={staff.profile.full_name} />
    </div>
  );
}
