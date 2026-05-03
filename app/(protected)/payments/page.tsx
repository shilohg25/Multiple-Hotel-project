import Link from 'next/link';
import { requireStaff, canAccessHotel } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { currency } from '@/lib/money';
import { PaymentStatusBadge } from '@/components/StatusBadge';
import type { Guest, Hotel, Payment, Reservation } from '@/types/app';

type PaymentRow = Payment & { reservations: Reservation & { guests: Guest; hotels: Hotel } };

export default async function PaymentsPage() {
  const staff = await requireStaff();
  const { data } = await supabaseAdmin
    .from('payments')
    .select('*, reservations(*, guests(*), hotels(*))')
    .order('created_at', { ascending: false })
    .limit(100);

  const payments = ((data || []) as PaymentRow[]).filter((payment) => payment.reservations && canAccessHotel(staff.profile, payment.reservations.hotel_id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Payments</h1>
        <p className="mt-1 text-slate-500">Payment proof is mandatory. Confirmed down payments secure bookings.</p>
      </div>
      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Guest</th>
                <th className="px-5 py-3">Hotel</th>
                <th className="px-5 py-3">Amount</th>
                <th className="px-5 py-3">Method</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Reservation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="px-5 py-3 font-semibold">{payment.reservations.guests.full_name}</td>
                  <td className="px-5 py-3 text-slate-600">{payment.reservations.hotels.name}</td>
                  <td className="px-5 py-3 text-slate-600">{currency(payment.amount, payment.reservations.hotels.default_currency)}</td>
                  <td className="px-5 py-3 capitalize text-slate-600">{payment.method.replaceAll('_', ' ')}</td>
                  <td className="px-5 py-3"><PaymentStatusBadge status={payment.status} /></td>
                  <td className="px-5 py-3"><Link href={`/reservations/${payment.reservation_id}`} className="font-semibold underline">Open</Link></td>
                </tr>
              ))}
              {!payments.length ? <tr><td colSpan={6} className="px-5 py-6 text-slate-500">No payment records yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
