import Link from 'next/link';
import { allows } from '@/lib/access';
import { canAccessHotel, requireStaff } from '@/lib/auth';
import { businessToday } from '@/lib/date';
import { figuresFromLedger, type LedgerLike } from '@/lib/day-close';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { DayCloseForm } from '@/components/DayCloseForm';
import { HelpPanel } from '@/components/HelpPanel';
import { getLocale, label, messagesFor } from '@/lib/i18n';
import type { Hotel, Outlet } from '@/types/app';

type SearchParams = { hotel?: string; outlet?: string; date?: string };

export default async function CloseDayPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = (await searchParams) || {};
  const staff = await requireStaff();
  const locale = await getLocale();
  const copy = messagesFor(locale);
  const { data: hotelsRaw } = await supabaseAdmin.from('hotels').select('*').eq('active', true).order('name');
  const hotels = ((hotelsRaw || []) as Hotel[]).filter((hotel) => canAccessHotel(staff.profile, hotel.id));
  const hotel = hotels.find((item) => item.id === params.hotel) || hotels[0];
  if (!hotel) return <div className="card p-6">Add a property first.</div>;
  const date = params.date || businessToday(hotel.timezone);
  const outletId = params.outlet || null;
  const canLock = allows(staff.profile.role, 'approve');

  let closeQuery = supabaseAdmin.from('day_closes').select('*').eq('hotel_id', hotel.id).eq('business_date', date);
  closeQuery = outletId ? closeQuery.eq('outlet_id', outletId) : closeQuery.is('outlet_id', null);

  const [{ data: ledgerRaw }, { data: closeRaw }, { data: profilesRaw }, { data: outletRaw }, shortageResult] = await Promise.all([
    (outletId
      ? supabaseAdmin.from('ledger_entries').select('category, payment_method, is_collectible, amount').eq('hotel_id', hotel.id).eq('entry_date', date).eq('outlet_id', outletId)
      : supabaseAdmin.from('ledger_entries').select('category, payment_method, is_collectible, amount').eq('hotel_id', hotel.id).eq('entry_date', date).is('outlet_id', null)),
    closeQuery.maybeSingle(),
    supabaseAdmin.from('profiles').select('id, full_name, role, hotel_id').or(`hotel_id.eq.${hotel.id},role.eq.owner`),
    outletId ? supabaseAdmin.from('outlets').select('name').eq('id', outletId).maybeSingle() : Promise.resolve({ data: null }),
    canLock
      ? supabaseAdmin.from('shortage_charges').select('id, amount, note, profiles:staff_profile_id(full_name)').eq('hotel_id', hotel.id).eq('business_date', date)
      : Promise.resolve({ data: [] })
  ]);

  const figures = figuresFromLedger((ledgerRaw || []) as LedgerLike[], Number(hotel.rvf_float_amount ?? 10000));
  const outlet = outletRaw as Pick<Outlet, 'name'> | null;
  const shortages = ((shortageResult.data || []) as Array<{ id: string; amount: number; note: string | null; profiles?: { full_name?: string } | { full_name?: string }[] | null }>).map((item) => {
    const profile = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
    return { id: item.id, amount: Number(item.amount), note: item.note, staff_name: profile?.full_name || 'Staff' };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight">{label(locale, 'close.title')}</h1>
          <p className="mt-1 text-slate-600">{outlet?.name || hotel.name} · {date}. {label(locale, 'close.lead')}</p>
          {copy.needsReview ? <p className="mt-1 text-sm text-amber-800">{label(locale, 'lang.review')}</p> : null}
          <p className="mt-1 text-sm text-slate-500">Count the float and the deposit cash in two boxes. If the list of staff is empty, an owner still needs to add profiles.</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/today?hotel=${hotel.id}&date=${date}${outletId ? `&outlet=${outletId}` : ''}`} className="btn-secondary">{label(locale, 'close.back')}</Link>
          <Link href={`/print/reports/day-close?hotel=${hotel.id}&date=${date}${outletId ? `&outlet=${outletId}` : ''}`} className="btn-secondary">{label(locale, 'close.print')}</Link>
          <HelpPanel screen="close" helpLabel={label(locale, 'nav.helpButton')} allGuidesLabel={label(locale, 'help.allGuides')} guides={copy.guides} />
        </div>
      </div>
      <DayCloseForm
        hotelId={hotel.id}
        outletId={outletId}
        businessDate={date}
        currencyCode={hotel.default_currency}
        figures={figures}
        profiles={(profilesRaw || []) as { id: string; full_name: string | null; role: string }[]}
        existing={closeRaw}
        canLock={canLock}
        shortages={shortages}
      />
    </div>
  );
}
