import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { formatDate } from '@/lib/date';
import { getReservationPrintData, shortId } from '@/lib/print-data';
import { PrintButton } from '@/components/PrintButton';
import { PrintHeader } from '@/components/print/PrintHeader';
import { PrintFooter } from '@/components/print/PrintFooter';

export default async function CheckInPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const { id } = await params;
  const { reservation } = await getReservationPrintData(id, staff);
  const printedAt = new Date();

  return (
    <div className="print-page space-y-6">
      <div className="print-hidden flex gap-2">
        <PrintButton />
        <Link href={`/reservations/${reservation.id}`} className="btn-secondary">Back to reservation</Link>
      </div>
      <PrintHeader hotelName={reservation.hotels.name} address={reservation.hotels.address} phone={reservation.hotels.contact_phone} email={reservation.hotels.contact_email} reportTitle="Guest Check-in Form" printedAt={printedAt} />
      <section className="grid gap-4 md:grid-cols-2">
        <div className="print-card">
          <h2 className="mb-2 font-bold">Guest Information</h2>
          <p>Name: {reservation.guests.full_name}</p>
          <p>Email: {reservation.guests.email || 'No email'}</p>
          <p>Phone: {reservation.guests.phone || 'No phone'}</p>
        </div>
        <div className="print-card">
          <h2 className="mb-2 font-bold">Reservation</h2>
          <p>ID: {shortId(reservation.id)}</p>
          <p>Room: {reservation.rooms.name} - {reservation.rooms.room_type_name || 'Room'}</p>
          <p>Dates: {formatDate(reservation.check_in)} to {formatDate(reservation.check_out)}</p>
          <p>Guests: {reservation.guest_count}</p>
        </div>
      </section>
      <section className="print-card">
        <h2 className="mb-2 text-lg font-bold">House Rules</h2>
        <p className="whitespace-pre-wrap">{reservation.hotels.house_rules}</p>
      </section>
      <section className="grid gap-8 pt-10 md:grid-cols-3">
        <Signature label="Guest signature" />
        <Signature label="Staff signature" />
        <Signature label="Date/time" />
      </section>
      <PrintFooter printedAt={printedAt} staffName={staff.profile.full_name} />
    </div>
  );
}

function Signature({ label }: { label: string }) {
  return <div className="border-t border-slate-500 pt-2 text-sm">{label}</div>;
}
