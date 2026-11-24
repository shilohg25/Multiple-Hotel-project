import { redirect } from 'next/navigation';
import { requireStaff, canAccessHotel } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { currency } from '@/lib/money';
import {
  entriesFromChannelRateAudits,
  entriesFromPaymentChannelAudits,
  entriesFromPriceChangeLogs,
  formatHistoryValue,
  mergePriceHistory,
  type AuditLogLike
} from '@/lib/price-history';
import type { Hotel, PriceChangeLog } from '@/types/app';

type SearchParams = { hotel?: string };

const PRICE_AUDIT_ACTIONS = ['payment_channel.updated', 'rate.channel_defaults_updated'];

export default async function PriceHistoryPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = (await searchParams) || {};
  const staff = await requireStaff();
  if (staff.profile.role !== 'owner' && staff.profile.role !== 'manager') redirect('/dashboard');

  const { data: hotelsRaw } = await supabaseAdmin.from('hotels').select('*').eq('active', true).order('name');
  const hotels = ((hotelsRaw || []) as Hotel[]).filter((hotel) => canAccessHotel(staff.profile, hotel.id));
  const selectedHotel = hotels.find((hotel) => hotel.id === params.hotel) || hotels[0];

  let logs: PriceChangeLog[] = [];
  let audits: AuditLogLike[] = [];
  let loadError = '';

  if (selectedHotel) {
    const [priceResult, auditResult] = await Promise.all([
      supabaseAdmin
        .from('price_change_logs')
        .select('*, rooms:room_id(id,name), service_items:service_item_id(id,name), profiles:changed_by(id,full_name)')
        .eq('hotel_id', selectedHotel.id)
        .order('created_at', { ascending: false })
        .limit(200),
      supabaseAdmin
        .from('audit_logs')
        .select('id, action, details, created_at, profiles:actor_id(id,full_name)')
        .eq('hotel_id', selectedHotel.id)
        .in('action', PRICE_AUDIT_ACTIONS)
        .order('created_at', { ascending: false })
        .limit(200)
    ]);
    if (priceResult.error) {
      loadError = priceResult.error.message;
    } else {
      logs = (priceResult.data || []) as PriceChangeLog[];
    }
    if (auditResult.error && !loadError) {
      loadError = auditResult.error.message;
    } else if (!auditResult.error) {
      audits = (auditResult.data || []) as AuditLogLike[];
    }
  }

  const entries = mergePriceHistory([
    entriesFromPriceChangeLogs(logs),
    entriesFromPaymentChannelAudits(audits),
    entriesFromChannelRateAudits(audits)
  ]);
  const money = (value: number) => currency(value, selectedHotel?.default_currency || 'PHP');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Price Change History</h1>
        <p className="mt-1 text-slate-500">Read-only audit trail for room, service, payment-channel, and channel-rate price changes.</p>
      </div>

      <section className="card p-5">
        <form className="grid gap-3 md:grid-cols-[260px_auto] md:items-end">
          <div className="space-y-2">
            <label>Hotel</label>
            <select name="hotel" defaultValue={selectedHotel?.id || ''} className="w-full">
              {hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}
            </select>
          </div>
          <button className="btn-secondary" type="submit">Apply filter</button>
        </form>
      </section>

      {loadError ? <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</div> : null}

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[860px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Item</th>
                <th className="px-5 py-3">Old value</th>
                <th className="px-5 py-3">New value</th>
                <th className="px-5 py-3">Changed by</th>
                <th className="px-5 py-3">Date/time</th>
                <th className="px-5 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-5 py-3 capitalize">{entry.changed_type}</td>
                  <td className="px-5 py-3 text-slate-600">{entry.item_label}</td>
                  <td className="px-5 py-3 text-slate-600">{formatHistoryValue(entry.old_value, entry.value_kind, money)}</td>
                  <td className="px-5 py-3 font-semibold">{formatHistoryValue(entry.new_value, entry.value_kind, money)}</td>
                  <td className="px-5 py-3 text-slate-600">{entry.changed_by_name}</td>
                  <td className="px-5 py-3 text-slate-600">{new Date(entry.created_at).toLocaleString()}</td>
                  <td className="px-5 py-3 text-slate-600">{entry.notes || '-'}</td>
                </tr>
              ))}
              {!entries.length ? (
                <tr>
                  <td className="px-5 py-6 text-slate-500" colSpan={7}>
                    {selectedHotel ? 'No price changes recorded for this hotel yet.' : 'No accessible hotels found.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
