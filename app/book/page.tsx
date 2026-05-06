import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase-server';

type HotelRow = {
  name: string;
  slug: string;
  is_active: boolean;
};

export default async function BookIndexPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('hotels')
    .select('name,slug,is_active')
    .eq('is_active', true)
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
