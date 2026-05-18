import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { currency } from '@/lib/money';
import { getDailyReportData } from '@/lib/report-data';
import { SavePrintSnapshotButton } from '@/components/offline/SavePrintSnapshotButton';

type SearchParams = { hotel?: string; date?: string };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default async function DailyReportPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = (await searchParams) || {};
  const staff = await requireStaff();
  const date = params.date || todayISO();
  const { hotels, report } = await getDailyReportData(staff, { hotelId: params.hotel, date });

  if (!report) return <div className="card p-6 text-sm text-slate-500">Create a hotel before viewing reports.</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Daily Report</h1>
          <p className="mt-1 text-slate-500">Front desk daily operations summary.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/print/reports/daily?hotel=${report.hotel.id}&date=${date}`} className="btn-primary print-hidden">Print Daily Report</Link>
          <SavePrintSnapshotButton
            title={`Daily Report - ${report.hotel.name} - ${date}`}
            hotelName={report.hotel.name}
            payload={{ savedFrom: 'daily_report', date, report }}
          />
        </div>
      </div>
      <form className="card grid gap-4 p-5 md:grid-cols-[1fr_220px_auto] md:items-end">
        <div className="space-y-2">
          <label>Hotel</label>
          <select name="hotel" defaultValue={report.hotel.id} className="w-full">
            {hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label>Date</label>
          <input name="date" type="date" defaultValue={date} className="w-full" />
        </div>
        <button className="btn-secondary" type="submit">Apply</button>
      </form>
      <section className="grid gap-4 md:grid-cols-4">
        <Card label="Check-ins" value={report.checkIns.length} />
        <Card label="Check-outs" value={report.checkOuts.length} />
        <Card label="Pending proofs" value={report.pendingPayments.length} />
        <Card label="Tentative follow-ups" value={report.tentativeFollowups.length} />
      </section>
      <section className="grid gap-4 md:grid-cols-4">
        <Card label="Confirmed payments" value={currency(report.totals.roomPayments, report.hotel.default_currency)} />
        <Card label="Service charges" value={currency(report.totals.serviceCharges, report.hotel.default_currency)} />
        <Card label="Breakfast charges" value={currency(report.totals.breakfastCharges, report.hotel.default_currency)} />
        <Card label="Day tour sales" value={currency(report.totals.dayTourSales, report.hotel.default_currency)} />
      </section>
      <section className="grid gap-4 md:grid-cols-4">
        <Card label="Cash received" value={currency(report.totals.cashReceived, report.hotel.default_currency)} />
        <Card label="Bank/online received" value={currency(report.totals.bankOnlineReceived, report.hotel.default_currency)} />
        <Card label="Expected cash" value={currency(report.totals.expectedCash, report.hotel.default_currency)} />
        <Card label="Cash variance" value={currency(report.totals.variance, report.hotel.default_currency)} />
      </section>
      <section className="card overflow-hidden">
        <TableTitle title="Reservations" helper="Reservations touching this date or created today." />
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-5 py-3">Guest</th><th>Room</th><th>Dates</th><th>Status</th><th>Total</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.reservations.map((reservation) => (
                <tr key={reservation.id}>
                  <td className="px-5 py-3 font-semibold">{reservation.guests?.full_name || 'Guest'}</td>
                  <td>{reservation.rooms?.name || '-'}</td>
                  <td>{reservation.check_in} to {reservation.check_out}</td>
                  <td className="capitalize">{reservation.status.replaceAll('_', ' ')}</td>
                  <td>{currency(reservation.total_amount, report.hotel.default_currency)}</td>
                </tr>
              ))}
              {!report.reservations.length ? <tr><td className="px-5 py-6 text-slate-500" colSpan={5}>No reservations for this report date.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <TableTitle title="Confirmed payments" />
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <tbody className="divide-y divide-slate-100">
                {report.confirmedPayments.map((payment) => <tr key={payment.id}><td className="px-5 py-3">{payment.reservation_id.slice(0, 8).toUpperCase()}</td><td>{payment.method.replaceAll('_', ' ')}</td><td className="font-semibold">{currency(payment.amount, report.hotel.default_currency)}</td></tr>)}
                {!report.confirmedPayments.length ? <tr><td className="px-5 py-6 text-slate-500">No confirmed payments today.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card overflow-hidden">
          <TableTitle title="Service and breakfast charges" />
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <tbody className="divide-y divide-slate-100">
                {report.charges.map((charge) => <tr key={charge.id}><td className="px-5 py-3">{charge.description}</td><td className="capitalize">{charge.category.replaceAll('_', ' ')}</td><td className="font-semibold">{currency(charge.total_amount, report.hotel.default_currency)}</td></tr>)}
                {!report.charges.length ? <tr><td className="px-5 py-6 text-slate-500">No service charges today.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <section className="card overflow-hidden">
        <TableTitle title="Ledger / cash count" helper="Daily entries plus the saved cash count total." />
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-5 py-3">Category</th><th>Description</th><th>Method</th><th>Type</th><th>Amount</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.ledgerEntries.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-5 py-3 capitalize">{entry.category.replaceAll('_', ' ')}</td>
                  <td>{entry.description || '-'}</td>
                  <td className="capitalize">{entry.payment_method.replaceAll('_', ' ')}</td>
                  <td>{entry.is_collectible ? 'Collectible / expense' : 'Sale'}</td>
                  <td className="font-semibold">{currency(entry.amount, report.hotel.default_currency)}</td>
                </tr>
              ))}
              {!report.ledgerEntries.length ? <tr><td className="px-5 py-6 text-slate-500" colSpan={5}>No ledger entries today.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string | number }) {
  return <div className="card p-4"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>;
}

function TableTitle({ title, helper }: { title: string; helper?: string }) {
  return <div className="border-b border-slate-200 px-5 py-4"><h2 className="text-lg font-bold">{title}</h2>{helper ? <p className="mt-1 text-sm text-slate-500">{helper}</p> : null}</div>;
}
