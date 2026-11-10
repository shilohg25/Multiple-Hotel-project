import Link from 'next/link';
import { requireStaff, canAccessHotel } from '@/lib/auth';
import { currency } from '@/lib/money';
import { figuresFromLedger, summarizeClose, type LedgerLike } from '@/lib/day-close';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { PrintButton } from '@/components/PrintButton';
import { PrintHeader } from '@/components/print/PrintHeader';
import type { Hotel } from '@/types/app';

type SearchParams = { hotel?: string; outlet?: string; date?: string };

export default async function DayClosePrintPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = (await searchParams) || {};
  const staff = await requireStaff();
  const { data: hotelRaw } = await supabaseAdmin.from('hotels').select('*').eq('id', params.hotel || '').maybeSingle();
  const hotel = hotelRaw as Hotel | null;
  if (!hotel || !canAccessHotel(staff.profile, hotel.id)) return <div className="print-page">No report.</div>;
  const date = params.date || '';
  let closeQuery = supabaseAdmin.from('day_closes').select('*, profiles:responsible_profile_id(full_name)').eq('hotel_id', hotel.id).eq('business_date', date);
  closeQuery = params.outlet ? closeQuery.eq('outlet_id', params.outlet) : closeQuery.is('outlet_id', null);
  const [{ data: ledgerRaw }, { data: closeRaw }] = await Promise.all([
    supabaseAdmin.from('ledger_entries').select('category, payment_method, is_collectible, amount').eq('hotel_id', hotel.id).eq('entry_date', date),
    closeQuery.maybeSingle()
  ]);
  const figures = figuresFromLedger((ledgerRaw || []) as LedgerLike[], Number(hotel.rvf_float_amount ?? 10000));
  if (closeRaw) {
    figures.floatCounted = Number(closeRaw.float_counted || 0);
    figures.drawerCounted = Number(closeRaw.drawer_counted || 0);
    figures.bankDeposit = Number(closeRaw.bank_deposit || 0);
    figures.returnToFund = Number(closeRaw.return_to_fund || 0);
  }
  const summary = summarizeClose(figures);
  const responsible = Array.isArray(closeRaw?.profiles) ? closeRaw?.profiles[0] : closeRaw?.profiles;

  return (
    <div className="print-page space-y-4">
      <div className="print-hidden"><PrintButton /><Link href={`/today/close?hotel=${hotel.id}&date=${date}`} className="btn-secondary ml-2">Back</Link></div>
      <PrintHeader hotelName={hotel.name} address={hotel.address} phone={hotel.contact_phone} email={hotel.contact_email} reportTitle={`Daily close ${date}`} printedAt={new Date()} />
      <p>Responsible staff: {responsible?.full_name || 'Not set'} · Status: {closeRaw?.status || 'not saved'} · Result: {summary.status}</p>
      <table className="print-table">
        <tbody>
          <tr><td>Room sales</td><td>{currency(summary.roomSales, hotel.default_currency)}</td></tr>
          <tr><td>Add-ons</td><td>{currency(summary.addonSales, hotel.default_currency)}</td></tr>
          <tr><td>Expenses</td><td>{currency(summary.expenses, hotel.default_currency)}</td></tr>
          <tr><td>Collectibles</td><td>{currency(summary.collectibles, hotel.default_currency)}</td></tr>
          <tr><td>GCash</td><td>{currency(summary.gcash, hotel.default_currency)}</td></tr>
          <tr><td>Maya</td><td>{currency(summary.maya, hotel.default_currency)}</td></tr>
          <tr><td>Bank</td><td>{currency(summary.bank, hotel.default_currency)}</td></tr>
          <tr><td>Card</td><td>{currency(summary.card, hotel.default_currency)}</td></tr>
          <tr><td>Cheque</td><td>{currency(summary.cheque, hotel.default_currency)}</td></tr>
          <tr><td>Cash on hand</td><td>{currency(summary.cashOnHand, hotel.default_currency)}</td></tr>
          <tr><td>RVF float</td><td>{currency(summary.rvfFloat, hotel.default_currency)}</td></tr>
          <tr><td>Float counted</td><td>{currency(summary.floatCounted, hotel.default_currency)}</td></tr>
          <tr><td>Deposit cash counted</td><td>{currency(summary.drawerCounted, hotel.default_currency)}</td></tr>
          <tr><td>Bank deposit</td><td>{currency(summary.bankDeposit, hotel.default_currency)}</td></tr>
          <tr><td>Variance</td><td>{currency(summary.variance, hotel.default_currency)} {summary.status}</td></tr>
          <tr><td>Note</td><td>{closeRaw?.variance_note || ''}</td></tr>
        </tbody>
      </table>
    </div>
  );
}
