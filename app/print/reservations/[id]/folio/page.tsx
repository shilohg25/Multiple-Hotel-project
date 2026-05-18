import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { currency } from '@/lib/money';
import { formatDate } from '@/lib/date';
import { getReservationPrintData, shortId } from '@/lib/print-data';
import { PrintButton } from '@/components/PrintButton';
import { PrintHeader } from '@/components/print/PrintHeader';
import { PrintFooter } from '@/components/print/PrintFooter';

export default async function ReservationFolioPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const { id } = await params;
  const { reservation, charges, payments, additionalChargesTotal, confirmedPaymentsTotal, grandTotal, balanceDue } = await getReservationPrintData(id, staff);
  const printedAt = new Date();

  return (
    <div className="print-page space-y-6">
      <div className="print-hidden flex gap-2">
        <PrintButton />
        <Link href={`/reservations/${reservation.id}`} className="btn-secondary">Back to reservation</Link>
      </div>
      <PrintHeader
        hotelName={reservation.hotels.name}
        address={reservation.hotels.address}
        phone={reservation.hotels.contact_phone}
        email={reservation.hotels.contact_email}
        reportTitle="Guest Folio"
        printedAt={printedAt}
      />

      <section className="grid gap-4 md:grid-cols-2">
        <div className="print-card">
          <h2 className="font-bold">Guest</h2>
          <p>{reservation.guests.full_name}</p>
          <p>{reservation.guests.email || 'No email'} | {reservation.guests.phone || 'No phone'}</p>
          <p>Reservation {shortId(reservation.id)}</p>
        </div>
        <div className="print-card">
          <h2 className="font-bold">Stay</h2>
          <p>{reservation.rooms.name} - {reservation.rooms.room_type_name || 'Room'}</p>
          <p>{formatDate(reservation.check_in)} to {formatDate(reservation.check_out)} ({reservation.nights} night/s)</p>
          <p>{reservation.guest_count} guest/s | {reservation.booking_source.replaceAll('_', ' ')} | {reservation.status.replaceAll('_', ' ')}</p>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-bold">Charges</h2>
        <table className="print-table">
          <thead>
            <tr><th>Description</th><th>Category</th><th>Qty</th><th>Unit price</th><th>Total</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Room total</td>
              <td>room</td>
              <td>{reservation.nights}</td>
              <td>{currency(reservation.posted_room_rate, reservation.hotels.default_currency)}</td>
              <td>{currency(reservation.total_amount, reservation.hotels.default_currency)}</td>
            </tr>
            {charges.map((charge) => (
              <tr key={charge.id}>
                <td>{charge.description}</td>
                <td>{charge.category.replaceAll('_', ' ')}</td>
                <td>{Number(charge.quantity || 0).toFixed(2)}</td>
                <td>{currency(charge.unit_price, reservation.hotels.default_currency)}</td>
                <td>{currency(charge.total_amount, reservation.hotels.default_currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-bold">Payments</h2>
        <table className="print-table">
          <thead>
            <tr><th>Amount</th><th>Method</th><th>Payer</th><th>Reference</th><th>Status</th><th>Confirmed at</th></tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id}>
                <td>{currency(payment.amount, reservation.hotels.default_currency)}</td>
                <td>{payment.method.replaceAll('_', ' ')}</td>
                <td>{payment.payer_name || '-'}</td>
                <td>{payment.payment_reference || '-'}</td>
                <td>{payment.status}</td>
                <td>{payment.confirmed_at ? new Date(payment.confirmed_at).toLocaleString() : '-'}</td>
              </tr>
            ))}
            {!payments.length ? <tr><td colSpan={6}>No payments recorded.</td></tr> : null}
          </tbody>
        </table>
      </section>

      <section className="print-card ml-auto max-w-sm">
        <Summary label="Room total" value={currency(reservation.total_amount, reservation.hotels.default_currency)} />
        <Summary label="Additional charges" value={currency(additionalChargesTotal, reservation.hotels.default_currency)} />
        <Summary label="Grand total" value={currency(grandTotal, reservation.hotels.default_currency)} />
        <Summary label="Confirmed payments" value={currency(confirmedPaymentsTotal, reservation.hotels.default_currency)} />
        <Summary label="Balance due" value={currency(balanceDue, reservation.hotels.default_currency)} strong />
        <p className="mt-3 text-xs text-slate-500">Official tax receipt handling can be added later if required by local rules.</p>
      </section>

      <PrintFooter printedAt={printedAt} staffName={staff.profile.full_name} />
    </div>
  );
}

function Summary({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <p className={`flex justify-between border-b border-slate-200 py-1 ${strong ? 'font-bold' : ''}`}><span>{label}</span><span>{value}</span></p>;
}
