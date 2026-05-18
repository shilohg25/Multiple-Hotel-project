import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { currency } from '@/lib/money';
import { getReservationPrintData, shortId } from '@/lib/print-data';
import { PrintButton } from '@/components/PrintButton';
import { PrintHeader } from '@/components/print/PrintHeader';
import { PrintFooter } from '@/components/print/PrintFooter';

export default async function CheckoutPrintPage({ params }: { params: Promise<{ id: string }> }) {
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
      <PrintHeader hotelName={reservation.hotels.name} address={reservation.hotels.address} phone={reservation.hotels.contact_phone} email={reservation.hotels.contact_email} reportTitle="Checkout Statement" printedAt={printedAt} />
      <section className="print-card">
        <h2 className="text-lg font-bold">Reservation {shortId(reservation.id)}</h2>
        <p>{reservation.guests.full_name} | Room {reservation.rooms.name} | Status {reservation.status.replaceAll('_', ' ')}</p>
      </section>
      <table className="print-table">
        <thead><tr><th>Description</th><th>Category</th><th>Total</th></tr></thead>
        <tbody>
          <tr><td>Room total</td><td>room</td><td>{currency(reservation.total_amount, reservation.hotels.default_currency)}</td></tr>
          {charges.map((charge) => <tr key={charge.id}><td>{charge.description}</td><td>{charge.category.replaceAll('_', ' ')}</td><td>{currency(charge.total_amount, reservation.hotels.default_currency)}</td></tr>)}
        </tbody>
      </table>
      <section>
        <h2 className="mb-2 text-lg font-bold">Payments</h2>
        <table className="print-table">
          <thead><tr><th>Amount</th><th>Method</th><th>Reference</th><th>Status</th><th>Confirmed at</th></tr></thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id}>
                <td>{currency(payment.amount, reservation.hotels.default_currency)}</td>
                <td>{payment.method.replaceAll('_', ' ')}</td>
                <td>{payment.payment_reference || '-'}</td>
                <td>{payment.status}</td>
                <td>{payment.confirmed_at ? new Date(payment.confirmed_at).toLocaleString() : '-'}</td>
              </tr>
            ))}
            {!payments.length ? <tr><td colSpan={5}>No payments recorded.</td></tr> : null}
          </tbody>
        </table>
      </section>
      <section className="print-card ml-auto max-w-sm">
        <Summary label="Room total" value={currency(reservation.total_amount, reservation.hotels.default_currency)} />
        <Summary label="Additional charges" value={currency(additionalChargesTotal, reservation.hotels.default_currency)} />
        <Summary label="Grand total" value={currency(grandTotal, reservation.hotels.default_currency)} />
        <Summary label="Confirmed payments" value={currency(confirmedPaymentsTotal, reservation.hotels.default_currency)} />
        <Summary label="Final balance" value={currency(balanceDue, reservation.hotels.default_currency)} strong />
      </section>
      {balanceDue <= 0 ? (
        <section className="grid gap-8 pt-10 md:grid-cols-3">
          <Signature label="Guest signature" />
          <Signature label="Staff signature" />
          <Signature label="Date/time" />
        </section>
      ) : null}
      <PrintFooter printedAt={printedAt} staffName={staff.profile.full_name} />
    </div>
  );
}

function Summary({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <p className={`flex justify-between border-b border-slate-200 py-1 ${strong ? 'font-bold' : ''}`}><span>{label}</span><span>{value}</span></p>;
}

function Signature({ label }: { label: string }) {
  return <div className="border-t border-slate-500 pt-2 text-sm">{label}</div>;
}
