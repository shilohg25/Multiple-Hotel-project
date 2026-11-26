import { redirect } from 'next/navigation';

type SearchParams = { hotel?: string; date?: string; outlet?: string };

/** Daily sales and Close the day are now one Daily cash sheet at /today/close. */
export default async function SalesPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = (await searchParams) || {};
  const query = new URLSearchParams();
  if (params.hotel) query.set('hotel', params.hotel);
  if (params.date) query.set('date', params.date);
  if (params.outlet) query.set('outlet', params.outlet);
  const suffix = query.toString();
  redirect(`/today/close${suffix ? `?${suffix}` : ''}`);
}
