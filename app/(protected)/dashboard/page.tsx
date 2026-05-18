import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireStaff, canAccessHotel } from '@/lib/auth';
import { currency } from '@/lib/money';
import { StatCard } from '@/components/StatCard';
import { ReservationStatusBadge, PaymentStatusBadge } from '@/components/StatusBadge';
import type { Hotel, Payment, Reservation } from '@/types/app';

export default async function DashboardPage() {
  const staff = await requireStaff();
  const today = new Date().toISOString().slice(0, 10);

  const { data: hotelsRaw } = await supabaseAdmin.from('hotels').select('*').eq('active', true).order('name');
  const hotels = ((hotelsRaw || []) as Hotel[]).filter((hotel) => canAccessHotel(staff.profile, hotel.id));
  const hotelIds = hotels.map((hotel) => hotel.id);

  const [{ data: reservationsRaw }, { data: paymentsRaw }, { data: todayReservationsRaw }, { data: chargesRaw }, { data: roomsRaw }] = await Promise.all([
    hotelIds.length
      ? supabaseAdmin
          .from('reservations')
          .select('*, guests(full_name,email), rooms(name)')
          .in('hotel_id', hotelIds)
          .order('created_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] }),
    supabaseAdmin
      .from('payments')
      .select('*, reservations(*, guests(full_name,email), hotels(name,default_currency))')
      .eq('status', 'submitted')
      .order('created_at', { ascending: false })
      .limit(10),
    hotelIds.length
      ? supabaseAdmin
          .from('reservations')
          .select('id,status,check_in,check_out,total_amount')
          .in('hotel_id', hotelIds)
          .or(`check_in.eq.${today},check_out.eq.${today}`)
      : Promise.resolve({ data: [] }),
    hotelIds.length
      ? supabaseAdmin
          .from('reservation_charges')
          .select('total_amount,remittance_required')
          .in('hotel_id', hotelIds)
          .eq('remittance_required', true)
          .gte('created_at', `${today}T00:00:00.000Z`)
          .lte('created_at', `${today}T23:59:59.999Z`)
      : Promise.resolve({ data: [] }),
    hotelIds.length
      ? supabaseAdmin
          .from('rooms')
          .select('hotel_id,active')
          .in('hotel_id', hotelIds)
      : Promise.resolve({ data: [] })
  ]);

  const reservations = (reservationsRaw || []) as Reservation[];
  const payments = ((paymentsRaw || []) as Payment[]).filter((payment) => {
    const reservation = payment.reservations;
    return reservation ? canAccessHotel(staff.profile, reservation.hotel_id) : false;
  });

  const secured = reservations.filter((reservation) => reservation.status === 'secured').length;
  const tentative = reservations.filter((reservation) => reservation.status === 'tentative' || reservation.status === 'payment_submitted').length;
  const revenue = reservations.reduce((sum, reservation) => sum + Number(reservation.total_amount || 0), 0);
  const todayReservations = (todayReservationsRaw || []) as Reservation[];
  const todayCheckIns = todayReservations.filter((reservation) => reservation.check_in === today).length;
  const todayCheckOuts = todayReservations.filter((reservation) => reservation.check_out === today).length;
  const remittanceDue = (chargesRaw || []).reduce((sum, charge) => sum + Number(charge.total_amount || 0), 0);
  const activeRoomCountByHotel = new Map<string, number>();
  (roomsRaw || []).forEach((room) => {
    if (room.active) activeRoomCountByHotel.set(room.hotel_id, (activeRoomCountByHotel.get(room.hotel_id) || 0) + 1);
  });
  const hotelsNeedingRooms = hotels.filter((hotel) => (activeRoomCountByHotel.get(hotel.id) || 0) === 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Dashboard</h1>
          <p className="mt-1 text-slate-500">Reservations, payment proofs, and hotel operations.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/reservations/new" className="btn-primary">New reservation</Link>
          <Link href={hotels[0] ? `/book/${hotels[0].slug}` : '/hotels'} className="btn-secondary">Public booking page</Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/reports/daily" className="btn-secondary">Daily Report</Link>
        <Link href="/reports/monthly" className="btn-secondary">Monthly Report</Link>
        <Link href="/print/reports/pending-payments" className="btn-secondary">Pending Payments</Link>
        <Link href="/print/reports/tentative-followups" className="btn-secondary">Tentative Follow-ups</Link>
      </div>

      {staff.profile.role === 'owner' && hotelsNeedingRooms.length ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <h2 className="font-bold">Setup needed: Some hotels/properties have no active rooms/units.</h2>
              <p className="mt-1 text-sm">{hotelsNeedingRooms.map((hotel) => hotel.name).join(', ')}</p>
            </div>
            <Link href={`/rooms?hotel=${hotelsNeedingRooms[0].id}&focus=add`} className="btn-primary">Add rooms/units</Link>
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Active hotels" value={hotels.length} />
        <StatCard label="Today check-ins" value={todayCheckIns} helper="Arrivals" />
        <StatCard label="Today check-outs" value={todayCheckOuts} helper="Departures" />
        <StatCard label="Pending payment proofs" value={payments.length} helper="Need review" />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Secured bookings" value={secured} helper="Recent records" />
        <StatCard label="Tentative / review" value={tentative} helper="Need payment confirmation" />
        <StatCard label="Recent booking value" value={currency(revenue, hotels[0]?.default_currency || 'PHP')} />
        <StatCard label="Remittance due today" value={currency(remittanceDue, hotels[0]?.default_currency || 'PHP')} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-bold">Latest reservations</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {reservations.length ? reservations.map((reservation) => (
              <Link href={`/reservations/${reservation.id}`} key={reservation.id} className="block px-5 py-4 hover:bg-slate-50">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{reservation.guests?.full_name || 'Guest'}</p>
                    <p className="text-sm text-slate-500">{reservation.check_in} → {reservation.check_out} · Room {reservation.rooms?.name}</p>
                  </div>
                  <ReservationStatusBadge status={reservation.status} />
                </div>
              </Link>
            )) : <p className="px-5 py-6 text-sm text-slate-500">No reservations yet.</p>}
          </div>
        </section>

        <section className="card overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-bold">Payment proofs waiting for confirmation</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {payments.length ? payments.map((payment) => (
              <Link href={`/reservations/${payment.reservation_id}`} key={payment.id} className="block px-5 py-4 hover:bg-slate-50">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{currency(payment.amount)}</p>
                    <p className="text-sm text-slate-500">{payment.method.replaceAll('_', ' ')} · proof uploaded</p>
                  </div>
                  <PaymentStatusBadge status={payment.status} />
                </div>
              </Link>
            )) : <p className="px-5 py-6 text-sm text-slate-500">No pending payment proofs.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
