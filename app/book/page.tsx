import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase-admin';

type HotelRow = {
  name: string;
  slug: string;
  active: boolean;
};

export const dynamic = 'force-dynamic';

export default async function BookIndexPage() {
  const { data } = await supabaseAdmin
    .from('hotels')
    .select('name,slug,active')
    .eq('active', true)
    .order('name');

  const hotels = (data ?? []) as HotelRow[];

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Book Your Stay</h1>
      <p className="text-sm text-slate-600">Choose a hotel to submit your booking request and upload your payment proof.</p>
      <div className="space-y-3">
        {hotels.map((hotel) => (
          <Link key={hotel.slug} href={`/book/${hotel.slug}`} className="block rounded border p-4 hover:bg-slate-50">
            <div className="font-medium">{hotel.name}</div>
            <div className="text-xs text-slate-500">Open booking form</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
