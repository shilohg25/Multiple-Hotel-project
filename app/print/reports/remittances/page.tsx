import Link from 'next/link';
import { requireStaff, canAccessHotel } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { currency } from '@/lib/money';
import { getAccessibleHotels } from '@/lib/report-data';
import { PrintButton } from '@/components/PrintButton';
import { PrintHeader } from '@/components/print/PrintHeader';
import { PrintFooter } from '@/components/print/PrintFooter';
import type { Hotel, Remittance, ReservationCharge } from '@/types/app';

type SearchParams = { hotel?: string; outlet?: string; from?: string; to?: string };

export default async function RemittanceReportPrintPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = (await searchParams) || {};
  const staff = await requireStaff();
  const hotels = await getAccessibleHotels(staff.profile);
  const hotel = hotels.find((item) => item.id === params.hotel) || hotels[0];
  if (!hotel) return <div className="print-page">No hotel selected.</div>;
  if (!canAccessHotel(staff.profile, hotel.id)) return <div className="print-page">Access denied.</div>;
  const from = params.from || new Date().toISOString().slice(0, 10);
  const to = params.to || from;
  const [{ data: dueRaw }, { data: remittancesRaw }] = await Promise.all([
    supabaseAdmin.from('reservation_charges').select('*').eq('hotel_id', hotel.id).eq('remittance_required', true).gte('created_at', `${from}T00:00:00.000Z`).lte('created_at', `${to}T23:59:59.999Z`),
    supabaseAdmin.from('remittances').select('*, outlets:to_outlet_id(id,name,outlet_type)').eq('from_hotel_id', hotel.id).gte('period_start', from).lte('period_end', to)
  ]);
  const dueItems = (dueRaw || []) as ReservationCharge[];
  const remittances = ((remittancesRaw || []) as Remittance[]).filter((item) => !params.outlet || item.to_outlet_id === params.outlet);
  const printedAt = new Date();

  return (
    <div className="print-page space-y-6">
      <div className="print-hidden flex gap-2"><PrintButton /><Link href={`/remittances?hotel=${hotel.id}&from=${from}&to=${to}&outlet=${params.outlet || ''}`} className="btn-secondary">Back to remittances</Link></div>
      <PrintHeader hotelName={(hotel as Hotel).name} address={hotel.address} phone={hotel.contact_phone} email={hotel.contact_email} reportTitle={`Remittance Report - ${from} to ${to}`} printedAt={printedAt} />
      <table className="print-table">
        <thead><tr><th>Description</th><th>Category</th><th>Note</th><th>Amount</th></tr></thead>
        <tbody>{dueItems.map((item) => <tr key={item.id}><td>{item.description}</td><td>{item.category}</td><td>{item.remittance_note || '-'}</td><td>{currency(item.total_amount, hotel.default_currency)}</td></tr>)}{!dueItems.length ? <tr><td colSpan={4}>No due items.</td></tr> : null}</tbody>
      </table>
      <table className="print-table">
        <thead><tr><th>Period</th><th>Outlet</th><th>Due</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead>
        <tbody>{remittances.map((item) => <tr key={item.id}><td>{item.period_start} to {item.period_end}</td><td>{item.outlets?.name || '-'}</td><td>{currency(item.amount_due, hotel.default_currency)}</td><td>{currency(item.amount_paid, hotel.default_currency)}</td><td>{currency(Number(item.amount_due || 0) - Number(item.amount_paid || 0), hotel.default_currency)}</td><td>{item.status}</td></tr>)}{!remittances.length ? <tr><td colSpan={6}>No remittance records.</td></tr> : null}</tbody>
      </table>
      <PrintFooter printedAt={printedAt} staffName={staff.profile.full_name} />
    </div>
  );
}
