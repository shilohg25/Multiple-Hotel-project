import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { currency } from '@/lib/money';
import { getMonthlyReportData } from '@/lib/report-data';
import { SavePrintSnapshotButton } from '@/components/offline/SavePrintSnapshotButton';

type SearchParams = { hotel?: string; month?: string };

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export default async function MonthlyReportPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = (await searchParams) || {};
  const staff = await requireStaff();
  const month = params.month || currentMonth();
  const { hotels, hotel, totalsByDay, totals } = await getMonthlyReportData(staff, { hotelId: params.hotel, month });

  if (!hotel || !totals) return <div className="card p-6 text-sm text-slate-500">Create a hotel before viewing reports.</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Monthly Report</h1>
          <p className="mt-1 text-slate-500">Revenue, payments, day tours, and remittance summary.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/print/reports/monthly?hotel=${hotel.id}&month=${month}`} className="btn-primary print-hidden">Print Monthly Report</Link>
          <SavePrintSnapshotButton
            title={`Monthly Report - ${hotel.name} - ${month}`}
            hotelName={hotel.name}
            payload={{ savedFrom: 'monthly_report', month, hotel, totals, totalsByDay }}
          />
        </div>
      </div>
      <form className="card grid gap-4 p-5 md:grid-cols-[1fr_220px_auto] md:items-end">
        <div className="space-y-2">
          <label>Hotel</label>
          <select name="hotel" defaultValue={hotel.id} className="w-full">
            {hotels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label>Month</label>
          <input name="month" type="month" defaultValue={month} className="w-full" />
        </div>
        <button className="btn-secondary" type="submit">Apply</button>
      </form>
      <section className="grid gap-4 md:grid-cols-4">
        <Card label="Room revenue" value={currency(totals.roomRevenue, hotel.default_currency)} />
        <Card label="Service charges" value={currency(totals.serviceCharges, hotel.default_currency)} />
        <Card label="Breakfast charges" value={currency(totals.breakfastCharges, hotel.default_currency)} />
        <Card label="Day tour sales" value={currency(totals.dayTourSales, hotel.default_currency)} />
      </section>
      <section className="grid gap-4 md:grid-cols-4">
        <Card label="Confirmed payments" value={currency(totals.confirmedPayments, hotel.default_currency)} />
        <Card label="Cancelled / no-show" value={totals.cancelledNoShow} />
        <Card label="Remittance due" value={currency(totals.remittanceDue, hotel.default_currency)} />
        <Card label="Occupancy signal" value={`${totalsByDay.filter((day) => day.roomRevenue > 0).length} active day(s)`} />
      </section>
      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-5 py-3">Date</th><th>Room revenue</th><th>Services</th><th>Breakfast</th><th>Day tours</th><th>Payments</th><th>Cancelled/no-show</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {totalsByDay.map((day) => (
                <tr key={day.day}>
                  <td className="px-5 py-3 font-semibold">{day.day}</td>
                  <td>{currency(day.roomRevenue, hotel.default_currency)}</td>
                  <td>{currency(day.serviceCharges, hotel.default_currency)}</td>
                  <td>{currency(day.breakfastCharges, hotel.default_currency)}</td>
                  <td>{currency(day.dayTourSales, hotel.default_currency)}</td>
                  <td>{currency(day.confirmedPayments, hotel.default_currency)}</td>
                  <td>{day.cancelledNoShow}</td>
                </tr>
              ))}
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
