import { redirect } from 'next/navigation';
import { canManagePricingSetup, requireStaff } from '@/lib/auth';
import { hotelsForProfile, rowsForHotels } from '@/lib/hotel-scope';
import { supabaseAdmin } from '@/lib/supabase-admin';

const examples = ['breakfast', 'extra bed', 'chauffeur', 'late checkout', 'early check-in', 'laundry', 'corkage', 'damage charge', 'other'];

type ChargeRow = {
  id: string;
  hotel_id: string;
  name: string;
  category: string;
  default_price: number;
  active: boolean;
};

export default async function ChargesPage() {
  const staff = await requireStaff();
  if (!canManagePricingSetup(staff.profile)) redirect('/dashboard');

  const { data: hotelsRaw } = await supabaseAdmin.from('hotels').select('id').eq('active', true);
  const hotelIds = hotelsForProfile(staff.profile, (hotelsRaw || []) as { id: string }[]).map((hotel) => hotel.id);
  const { data } = hotelIds.length
    ? await supabaseAdmin.from('service_items').select('id, hotel_id, name, category, default_price, active').in('hotel_id', hotelIds).order('name')
    : { data: [] };
  const charges = rowsForHotels((data || []) as ChargeRow[], new Set(hotelIds));

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-black">Charges</h1>
      <p className="text-sm text-slate-600">Examples: {examples.join(', ')}.</p>
      <div className="card p-4">
        <ul className="space-y-2">
          {charges.map((item) => (
            <li key={item.id}>{item.name} · {item.category} · ₱{Number(item.default_price).toFixed(2)} {item.active ? '' : '(inactive)'}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
