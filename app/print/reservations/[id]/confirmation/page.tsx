import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { currency } from '@/lib/money';
import { formatDate } from '@/lib/date';
import { getReservationPrintData, shortId } from '@/lib/print-data';
import { PrintButton } from '@/components/PrintButton';
import { PrintHeader } from '@/components/print/PrintHeader';
import { PrintFooter } from '@/components/print/PrintFooter';

export default async function BookingConfirmationPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const { id } = await params;
  const { reservation, confirmedPaymentsTotal, grandTotal, balanceDue } = await getReservationPrintData(id, staff);
  const printedAt = new Date();
  const secured = ['secured', 'checked_in', 'checked_out'].includes(reservation.status);

  return (
    <div className="print-page space-y-6">
      <div className="print-hidden flex gap-2">
        <PrintButton />
        <Link href={`/reservations/${reservation.id}`} className="btn-secondary">Back to reservation</Link>
      </div>
      <PrintHeader hotelName={reservation.hotels.name} address={reservation.hotels.address} phone={reservation.hotels.contact_phone} email={reservation.hotels.contact_email} reportTitle="Booking Confirmation" printedAt={printedAt} />
      {!secured ? <div className="print-card border-amber-400 bg-amber-50 font-semibold text-amber-900">Booking is not yet secured. Payment confirmation is required.</div> : null}
      <section className="print-card space-y-2">
        <h2 className="text-lg font-bold">Reservation {shortId(reservation.id)}</h2>
        <p>Guest: {reservation.guests.full_name} ({reservation.guests.email || 'No email'}, {reservation.guests.phone || 'No phone'})</p>
        <p>Room: {reservation.rooms.name} - {reservation.rooms.room_type_name || 'Room'}</p>
        <p>Dates: {formatDate(reservation.check_in)} to {formatDate(reservation.check_out)} ({reservation.nights} night/s)</p>
        <p>Guests: {reservation.guest_count}</p>
        <p>Status: {reservation.status.replaceAll('_', ' ')}</p>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        <div className="print-card"><p className="text-sm text-slate-500">Total due</p><p className="text-xl font-bold">{currency(grandTotal, reservation.hotels.default_currency)}</p></div>
        <div className="print-card"><p className="text-sm text-slate-500">Confirmed payments</p><p className="text-xl font-bold">{currency(confirmedPaymentsTotal, reservation.hotels.default_currency)}</p></div>
        <div className="print-card"><p className="text-sm text-slate-500">Balance</p><p className="text-xl font-bold">{currency(balanceDue, reservation.hotels.default_currency)}</p></div>
      </section>
      <section className="print-card">
        <h2 className="mb-2 text-lg font-bold">House Rules</h2>
        <p className="whitespace-pre-wrap">{reservation.hotels.house_rules}</p>
      </section>
      <section className="print-card">
        <h2 className="mb-2 text-lg font-bold">Booking Terms</h2>
        <p className="whitespace-pre-wrap">{reservation.hotels.booking_terms}</p>
      </section>
      <PrintFooter printedAt={printedAt} staffName={staff.profile.full_name} />
    </div>
  );
}
