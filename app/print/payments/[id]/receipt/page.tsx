import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { currency } from '@/lib/money';
import { getPaymentPrintData, shortId } from '@/lib/print-data';
import { PrintButton } from '@/components/PrintButton';
import { PrintHeader } from '@/components/print/PrintHeader';
import { PrintFooter } from '@/components/print/PrintFooter';

export default async function PaymentReceiptPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const { id } = await params;
  const { payment, reservation } = await getPaymentPrintData(id, staff);
  const printedAt = new Date();

  return (
    <div className="print-page space-y-6">
      <div className="print-hidden flex gap-2">
        <PrintButton label={payment.status === 'confirmed' ? 'Print Acknowledgement' : 'Print Payment Submission'} />
        <Link href={`/reservations/${reservation.id}`} className="btn-secondary">Back to reservation</Link>
      </div>
      <PrintHeader hotelName={reservation.hotels.name} address={reservation.hotels.address} phone={reservation.hotels.contact_phone} email={reservation.hotels.contact_email} reportTitle="Payment Acknowledgement" printedAt={printedAt} />
      <section className="print-card space-y-2">
        <p className="text-lg font-bold">{currency(payment.amount, reservation.hotels.default_currency)}</p>
        <p>Payment ID: {shortId(payment.id)}</p>
        <p>Reservation: {shortId(reservation.id)} | Guest: {reservation.guests.full_name}</p>
        <p>Room: {reservation.rooms.name} - {reservation.rooms.room_type_name || 'Room'}</p>
        <p>Method: {payment.method.replaceAll('_', ' ')}</p>
        <p>Payer: {payment.payer_name || '-'}</p>
        <p>Reference: {payment.payment_reference || '-'}</p>
        <p>Status: {payment.status}</p>
        <p>Confirmed at: {payment.confirmed_at ? new Date(payment.confirmed_at).toLocaleString() : '-'}</p>
        <p>Confirmed by: {payment.profiles?.full_name || '-'}</p>
        <p>Payment proof reference: {payment.proof_original_name || shortId(payment.proof_path)}</p>
      </section>
      <section className="print-card text-sm">
        This is a payment acknowledgement from the hotel system. Official tax receipt handling can be added later if required by local rules.
      </section>
      <PrintFooter printedAt={printedAt} staffName={staff.profile.full_name} />
    </div>
  );
}
