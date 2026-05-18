import Link from 'next/link';
import { requireStaff, canAccessHotel } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { currency } from '@/lib/money';
import { PrintButton } from '@/components/PrintButton';
import { PrintHeader } from '@/components/print/PrintHeader';
import { PrintFooter } from '@/components/print/PrintFooter';
import type { Hotel, Payment } from '@/types/app';

export default async function PendingPaymentsPrintPage() {
  const staff = await requireStaff();
  const { data: hotelsRaw } = await supabaseAdmin.from('hotels').select('*').eq('active', true).order('name');
  const hotels = ((hotelsRaw || []) as Hotel[]).filter((hotel) => canAccessHotel(staff.profile, hotel.id));
  const hotelIds = hotels.map((hotel) => hotel.id);
  const { data } = hotelIds.length
    ? await supabaseAdmin
        .from('payments')
        .select('*, reservations!inner(id,hotel_id,check_in,check_out, guests(full_name,phone), rooms(name), hotels(name,default_currency))')
        .eq('status', 'submitted')
        .in('reservations.hotel_id', hotelIds)
        .order('created_at', { ascending: false })
    : { data: [] };
  const payments = (data || []) as (Payment & { reservations: any })[];
  const printedAt = new Date();

  return (
    <div className="print-page space-y-6">
      <div className="print-hidden flex gap-2"><PrintButton /><Link href="/dashboard" className="btn-secondary">Back to dashboard</Link></div>
      <PrintHeader hotelName="Hotel Operations" reportTitle="Pending Payment Proof Report" printedAt={printedAt} />
      <table className="print-table">
        <thead><tr><th>Reservation</th><th>Guest</th><th>Hotel</th><th>Room</th><th>Dates</th><th>Amount</th><th>Submitted</th><th>Status</th></tr></thead>
        <tbody>
          {payments.map((payment) => (
            <tr key={payment.id}>
              <td>{payment.reservation_id.slice(0, 8).toUpperCase()}</td>
              <td>{payment.reservations?.guests?.full_name || 'Guest'}<br />{payment.reservations?.guests?.phone || ''}</td>
              <td>{payment.reservations?.hotels?.name || '-'}</td>
              <td>{payment.reservations?.rooms?.name || '-'}</td>
              <td>{payment.reservations?.check_in || '-'} to {payment.reservations?.check_out || '-'}</td>
              <td>{currency(payment.amount, payment.reservations?.hotels?.default_currency || 'PHP')}</td>
              <td>{new Date(payment.paid_at).toLocaleString()}</td>
              <td>{payment.status}</td>
            </tr>
          ))}
          {!payments.length ? <tr><td colSpan={8}>No pending payment proofs.</td></tr> : null}
        </tbody>
      </table>
      <PrintFooter printedAt={printedAt} staffName={staff.profile.full_name} />
    </div>
  );
}
