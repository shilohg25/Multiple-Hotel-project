import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { currency } from '@/lib/money';
import { getDailyReportData } from '@/lib/report-data';
import { PrintButton } from '@/components/PrintButton';
import { PrintHeader } from '@/components/print/PrintHeader';
import { PrintFooter } from '@/components/print/PrintFooter';

type SearchParams = { hotel?: string; date?: string };

export default async function DailyReportPrintPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = (await searchParams) || {};
  const staff = await requireStaff();
  const date = params.date || new Date().toISOString().slice(0, 10);
  const { report } = await getDailyReportData(staff, { hotelId: params.hotel, date });
  if (!report) return <div className="print-page">No report data.</div>;
  const printedAt = new Date();

  return (
    <div className="print-page space-y-6">
      <div className="print-hidden flex gap-2"><PrintButton /><Link href={`/reports/daily?hotel=${report.hotel.id}&date=${date}`} className="btn-secondary">Back to report</Link></div>
      <PrintHeader hotelName={report.hotel.name} address={report.hotel.address} phone={report.hotel.contact_phone} email={report.hotel.contact_email} reportTitle={`Daily Report - ${date}`} printedAt={printedAt} />
      <section className="grid gap-4 md:grid-cols-4">
        <Box label="Check-ins" value={report.checkIns.length} />
        <Box label="Check-outs" value={report.checkOuts.length} />
        <Box label="Pending proofs" value={report.pendingPayments.length} />
        <Box label="Tentative follow-ups" value={report.tentativeFollowups.length} />
      </section>
      <table className="print-table">
        <tbody>
          <Row label="Confirmed payments" value={currency(report.totals.roomPayments, report.hotel.default_currency)} />
          <Row label="Service charges" value={currency(report.totals.serviceCharges, report.hotel.default_currency)} />
          <Row label="Breakfast charges" value={currency(report.totals.breakfastCharges, report.hotel.default_currency)} />
          <Row label="Day tour sales" value={currency(report.totals.dayTourSales, report.hotel.default_currency)} />
          <Row label="Cash received" value={currency(report.totals.cashReceived, report.hotel.default_currency)} />
          <Row label="Bank/online received" value={currency(report.totals.bankOnlineReceived, report.hotel.default_currency)} />
          <Row label="Expected cash" value={currency(report.totals.expectedCash, report.hotel.default_currency)} />
          <Row label="Actual ending cash" value={currency(report.totals.actualEndingCash, report.hotel.default_currency)} />
          <Row label="Variance" value={currency(report.totals.variance, report.hotel.default_currency)} />
          <Row label="Remittance due" value={currency(report.totals.remittanceDue, report.hotel.default_currency)} />
          <Row label="Remittance paid" value={currency(report.totals.remittancePaid, report.hotel.default_currency)} />
        </tbody>
      </table>
      <section>
        <h2 className="mb-2 text-lg font-bold">Pending Payment Proofs</h2>
        <table className="print-table"><tbody>{report.pendingPayments.map((payment) => <tr key={payment.id}><td>{payment.reservation_id}</td><td>{currency(payment.amount, report.hotel.default_currency)}</td><td>{payment.status}</td></tr>)}{!report.pendingPayments.length ? <tr><td>None</td></tr> : null}</tbody></table>
      </section>
      <section>
        <h2 className="mb-2 text-lg font-bold">Reservations</h2>
        <table className="print-table">
          <thead><tr><th>Guest</th><th>Room</th><th>Dates</th><th>Status</th><th>Total</th></tr></thead>
          <tbody>
            {report.reservations.map((reservation) => (
              <tr key={reservation.id}>
                <td>{reservation.guests?.full_name || 'Guest'}</td>
                <td>{reservation.rooms?.name || '-'}</td>
                <td>{reservation.check_in} to {reservation.check_out}</td>
                <td>{reservation.status.replaceAll('_', ' ')}</td>
                <td>{currency(reservation.total_amount, report.hotel.default_currency)}</td>
              </tr>
            ))}
            {!report.reservations.length ? <tr><td colSpan={5}>No reservations for this report date.</td></tr> : null}
          </tbody>
        </table>
      </section>
      <section>
        <h2 className="mb-2 text-lg font-bold">Confirmed Payments</h2>
        <table className="print-table">
          <thead><tr><th>Reservation</th><th>Method</th><th>Amount</th><th>Confirmed at</th></tr></thead>
          <tbody>
            {report.confirmedPayments.map((payment) => (
              <tr key={payment.id}>
                <td>{payment.reservation_id.slice(0, 8).toUpperCase()}</td>
                <td>{payment.method.replaceAll('_', ' ')}</td>
                <td>{currency(payment.amount, report.hotel.default_currency)}</td>
                <td>{payment.confirmed_at ? new Date(payment.confirmed_at).toLocaleString() : '-'}</td>
              </tr>
            ))}
            {!report.confirmedPayments.length ? <tr><td colSpan={4}>No confirmed payments today.</td></tr> : null}
          </tbody>
        </table>
      </section>
      <section>
        <h2 className="mb-2 text-lg font-bold">Service Charges</h2>
        <table className="print-table">
          <thead><tr><th>Description</th><th>Category</th><th>Total</th></tr></thead>
          <tbody>
            {report.charges.map((charge) => <tr key={charge.id}><td>{charge.description}</td><td>{charge.category.replaceAll('_', ' ')}</td><td>{currency(charge.total_amount, report.hotel.default_currency)}</td></tr>)}
            {!report.charges.length ? <tr><td colSpan={3}>No service charges today.</td></tr> : null}
          </tbody>
        </table>
      </section>
      <section>
        <h2 className="mb-2 text-lg font-bold">Ledger Entries</h2>
        <table className="print-table">
          <thead><tr><th>Category</th><th>Description</th><th>Method</th><th>Type</th><th>Amount</th></tr></thead>
          <tbody>
            {report.ledgerEntries.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.category.replaceAll('_', ' ')}</td>
                <td>{entry.description || '-'}</td>
                <td>{entry.payment_method.replaceAll('_', ' ')}</td>
                <td>{entry.is_collectible ? 'Collectible / expense' : 'Sale'}</td>
                <td>{currency(entry.amount, report.hotel.default_currency)}</td>
              </tr>
            ))}
            {!report.ledgerEntries.length ? <tr><td colSpan={5}>No ledger entries today.</td></tr> : null}
          </tbody>
        </table>
      </section>
      <PrintFooter printedAt={printedAt} staffName={staff.profile.full_name} />
    </div>
  );
}

function Box({ label, value }: { label: string; value: string | number }) {
  return <div className="print-card"><p className="text-sm text-slate-500">{label}</p><p className="text-xl font-bold">{value}</p></div>;
}

function Row({ label, value }: { label: string; value: string }) {
  return <tr><th>{label}</th><td>{value}</td></tr>;
}
