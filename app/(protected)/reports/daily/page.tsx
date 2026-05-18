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
    </div>
  );
}

function Card({ label, value }: { label: string; value: string | number }) {
  return <div className="card p-4"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>;
}
