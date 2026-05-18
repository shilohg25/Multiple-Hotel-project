import { redirect } from 'next/navigation';
import { requireStaff, canAccessHotel } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { currency } from '@/lib/money';
import type { Hotel, PriceChangeLog } from '@/types/app';

type SearchParams = { hotel?: string };

export default async function PriceHistoryPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = (await searchParams) || {};
  const staff = await requireStaff();
  if (staff.profile.role !== 'owner' && staff.profile.role !== 'manager') redirect('/dashboard');

  const { data: hotelsRaw } = await supabaseAdmin.from('hotels').select('*').eq('active', true).order('name');
  const hotels = ((hotelsRaw || []) as Hotel[]).filter((hotel) => canAccessHotel(staff.profile, hotel.id));
  const selectedHotel = hotels.find((hotel) => hotel.id === params.hotel) || hotels[0];

  let logs: PriceChangeLog[] = [];
  let loadError = '';

  if (selectedHotel) {
    const { data, error } = await supabaseAdmin
      .from('price_change_logs')
      .select('*, rooms:room_id(id,name), service_items:service_item_id(id,name), profiles:changed_by(id,full_name)')
      .eq('hotel_id', selectedHotel.id)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      loadError = error.message;
    } else {
      logs = (data || []) as PriceChangeLog[];
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Price Change History</h1>
        <p className="mt-1 text-slate-500">Read-only audit trail for room and service price changes.</p>
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
                <th className="px-5 py-3">Room or service</th>
                <th className="px-5 py-3">Old value</th>
                <th className="px-5 py-3">New value</th>
                <th className="px-5 py-3">Changed by</th>
                <th className="px-5 py-3">Date/time</th>
                <th className="px-5 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-5 py-3 capitalize">{log.changed_type.replaceAll('_', ' ')}</td>
                  <td className="px-5 py-3 text-slate-600">
                    {log.changed_type === 'room_price'
                      ? log.rooms?.name || 'Room deleted'
                      : log.service_items?.name || 'Service deleted'}
                  </td>
                  <td className="px-5 py-3 text-slate-600">{currency(log.old_value, selectedHotel?.default_currency || 'PHP')}</td>
                  <td className="px-5 py-3 font-semibold">{currency(log.new_value, selectedHotel?.default_currency || 'PHP')}</td>
                  <td className="px-5 py-3 text-slate-600">{log.profiles?.full_name || 'Unknown'}</td>
                  <td className="px-5 py-3 text-slate-600">{new Date(log.created_at).toLocaleString()}</td>
                  <td className="px-5 py-3 text-slate-600">{log.notes || '-'}</td>
                </tr>
              ))}
              {!logs.length ? (
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
