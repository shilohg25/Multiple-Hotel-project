import { requireStaff, canAccessHotel, canManageDayTourPackages } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { DayTourPackageManager } from '@/components/DayTourPackageManager';
import type { DayTourPackage, Hotel, Outlet } from '@/types/app';

type SearchParams = { hotel?: string };

export default async function DayTourPackagesPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = (await searchParams) || {};
  const staff = await requireStaff();
  const { data: hotelsRaw } = await supabaseAdmin.from('hotels').select('*').eq('active', true).order('name');
  const hotels = ((hotelsRaw || []) as Hotel[]).filter((hotel) => canAccessHotel(staff.profile, hotel.id));
  const selectedHotel = hotels.find((hotel) => hotel.id === params.hotel) || hotels[0];

  if (!selectedHotel) {
    return <div className="card p-6 text-sm text-slate-500">Create a hotel before adding day tour packages.</div>;
  }

  const [{ data: packagesRaw }, { data: outletsRaw }] = await Promise.all([
    supabaseAdmin.from('day_tour_packages').select('*, outlets:remittance_outlet_id(id,name)').eq('hotel_id', selectedHotel.id).order('name'),
    supabaseAdmin.from('outlets').select('*').eq('hotel_id', selectedHotel.id).eq('active', true).order('name')
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Day Tour Packages</h1>
        <p className="mt-1 text-slate-500">Basic package setup for day tour operations and future restaurant remittance.</p>
      </div>
      <DayTourPackageManager
        hotels={hotels}
        selectedHotel={selectedHotel}
        packages={(packagesRaw || []) as DayTourPackage[]}
        outlets={(outletsRaw || []) as Outlet[]}
        canManage={canManageDayTourPackages(staff.profile)}
      />
    </div>
  );
}
