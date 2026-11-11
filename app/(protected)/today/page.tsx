import Link from 'next/link';
import { canAccessHotel, requireStaff } from '@/lib/auth';
import { businessToday } from '@/lib/date';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { roomStatus, type StaySlice } from '@/lib/today-board';
import { StayActionLinks } from '@/components/StayActionLinks';
import { HelpPanel } from '@/components/HelpPanel';
import { getLocale, label, messagesFor } from '@/lib/i18n';
import type { Hotel, Outlet, Room } from '@/types/app';

type SearchParams = { hotel?: string; outlet?: string; date?: string };

const tone: Record<string, string> = {
  vacant: 'bg-slate-100 text-slate-800',
  arrival: 'bg-amber-100 text-amber-950',
  in_house: 'bg-emerald-100 text-emerald-950',
  departure: 'bg-sky-100 text-sky-950'
};

export default async function TodayPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = (await searchParams) || {};
  const staff = await requireStaff();
  const locale = await getLocale();
  const copy = messagesFor(locale);
  const { data: hotelsRaw } = await supabaseAdmin.from('hotels').select('*').eq('active', true).order('name');
  const hotels = ((hotelsRaw || []) as Hotel[]).filter((hotel) => canAccessHotel(staff.profile, hotel.id));
  const hotel = hotels.find((item) => item.id === params.hotel) || hotels[0];
  if (!hotel) return <div className="card p-6">Add a property before using Today.</div>;

  const date = params.date || businessToday(hotel.timezone);
  const outletsResult = await supabaseAdmin
    .from('outlets')
    .select('*')
    .eq('hotel_id', hotel.id)
    .eq('active', true)
    .eq('is_reporting_unit', true)
    .order('name');
  const outlets = (Array.isArray(outletsResult.data) ? outletsResult.data : []) as Outlet[];
  const outlet = outlets.find((item) => item.id === params.outlet) || null;

  const [roomsResult, staysResult] = await Promise.all([
    supabaseAdmin.from('rooms').select('*').eq('hotel_id', hotel.id).eq('active', true).order('sort_order').order('name'),
    supabaseAdmin
      .from('reservations')
      .select('id, room_id, status, check_in, check_out, guests(full_name)')
      .eq('hotel_id', hotel.id)
      .lte('check_in', date)
      .gte('check_out', date)
      .not('status', 'in', '(cancelled,no_show)')
  ]);
  if (roomsResult.error || staysResult.error) {
    if (roomsResult.error) console.error(roomsResult.error);
    if (staysResult.error) console.error(staysResult.error);
    return (
      <section className="card max-w-lg space-y-3 p-6">
        <h1 className="text-2xl font-black">Today could not load this property</h1>
        <p className="text-sm text-slate-600">The room list could not be loaded. Reload the page. If this keeps happening, tell a manager. The day was not changed.</p>
      </section>
    );
  }

  const rooms = (Array.isArray(roomsResult.data) ? roomsResult.data : []) as Room[];
  const stays = ((Array.isArray(staysResult.data) ? staysResult.data : []) as Array<StaySlice & { guests?: { full_name?: string } | { full_name?: string }[] | null }>).map((stay) => {
    const guest = Array.isArray(stay.guests) ? stay.guests[0] : stay.guests;
    return { ...stay, guest_name: guest?.full_name || 'Guest' };
  });
  const cards = rooms.map((room) => ({ room, ...roomStatus(stays.filter((stay) => stay.room_id === room.id), date) }));
  const arrivals = cards.filter((card) => card.status === 'arrival');
  const inHouse = cards.filter((card) => card.status === 'in_house');
  const departures = cards.filter((card) => card.status === 'departure');
  const actionable = [...inHouse, ...arrivals, ...departures].filter((card) => card.stay);
  const query = `hotel=${hotel.id}&date=${date}${outlet ? `&outlet=${outlet.id}` : ''}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-3xl font-black tracking-tight">{label(locale, 'today.title')}</h1>
          <p className="mt-1 text-slate-600">{outlet ? outlet.name : hotel.name} · {date}. Same daily steps for Navarro, Sotera, Tagosilangan, and Tago Resto.</p>
          <p className="mt-1 text-sm text-slate-500">{label(locale, 'today.emptyHint')}</p>
          {copy.needsReview ? <p className="mt-1 text-sm text-amber-800">{label(locale, 'lang.review')}</p> : null}
        </div>
        <form className="flex flex-wrap gap-2" method="get">
          <select name="hotel" defaultValue={hotel.id} className="min-w-40">
            {hotels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select name="outlet" defaultValue={outlet?.id || ''} className="min-w-40">
            <option value="">Whole property</option>
            {outlets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <input name="date" type="date" defaultValue={date} />
          <button className="btn-secondary" type="submit">Show</button>
          <HelpPanel screen="today" helpLabel={label(locale, 'nav.helpButton')} allGuidesLabel={label(locale, 'help.allGuides')} guides={copy.guides} />
        </form>
      </div>

      <StayActionLinks
        stays={actionable.map((card) => ({ id: card.stay!.id, label: `${label(locale, 'today.room')} ${card.room.name} · ${card.stay!.guest_name}` }))}
        chargeLabel={label(locale, 'today.charge')}
        paymentLabel={label(locale, 'today.payment')}
        prompt={label(locale, 'today.whichStay')}
        chooseLabel={label(locale, 'today.chooseStay')}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Link href={`/reservations/new`} className="btn-primary min-h-16 text-base">{label(locale, 'today.checkIn')}</Link>
        <Link href={`/sales?hotel=${hotel.id}&date=${date}${outlet ? `&outlet=${outlet.id}` : ''}`} className="btn-primary min-h-16 text-base">{label(locale, 'today.expense')}</Link>
        <Link href={`/today/close?${query}`} className="btn-primary min-h-16 bg-emerald-800 text-base hover:bg-emerald-700">{label(locale, 'today.close')}</Link>
      </div>

      {outlet ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {outlet.name} is a reporting unit. It uses this same daily page. Room numbers below belong to {hotel.name}. Restaurant sales go through Add expense and Close the day.
        </p>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <StayList title={label(locale, 'today.arrivals')} empty={label(locale, 'today.noArrivals')} cards={arrivals} actionLabel={label(locale, 'today.checkIn')} />
        <StayList title={label(locale, 'today.inHouse')} empty={label(locale, 'today.noInHouse')} cards={inHouse} actionLabel="Open stay" />
        <StayList title={label(locale, 'today.departures')} empty={label(locale, 'today.noDepartures')} cards={departures} actionLabel="Check out" />
      </section>

      <section className="card p-4">
        <h2 className="text-lg font-bold">{label(locale, 'today.rooms')}</h2>
        <p className="mt-1 text-sm text-slate-500">Amber is arriving, green is in house, blue is leaving, grey is empty.</p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {cards.map((card) => (
            <Link key={card.room.id} href={card.stay ? `/reservations/${card.stay.id}` : `/reservations/new`} className={`rounded-xl px-3 py-3 ${tone[card.status]}`}>
              <p className="text-lg font-black">{card.room.name}</p>
              <p className="text-xs capitalize">{card.status.replace('_', ' ')}</p>
              <p className="truncate text-sm">{card.stay?.guest_name || 'Empty'}</p>
            </Link>
          ))}
          {!cards.length ? <p className="text-sm text-slate-500">This property has no active rooms yet.</p> : null}
        </div>
      </section>
    </div>
  );
}

function StayList({
  title,
  empty,
  cards,
  actionLabel
}: {
  title: string;
  empty: string;
  cards: { room: Room; stay: StaySlice | null }[];
  actionLabel: string;
}) {
  return (
    <section className="card p-4">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="mt-3 space-y-2">
        {cards.map((card) => (
          <Link key={card.room.id} href={card.stay ? `/reservations/${card.stay.id}` : '/reservations/new'} className="block rounded-lg border border-slate-200 px-3 py-3 hover:bg-slate-50">
            <p className="font-bold">Room {card.room.name}</p>
            <p className="text-sm text-slate-600">{card.stay?.guest_name}</p>
            <p className="text-sm font-semibold text-slate-900">{actionLabel}</p>
          </Link>
        ))}
        {!cards.length ? <p className="text-sm text-slate-500">{empty}</p> : null}
      </div>
    </section>
  );
}
