import Link from 'next/link';
import { allows } from '@/lib/access';
import { canAccessHotel, requireStaff } from '@/lib/auth';
import { businessToday, localDayBounds } from '@/lib/date';
import { type SavedCountRow } from '@/lib/day-close';
import { sheetBaseFigures, splitSheetLedger, type SavedCloseRow, type SheetLedgerRow } from '@/lib/cash-sheet';
import { currency } from '@/lib/money';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { CashSheetEntries } from '@/components/CashSheetEntries';
import { DayCloseForm } from '@/components/DayCloseForm';
import { HelpPanel } from '@/components/HelpPanel';
import { getLocale, label, messagesFor } from '@/lib/i18n';
import type { Hotel, Outlet } from '@/types/app';

type SearchParams = { hotel?: string; outlet?: string; date?: string };

const LEDGER_COLUMNS = 'id, category, description, payment_method, is_collectible, amount, reservation_id, created_at';

export default async function DailyCashSheetPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = (await searchParams) || {};
  const staff = await requireStaff();
  const locale = await getLocale();
  const copy = messagesFor(locale);
  const { data: hotelsRaw } = await supabaseAdmin.from('hotels').select('*').eq('active', true).order('name');
  const hotels = ((hotelsRaw || []) as Hotel[]).filter((hotel) => canAccessHotel(staff.profile, hotel.id));
  const hotel = hotels.find((item) => item.id === params.hotel) || hotels[0];
  if (!hotel) return <div className="card p-6">No property is set up for your account yet. Ask a manager or the owner.</div>;
  const date = params.date || businessToday(hotel.timezone);
  const outletId = params.outlet || null;
  const canLock = allows(staff.profile.role, 'approve');
  const { start: dayStart, end: dayEnd } = localDayBounds(date, hotel.timezone);

  let closeQuery = supabaseAdmin.from('day_closes').select('*').eq('hotel_id', hotel.id).eq('business_date', date);
  closeQuery = outletId ? closeQuery.eq('outlet_id', outletId) : closeQuery.is('outlet_id', null);

  const [{ data: ledgerRaw }, { data: closeRaw }, { data: profilesRaw }, { data: outletRaw }, shortageResult, { data: chargesRaw }, { data: dayToursRaw }, { data: remittancesRaw }] = await Promise.all([
    // Same ledger scope the close has always used (hotel + date + outlet, or no outlet).
    (outletId
      ? supabaseAdmin.from('ledger_entries').select(LEDGER_COLUMNS).eq('hotel_id', hotel.id).eq('entry_date', date).eq('outlet_id', outletId).order('created_at', { ascending: true })
      : supabaseAdmin.from('ledger_entries').select(LEDGER_COLUMNS).eq('hotel_id', hotel.id).eq('entry_date', date).is('outlet_id', null).order('created_at', { ascending: true })),
    closeQuery.maybeSingle(),
    supabaseAdmin.from('profiles').select('id, full_name, role, hotel_id').or(`hotel_id.eq.${hotel.id},role.eq.owner`),
    outletId ? supabaseAdmin.from('outlets').select('name').eq('id', outletId).maybeSingle() : Promise.resolve({ data: null }),
    canLock
      ? supabaseAdmin.from('shortage_charges').select('id, amount, note, profiles:staff_profile_id(full_name)').eq('hotel_id', hotel.id).eq('business_date', date)
      : Promise.resolve({ data: [] }),
    // Reference only. These are never added to the close.
    supabaseAdmin.from('reservation_charges').select('category,total_amount').eq('hotel_id', hotel.id).gte('created_at', dayStart).lte('created_at', dayEnd),
    supabaseAdmin.from('day_tour_bookings').select('total_amount').eq('hotel_id', hotel.id).eq('tour_date', date).in('status', ['secured', 'completed']),
    supabaseAdmin.from('remittances').select('amount_due,amount_paid').eq('from_hotel_id', hotel.id).lte('period_start', date).gte('period_end', date)
  ]);

  const closeRow = closeRaw as ({ id: string; status?: string } & NonNullable<SavedCloseRow>) | null;
  const { data: countRaw } = closeRow
    ? await supabaseAdmin.from('day_close_counts').select('bucket, denomination, quantity').eq('day_close_id', closeRow.id)
    : { data: [] as SavedCountRow[] };
  const savedCounts = (countRaw || []) as SavedCountRow[];
  const ledgerRows = (ledgerRaw || []) as SheetLedgerRow[];
  const split = splitSheetLedger(ledgerRows);
  // The close reads every row, exactly as before. The split above is display only.
  const figures = sheetBaseFigures(ledgerRows, Number(hotel.rvf_float_amount ?? 10000), closeRow);
  const locked = closeRow?.status === 'locked';
  const outlet = outletRaw as Pick<Outlet, 'name'> | null;
  const shortages = ((shortageResult.data || []) as Array<{ id: string; amount: number; note: string | null; profiles?: { full_name?: string } | { full_name?: string }[] | null }>).map((item) => {
    const profile = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
    return { id: item.id, amount: Number(item.amount), note: item.note, staff_name: profile?.full_name || 'Staff' };
  });
  const charges = (chargesRaw || []) as { category: string; total_amount: number }[];
  const sum = (items: { [key: string]: unknown }[], key: string) => items.reduce((total, item) => total + Number(item[key] || 0), 0);
  const reference = {
    folioCharges: sum(charges, 'total_amount'),
    breakfast: sum(charges.filter((item) => item.category === 'breakfast' || item.category === 'extra_bed'), 'total_amount'),
    dayTours: sum((dayToursRaw || []) as { total_amount: number }[], 'total_amount'),
    remittanceDue: sum((remittancesRaw || []) as { amount_due: number }[], 'amount_due'),
    remittancePaid: sum((remittancesRaw || []) as { amount_paid: number }[], 'amount_paid')
  };
  const money = (value: number) => currency(value, hotel.default_currency);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight">{label(locale, 'close.title')}</h1>
          <p className="mt-1 text-base text-slate-700">{outlet?.name || hotel.name} · {date}. {label(locale, 'close.lead')}</p>
          {copy.needsReview ? <p className="mt-1 text-sm text-amber-800">{label(locale, 'lang.review')}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/today?hotel=${hotel.id}&date=${date}${outletId ? `&outlet=${outletId}` : ''}`} className="btn-secondary">{label(locale, 'close.back')}</Link>
          <Link href={`/print/reports/day-close?hotel=${hotel.id}&date=${date}${outletId ? `&outlet=${outletId}` : ''}`} className="btn-secondary">{label(locale, 'close.print')}</Link>
          <HelpPanel screen="close" helpLabel={label(locale, 'nav.helpButton')} allGuidesLabel={label(locale, 'help.allGuides')} guides={copy.guides} />
        </div>
      </div>

      <form method="get" className="card flex flex-wrap items-end gap-3 p-4">
        {hotels.length > 1 ? (
          <label className="space-y-1">Hotel
            <select name="hotel" defaultValue={hotel.id} className="block min-w-48">
              {hotels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        ) : <input type="hidden" name="hotel" value={hotel.id} />}
        <label className="space-y-1">Date
          <input type="date" name="date" defaultValue={date} className="block" />
        </label>
        {outletId ? <input type="hidden" name="outlet" value={outletId} /> : null}
        <button className="btn-secondary" type="submit">Show</button>
      </form>

      <section className="card p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold">1. Already in the app</h2>
            <p className="mt-1 text-sm text-slate-600">Room payments confirmed today. They fill in by themselves and are counted in the close. Nothing to type.</p>
          </div>
          <p className="text-sm font-semibold">Total: {money(split.fromAppTotal)}</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {split.fromAppByMethod.map((item) => (
            <span key={item.method} className="rounded-full bg-slate-100 px-3 py-1 text-sm capitalize">{item.method.replaceAll('_', ' ')}: <strong>{money(item.amount)}</strong></span>
          ))}
          {!split.fromApp.length ? <span className="text-sm text-slate-500">No room payments confirmed for this day yet.</span> : null}
        </div>
        {split.fromApp.length ? (
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {split.fromApp.map((row, index) => (
              <li key={row.id || index} className="flex justify-between gap-3 py-2">
                <span className="text-slate-700">{row.description || 'Room payment'} · <span className="capitalize">{String(row.payment_method || '').replaceAll('_', ' ')}</span></span>
                <span className="font-semibold">{money(Number(row.amount || 0))}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-semibold text-slate-700">For reference (not added to the close)</summary>
          <p className="mt-2 text-slate-600">Charges on guest bills are collected through room payments, so they are not counted twice.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <Ref label="Charges added to guest bills" value={money(reference.folioCharges)} />
            <Ref label="Breakfast and extra beds" value={money(reference.breakfast)} />
            <Ref label="Day tour sales" value={money(reference.dayTours)} />
            <Ref label="Remittance due" value={money(reference.remittanceDue)} />
            <Ref label="Remittance paid" value={money(reference.remittancePaid)} />
          </div>
        </details>
      </section>

      <CashSheetEntries
        hotelId={hotel.id}
        outletId={outletId}
        businessDate={date}
        currencyCode={hotel.default_currency}
        rows={split.typed}
        total={split.typedTotal}
        locked={locked}
      />

      <DayCloseForm
        key={closeRow?.id || `${hotel.id}-${date}-${outletId || 'hotel'}`}
        hotelId={hotel.id}
        outletId={outletId}
        businessDate={date}
        currencyCode={hotel.default_currency}
        figures={figures}
        profiles={(profilesRaw || []) as { id: string; full_name: string | null; role: string }[]}
        existing={closeRaw}
        savedCounts={savedCounts}
        canLock={canLock}
        shortages={shortages}
      />
    </div>
  );
}

function Ref({ label: text, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{text}</p><p className="font-bold">{value}</p></div>;
}
