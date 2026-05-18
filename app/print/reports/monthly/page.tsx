import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { currency } from '@/lib/money';
import { getMonthlyReportData } from '@/lib/report-data';
import { PrintButton } from '@/components/PrintButton';
import { PrintHeader } from '@/components/print/PrintHeader';
import { PrintFooter } from '@/components/print/PrintFooter';

type SearchParams = { hotel?: string; month?: string };

export default async function MonthlyReportPrintPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = (await searchParams) || {};
  const staff = await requireStaff();
  const month = params.month || new Date().toISOString().slice(0, 7);
  const { hotel, totalsByDay, totals } = await getMonthlyReportData(staff, { hotelId: params.hotel, month });
  if (!hotel || !totals) return <div className="print-page">No report data.</div>;
  const printedAt = new Date();

  return (
    <div className="print-page space-y-6">
      <div className="print-hidden flex gap-2"><PrintButton /><Link href={`/reports/monthly?hotel=${hotel.id}&month=${month}`} className="btn-secondary">Back to report</Link></div>
      <PrintHeader hotelName={hotel.name} address={hotel.address} phone={hotel.contact_phone} email={hotel.contact_email} reportTitle={`Monthly Report - ${month}`} printedAt={printedAt} />
      <section className="grid gap-4 md:grid-cols-4">
        <Box label="Room revenue" value={currency(totals.roomRevenue, hotel.default_currency)} />
        <Box label="Service charges" value={currency(totals.serviceCharges, hotel.default_currency)} />
        <Box label="Day tour sales" value={currency(totals.dayTourSales, hotel.default_currency)} />
        <Box label="Remittance due" value={currency(totals.remittanceDue, hotel.default_currency)} />
      </section>
      <table className="print-table">
        <thead><tr><th>Date</th><th>Room revenue</th><th>Services</th><th>Breakfast</th><th>Day tours</th><th>Payments</th><th>Cancelled/no-show</th></tr></thead>
        <tbody>
          {totalsByDay.map((day) => (
            <tr key={day.day}>
              <td>{day.day}</td>
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
      <PrintFooter printedAt={printedAt} staffName={staff.profile.full_name} />
    </div>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return <div className="print-card"><p className="text-sm text-slate-500">{label}</p><p className="text-xl font-bold">{value}</p></div>;
}
