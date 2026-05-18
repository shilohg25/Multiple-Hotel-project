import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  requireStaff,
  canAccessHotel,
  canManagePayments,
  canAddReservationCharges,
  canManageReservationCharges,
  canDeleteReservationCharges
} from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { currency } from '@/lib/money';
import { formatDate } from '@/lib/date';
import { ReservationStatusBadge } from '@/components/StatusBadge';
import { PaymentPanel } from '@/components/PaymentPanel';
import { EmailDraftPanel } from '@/components/EmailDraftPanel';
import { ReservationFolio } from '@/components/ReservationFolio';
import { SavePrintSnapshotButton } from '@/components/offline/SavePrintSnapshotButton';
import type { Guest, Hotel, Payment, Reservation, ReservationCharge, Room, ServiceItem } from '@/types/app';

type PaymentWithUrl = Payment & { proof_url?: string | null };

export default async function ReservationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from('reservations')
    .select('*, guests(*), hotels(*), rooms(*)')
    .eq('id', id)
    .single();

  if (error || !data) notFound();
  if (!canAccessHotel(staff.profile, data.hotel_id)) notFound();

  const reservation = data as Reservation & { guests: Guest; hotels: Hotel; rooms: Room };
  const [{ data: paymentsRaw }, { data: chargesRaw }, { data: serviceItemsRaw }] = await Promise.all([
    supabaseAdmin
      .from('payments')
      .select('*')
      .eq('reservation_id', reservation.id)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('reservation_charges')
      .select('*, service_items(id,name)')
      .eq('reservation_id', reservation.id)
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('service_items')
      .select('*')
      .eq('hotel_id', reservation.hotel_id)
      .eq('active', true)
      .order('name')
  ]);

  const payments = await Promise.all(((paymentsRaw || []) as Payment[]).map(async (payment) => {
    const { data: signed } = await supabaseAdmin.storage.from('payment-proofs').createSignedUrl(payment.proof_path, 60 * 60);
    return { ...payment, proof_url: signed?.signedUrl || null } as PaymentWithUrl;
  }));
  const charges = (chargesRaw || []) as ReservationCharge[];
  const serviceItems = (serviceItemsRaw || []) as ServiceItem[];
  const chargesSubtotal = charges.reduce((sum, charge) => sum + Number(charge.total_amount || 0), 0);
  const confirmedTotal = payments.filter((payment) => payment.status === 'confirmed').reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const balance = Number(reservation.total_amount || 0) + chargesSubtotal - confirmedTotal;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <Link href={`/reservations?hotel=${reservation.hotel_id}`} className="text-sm font-semibold text-slate-500 hover:text-slate-900">Back to board</Link>
          <h1 className="mt-2 text-3xl font-black tracking-tight">{reservation.guests.full_name}</h1>
          <p className="mt-1 text-slate-500">{reservation.hotels.name} - Room {reservation.rooms.name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/print/reservations/${reservation.id}/folio`} className="btn-secondary print-hidden">Print Folio</a>
          <a href={`/print/reservations/${reservation.id}/confirmation`} className="btn-secondary print-hidden">Print Confirmation</a>
          <a href={`/print/reservations/${reservation.id}/checkin`} className="btn-secondary print-hidden">Print Check-in Form</a>
          <a href={`/print/reservations/${reservation.id}/checkout`} className="btn-secondary print-hidden">Print Checkout Statement</a>
          <SavePrintSnapshotButton
            title={`Guest Folio - ${reservation.guests.full_name}`}
            hotelName={reservation.hotels.name}
            payload={{
              savedFrom: 'reservation_detail',
              reservation: {
                id: reservation.id,
                status: reservation.status,
                check_in: reservation.check_in,
                check_out: reservation.check_out,
                nights: reservation.nights,
                guest_count: reservation.guest_count,
                booking_source: reservation.booking_source,
                room_total: reservation.total_amount,
                downpayment_required: reservation.downpayment_required
              },
              guest: reservation.guests,
              hotel: {
                name: reservation.hotels.name,
                address: reservation.hotels.address,
                phone: reservation.hotels.contact_phone,
                email: reservation.hotels.contact_email
              },
              room: {
                name: reservation.rooms.name,
                room_type_name: reservation.rooms.room_type_name
              },
              charges,
              payments: payments.map(({ proof_url: _proofUrl, ...payment }) => payment),
              totals: {
                room_total: Number(reservation.total_amount || 0),
                additional_charges_total: chargesSubtotal,
                confirmed_payments_total: confirmedTotal,
                balance_due: balance
              }
            }}
          />
          <ReservationStatusBadge status={reservation.status} />
        </div>
      </div>

      <section className="card p-6">
        <div className="grid gap-5 md:grid-cols-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stay</p>
            <p className="mt-1 font-bold">{formatDate(reservation.check_in)} to {formatDate(reservation.check_out)}</p>
            <p className="text-sm text-slate-500">{reservation.nights} night(s)</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Guest</p>
            <p className="mt-1 font-bold">{reservation.guests.full_name}</p>
            <p className="text-sm text-slate-500">{reservation.guests.email || 'No email'} - {reservation.guests.phone || 'No phone'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Amounts</p>
            <p className="mt-1 font-bold">Room total {currency(reservation.total_amount, reservation.hotels.default_currency)}</p>
            <p className="text-sm text-slate-500">Required DP {currency(reservation.downpayment_required, reservation.hotels.default_currency)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Balance</p>
            <p className="mt-1 font-bold">{currency(balance, reservation.hotels.default_currency)}</p>
            <p className="text-sm text-slate-500">Confirmed {currency(confirmedTotal, reservation.hotels.default_currency)}</p>
          </div>
        </div>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          <Info label="Booking source" value={reservation.booking_source.replaceAll('_', ' ')} />
          <Info label="Breakfast" value={reservation.with_breakfast ? 'Yes' : 'No - room only'} />
          <Info label="Surcharge" value={reservation.surcharge_label ? `${reservation.surcharge_label}: ${currency(reservation.surcharge_amount, reservation.hotels.default_currency)}` : '-'} />
          <Info label="House rules email draft" value={reservation.house_rules_sent_at ? 'Marked sent' : 'Not marked sent'} />
          <Info label="Confirmation email draft" value={reservation.confirmation_sent_at ? 'Marked sent' : 'Not marked sent'} />
          <Info label="Notes" value={reservation.notes || '-'} />
        </div>
      </section>

      <ReservationFolio
        reservationId={reservation.id}
        currencyCode={reservation.hotels.default_currency}
        roomTotal={Number(reservation.total_amount || 0)}
        confirmedPaymentsTotal={confirmedTotal}
        charges={charges}
        serviceItems={serviceItems}
        canAdd={canAddReservationCharges(staff.profile)}
        canManage={canManageReservationCharges(staff.profile)}
        canDelete={canDeleteReservationCharges(staff.profile)}
      />

      <EmailDraftPanel hotel={reservation.hotels} reservation={reservation} guest={reservation.guests} />

      <PaymentPanel reservationId={reservation.id} payments={payments} currencyCode={reservation.hotels.default_currency} canConfirm={canManagePayments(staff.profile)} />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-slate-700">{value}</p>
    </div>
  );
}
