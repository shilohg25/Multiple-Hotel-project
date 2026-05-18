import { requireStaff, canAccessHotel } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { SalesCashManager } from '@/components/SalesCashManager';
import type { CashCount, Hotel, LedgerEntry } from '@/types/app';

type SearchParams = { hotel?: string; date?: string };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default async function SalesPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = (await searchParams) || {};
  const staff = await requireStaff();
  const selectedDate = params.date || todayISO();

  const { data: hotelsRaw } = await supabaseAdmin.from('hotels').select('*').eq('active', true).order('name');
  const hotels = ((hotelsRaw || []) as Hotel[]).filter((hotel) => canAccessHotel(staff.profile, hotel.id));
  const selectedHotel = hotels.find((hotel) => hotel.id === params.hotel) || hotels[0];

  if (!selectedHotel) {
    return (
      <div className="card p-6">
        <h1 className="text-2xl font-black">Sales / Cash count</h1>
        <p className="mt-2 text-sm text-slate-500">Create a hotel first.</p>
      </div>
    );
  }

  const dayStart = `${selectedDate}T00:00:00.000Z`;
  const dayEnd = `${selectedDate}T23:59:59.999Z`;

  const [{ data: ledgerRaw }, { data: cashRaw }, { data: paymentsRaw }, { data: chargesRaw }, { data: dayToursRaw }, { data: remittancesRaw }] = await Promise.all([
    supabaseAdmin
      .from('ledger_entries')
      .select('*')
      .eq('hotel_id', selectedHotel.id)
      .eq('entry_date', selectedDate)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('cash_counts')
      .select('*')
      .eq('hotel_id', selectedHotel.id)
      .eq('count_date', selectedDate)
      .order('denomination', { ascending: false }),
    supabaseAdmin
      .from('payments')
      .select('amount, reservations!inner(hotel_id)')
      .eq('status', 'confirmed')
      .eq('reservations.hotel_id', selectedHotel.id)
      .gte('confirmed_at', dayStart)
      .lte('confirmed_at', dayEnd),
    supabaseAdmin
      .from('reservation_charges')
      .select('category,total_amount,remittance_required')
      .eq('hotel_id', selectedHotel.id)
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd),
    supabaseAdmin
      .from('day_tour_bookings')
      .select('total_amount')
      .eq('hotel_id', selectedHotel.id)
      .eq('tour_date', selectedDate)
      .in('status', ['secured', 'completed']),
    supabaseAdmin
      .from('remittances')
      .select('amount_due,amount_paid')
      .eq('from_hotel_id', selectedHotel.id)
      .lte('period_start', selectedDate)
      .gte('period_end', selectedDate)
  ]);

  const charges = (chargesRaw || []) as { category: string; total_amount: number; remittance_required: boolean }[];
  const breakdown = {
    roomPayments: (paymentsRaw || []).reduce((sum, item) => sum + Number(item.amount || 0), 0),
    serviceCharges: charges.reduce((sum, item) => sum + Number(item.total_amount || 0), 0),
    breakfastCharges: charges.filter((item) => item.category === 'breakfast').reduce((sum, item) => sum + Number(item.total_amount || 0), 0),
    dayTourSales: (dayToursRaw || []).reduce((sum, item) => sum + Number(item.total_amount || 0), 0),
    remittanceDue: (remittancesRaw || []).reduce((sum, item) => sum + Number(item.amount_due || 0), 0),
    remittancePaid: (remittancesRaw || []).reduce((sum, item) => sum + Number(item.amount_paid || 0), 0)
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Sales / Cash count</h1>
        <p className="mt-1 text-slate-500">Daily ledger, collectibles, and cash count for front desk closing.</p>
      </div>
      <SalesCashManager
        hotels={hotels}
        selectedHotel={selectedHotel}
        selectedDate={selectedDate}
        ledgerEntries={(ledgerRaw || []) as LedgerEntry[]}
        cashCounts={(cashRaw || []) as CashCount[]}
        breakdown={breakdown}
      />
    </div>
  );
}
