import { requireStaff, canAccessHotel, canManageRemittances } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { RemittanceManager } from '@/components/RemittanceManager';
import type { Hotel, Outlet, Remittance, ReservationCharge } from '@/types/app';
import Link from 'next/link';

type SearchParams = { hotel?: string; outlet?: string; from?: string; to?: string };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartISO() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export default async function RemittancesPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = (await searchParams) || {};
  const staff = await requireStaff();
  const { data: hotelsRaw } = await supabaseAdmin.from('hotels').select('*').eq('active', true).order('name');
  const hotels = ((hotelsRaw || []) as Hotel[]).filter((hotel) => canAccessHotel(staff.profile, hotel.id));
  const selectedHotel = hotels.find((hotel) => hotel.id === params.hotel) || hotels[0];

  if (!selectedHotel) {
    return <div className="card p-6 text-sm text-slate-500">Create a hotel before using remittances.</div>;
  }

  const periodStart = params.from || monthStartISO();
  const periodEnd = params.to || todayISO();
  const selectedOutletId = params.outlet || '';

  const [{ data: outletsRaw }, { data: remittancesRaw }, { data: dueItemsRaw }] = await Promise.all([
    supabaseAdmin.from('outlets').select('*').eq('hotel_id', selectedHotel.id).eq('active', true).order('name'),
    supabaseAdmin
      .from('remittances')
      .select('*, outlets:to_outlet_id(id,name,outlet_type)')
      .eq('from_hotel_id', selectedHotel.id)
      .gte('period_end', periodStart)
      .lte('period_start', periodEnd)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('reservation_charges')
      .select('*')
      .eq('hotel_id', selectedHotel.id)
      .eq('remittance_required', true)
      .gte('created_at', `${periodStart}T00:00:00.000Z`)
      .lte('created_at', `${periodEnd}T23:59:59.999Z`)
      .order('created_at', { ascending: false })
  ]);

  const outlets = (outletsRaw || []) as Outlet[];
  const remittances = ((remittancesRaw || []) as Remittance[]).filter((item) => !selectedOutletId || item.to_outlet_id === selectedOutletId);
  const dueItems = (dueItemsRaw || []) as ReservationCharge[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Remittances</h1>
        <p className="mt-1 text-slate-500">Breakfast and service-charge remittance foundation for future outlet reporting.</p>
      </div>
      <Link href={`/print/reports/remittances?hotel=${selectedHotel.id}&from=${periodStart}&to=${periodEnd}&outlet=${selectedOutletId}`} className="btn-secondary print-hidden">Print Remittance Report</Link>
      <RemittanceManager
        hotels={hotels}
        selectedHotel={selectedHotel}
        outlets={outlets}
        remittances={remittances}
        dueItems={dueItems}
        periodStart={periodStart}
        periodEnd={periodEnd}
        selectedOutletId={selectedOutletId}
        canManage={canManageRemittances(staff.profile)}
      />
    </div>
  );
}
