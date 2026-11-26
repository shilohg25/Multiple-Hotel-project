import Link from 'next/link';
import { canCreateReservation } from '@/lib/access';
import { canAccessHotel, requireStaff } from '@/lib/auth';
import { AUTO_BREAKFAST_REMOVED_ACTION, autoChargeRemovedFromRead } from '@/lib/breakfast-toggle';
import { businessToday } from '@/lib/date';
import { currency } from '@/lib/money';
import { readToBeBilled } from '@/lib/public-quote';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { balanceDueLabel } from '@/lib/stay-cleanup';
import { stayFolioView } from '@/lib/stay-total';
import { roomStatus, staysOnDate, type DatedStay, type StaySlice } from '@/lib/today-board';
import { BookingAlerts, type BookingAlert } from '@/components/BookingAlerts';
import { StayActionLinks } from '@/components/StayActionLinks';
import { HelpPanel } from '@/components/HelpPanel';
import { getLocale, label, messagesFor } from '@/lib/i18n';
import type { Hotel, Outlet, Room } from '@/types/app';

type SearchParams = { hotel?: string; outlet?: string; date?: string };

const tone: Record<string, string> = {
  vacant: 'bg-slate-100 text-slate-800',
  arrival: 'bg-amber-100 text-amber-950',
  in_house: 'bg-emerald-100 text-emerald-950',
  departure: 'bg-sky-100 text-sky-950',
  overdue: 'bg-rose-100 text-rose-950'
};

type StayRow = StaySlice & { guests?: { full_name?: string } | { full_name?: string }[] | null };

function mapStays(rows: StayRow[]): StaySlice[] {
  return rows.map((stay) => {
    const guest = Array.isArray(stay.guests) ? stay.guests[0] : stay.guests;
    return { ...stay, guest_name: guest?.full_name || 'Guest' };
  });
}

async function overdueBalanceLines(stayIds: string[], hotel: Hotel): Promise<Map<string, string>> {
  const lines = new Map<string, string>();
  if (!stayIds.length) return lines;
  const [stayResult, paymentResult, chargeResult, removedResult] = await Promise.all([
    supabaseAdmin
      .from('reservations')
      .select('id, total_amount, nights, guest_count, with_breakfast, posted_room_rate, mode_of_payment, rooms(room_type_name)')
      .in('id', stayIds),
    supabaseAdmin
      .from('payments')
      .select('reservation_id, amount, status')
      .in('reservation_id', stayIds)
      .eq('status', 'confirmed'),
    supabaseAdmin
      .from('reservation_charges')
      .select('reservation_id, category, notes, total_amount')
      .in('reservation_id', stayIds),
    supabaseAdmin
      .from('audit_logs')
      .select('reservation_id, id')
      .in('reservation_id', stayIds)
      .eq('action', AUTO_BREAKFAST_REMOVED_ACTION)
  ]);
  if (stayResult.error) console.error(stayResult.error);
  if (paymentResult.error) console.error(paymentResult.error);
  if (chargeResult.error) console.error(chargeResult.error);
  if (removedResult.error) console.error(removedResult.error);
  if (stayResult.error || !stayResult.data) return lines;

  type FolioStay = {
    id: string;
    total_amount?: number | null;
    nights?: number | null;
    guest_count?: number | null;
    with_breakfast?: boolean | null;
    posted_room_rate?: number | null;
    mode_of_payment?: string | null;
    rooms?: { room_type_name?: string } | { room_type_name?: string }[] | null;
  };
  const payments = new Map<string, number>();
  for (const payment of (paymentResult.data || []) as Array<{ reservation_id: string; amount?: number | null }>) {
    payments.set(payment.reservation_id, (payments.get(payment.reservation_id) || 0) + Number(payment.amount || 0));
  }
  const charges = new Map<string, Array<{ category?: string | null; notes?: string | null; total_amount?: number | null }>>();
  for (const charge of (chargeResult.data || []) as Array<{ reservation_id: string; category?: string | null; notes?: string | null; total_amount?: number | null }>) {
    const list = charges.get(charge.reservation_id) || [];
    list.push(charge);
    charges.set(charge.reservation_id, list);
  }
  const removed = new Set(
    ((removedResult.error ? [] : removedResult.data) || [])
      .map((row: { reservation_id?: string }) => row.reservation_id)
      .filter(Boolean) as string[]
  );

  for (const stay of stayResult.data as FolioStay[]) {
    const room = Array.isArray(stay.rooms) ? stay.rooms[0] : stay.rooms;
    const folio = stayFolioView({
      hotelSlug: hotel.slug,
      roomTypeName: room?.room_type_name,
      postedRoomRate: Number(stay.posted_room_rate || 0),
      roomTotal: Number(stay.total_amount || 0),
      nights: stay.nights ?? undefined,
      guestCount: Number(stay.guest_count || 1),
      withBreakfast: Boolean(stay.with_breakfast),
      removed: autoChargeRemovedFromRead(removedResult.error, removed.has(stay.id) ? [{ id: stay.id }] : []),
      charges: charges.get(stay.id) || []
    });
    const due = balanceDueLabel(folio.total - (payments.get(stay.id) || 0), {
      toBeBilled: Boolean(readToBeBilled(stay.mode_of_payment))
    });
    lines.set(stay.id, `${due.label} ${currency(due.amount, hotel.default_currency)}`);
  }
  return lines;
}

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

  const staysSelect = 'id, room_id, status, check_in, check_out, guests(full_name)';
  const [roomsResult, staysResult, overdueResult] = await Promise.all([
    supabaseAdmin.from('rooms').select('*').eq('hotel_id', hotel.id).eq('active', true).order('sort_order').order('name'),
    supabaseAdmin
      .from('reservations')
      .select(staysSelect)
      .eq('hotel_id', hotel.id)
      .lte('check_in', date)
      .gte('check_out', date)
      .not('status', 'in', '(cancelled,no_show)'),
    supabaseAdmin
      .from('reservations')
      .select(staysSelect)
      .eq('hotel_id', hotel.id)
      .eq('status', 'checked_in')
      .lt('check_out', date)
  ]);
  if (roomsResult.error || staysResult.error || overdueResult.error) {
    if (roomsResult.error) console.error(roomsResult.error);
    if (staysResult.error) console.error(staysResult.error);
    if (overdueResult.error) console.error(overdueResult.error);
    return (
      <section className="card max-w-lg space-y-3 p-6">
        <h1 className="text-2xl font-black">Today could not load this property</h1>
        <p className="text-sm text-slate-600">The room list could not be loaded. Reload the page. If this keeps happening, tell a manager. The day was not changed.</p>
      </section>
    );
  }

  const rooms = (Array.isArray(roomsResult.data) ? roomsResult.data : []) as Room[];
  const byId = new Map<string, StaySlice>();
  for (const stay of mapStays([
    ...((Array.isArray(staysResult.data) ? staysResult.data : []) as StayRow[]),
    ...((Array.isArray(overdueResult.data) ? overdueResult.data : []) as StayRow[])
  ])) {
    byId.set(stay.id, stay);
  }
  const stays = [...byId.values()];
  const roomsById = new Map(rooms.map((room) => [room.id, room]));
  const listed = staysOnDate(stays, date);
  const cards = rooms.map((room) => ({ room, ...roomStatus(stays.filter((stay) => stay.room_id === room.id), date) }));
  const overdueRoomIds = new Set(listed.filter((item) => item.status === 'overdue').map((item) => item.stay.room_id));
  const listCards = (
    status: DatedStay['status'],
    detailFor?: (stay: StaySlice) => string | undefined
  ) => listed.flatMap((item) => {
    if (item.status !== status) return [];
    const room = roomsById.get(item.stay.room_id);
    if (!room) return [];
    const detail = detailFor?.(item.stay);
    return [{ room, stay: item.stay, detail }];
  });
  const arrivals = listCards('arrival', (stay) => (
    overdueRoomIds.has(stay.room_id) ? 'Room still occupied (overdue guest)' : undefined
  ));
  const inHouse = listCards('in_house');
  const departures = listCards('departure');
  const overdue = listCards('overdue');
  const overdueLines = await overdueBalanceLines(overdue.map((card) => card.stay.id), hotel);
  const overdueCards = overdue.map((card) => ({
    ...card,
    detail: [`Checkout was ${card.stay.check_out}`, overdueLines.get(card.stay.id)].filter(Boolean).join(' · ')
  }));
  const actionable = [...overdue, ...inHouse, ...arrivals, ...departures];
  const alertSelect = 'id, check_in, guest_count, with_breakfast, guests(full_name)';
  const [onlineResult, pastResult] = await Promise.all([
    supabaseAdmin
      .from('reservations')
      .select(alertSelect, { count: 'exact' })
      .eq('hotel_id', hotel.id)
      .eq('booking_source', 'online')
      .eq('status', 'payment_submitted')
      .order('created_at', { ascending: false })
      .limit(20),
    supabaseAdmin
      .from('reservations')
      .select(alertSelect, { count: 'exact' })
      .eq('hotel_id', hotel.id)
      .in('status', ['tentative', 'payment_submitted', 'secured'])
      .lt('check_in', date)
      .order('check_in', { ascending: true })
      .limit(20)
  ]);
  if (onlineResult.error) console.error(onlineResult.error);
  if (pastResult.error) console.error(pastResult.error);
  type AlertRow = { id: string; check_in: string; guest_count: number; with_breakfast: boolean; guests?: { full_name?: string } | { full_name?: string }[] | null };
  const toAlert = (row: AlertRow): BookingAlert => {
    const guest = Array.isArray(row.guests) ? row.guests[0] : row.guests;
    return { id: row.id, guestName: guest?.full_name || 'Guest', checkIn: row.check_in, guestCount: Number(row.guest_count || 1), withBreakfast: Boolean(row.with_breakfast) };
  };
  const onlineAlerts = ((onlineResult.data || []) as AlertRow[]).map(toAlert);
  const pastAlerts = ((pastResult.data || []) as AlertRow[]).map(toAlert);
  const query = `hotel=${hotel.id}&date=${date}${outlet ? `&outlet=${outlet.id}` : ''}`;
  const canCreate = canCreateReservation(staff.profile.role);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-3xl font-black tracking-tight">{label(locale, 'today.title')}</h1>
          <p className="mt-1 text-slate-600">{outlet ? outlet.name : hotel.name} · {date}. Same daily steps for Navarro, Sotera, Tagosilangan, and Tago Resto.</p>
          <p className="mt-1 text-sm text-slate-500">{label(locale, 'today.emptyHint')}</p>
          {copy.needsReview ? <p className="mt-1 text-sm text-amber-800">{label(locale, 'lang.review')}</p> : null}
        </div>
        <form className="grid w-full min-w-0 grid-cols-1 gap-2 sm:flex sm:flex-wrap" method="get">
          <select name="hotel" defaultValue={hotel.id} className="w-full min-w-0 max-w-full sm:w-auto sm:min-w-40">
            {hotels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select name="outlet" defaultValue={outlet?.id || ''} className="w-full min-w-0 max-w-full sm:w-auto sm:min-w-40">
            <option value="">Whole property</option>
            {outlets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <input name="date" type="date" defaultValue={date} className="w-full max-w-full sm:w-auto" />
          <button className="btn-secondary" type="submit">Show</button>
          <HelpPanel screen="today" helpLabel={label(locale, 'nav.helpButton')} allGuidesLabel={label(locale, 'help.allGuides')} guides={copy.guides} />
        </form>
      </div>

      <BookingAlerts online={onlineAlerts} past={pastAlerts} onlineCount={onlineResult.count ?? onlineAlerts.length} pastCount={pastResult.count ?? pastAlerts.length} />

      <StayActionLinks
        stays={actionable.map((card) => ({ id: card.stay!.id, label: `${label(locale, 'today.room')} ${card.room.name} · ${card.stay!.guest_name}` }))}
        chargeLabel={label(locale, 'today.charge')}
        paymentLabel={label(locale, 'today.payment')}
        prompt={label(locale, 'today.whichStay')}
        chooseLabel={label(locale, 'today.chooseStay')}
      />
      <div className={`grid gap-3 ${canCreate ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        {canCreate ? <Link href={`/reservations/new`} className="btn-primary min-h-16 text-base">{label(locale, 'today.checkIn')}</Link> : null}
        <Link href={`/sales?hotel=${hotel.id}&date=${date}${outlet ? `&outlet=${outlet.id}` : ''}`} className="btn-primary min-h-16 text-base">{label(locale, 'today.expense')}</Link>
        <Link href={`/today/close?${query}`} className="btn-primary min-h-16 bg-emerald-800 text-base hover:bg-emerald-700">{label(locale, 'today.close')}</Link>
      </div>

      {outlet ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {outlet.name} is a reporting unit. It uses this same daily page. Room numbers below belong to {hotel.name}. Restaurant sales go through Add expense and Close the day.
        </p>
      ) : null}

      {overdueCards.length ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-1">
          <StayList title={label(locale, 'today.overdue')} empty={label(locale, 'today.noOverdue')} cards={overdueCards} actionLabel="Check out" canCreate={canCreate} />
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <StayList title={label(locale, 'today.arrivals')} empty={label(locale, 'today.noArrivals')} cards={arrivals} actionLabel={label(locale, 'today.checkIn')} canCreate={canCreate} />
        <StayList title={label(locale, 'today.inHouse')} empty={label(locale, 'today.noInHouse')} cards={inHouse} actionLabel="Open stay" canCreate={canCreate} />
        <StayList title={label(locale, 'today.departures')} empty={label(locale, 'today.noDepartures')} cards={departures} actionLabel="Check out" canCreate={canCreate} />
      </section>

      <section className="card p-4">
        <h2 className="text-lg font-bold">{label(locale, 'today.rooms')}</h2>
        <p className="mt-1 text-sm text-slate-500">Amber is arriving, green is in house, blue is leaving, rose is overdue, grey is empty.</p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {cards.map((card) => {
            const href = card.stay ? `/reservations/${card.stay.id}` : canCreate ? '/reservations/new' : null;
            const className = `rounded-xl px-3 py-3 ${tone[card.status]}`;
            const body = (
              <>
                <p className="text-lg font-black">{card.room.name}</p>
                <p className="text-xs capitalize">{card.status.replace('_', ' ')}</p>
                <p className="truncate text-sm">{card.stay?.guest_name || 'Empty'}</p>
              </>
            );
            return href ? (
              <Link key={card.room.id} href={href} className={className}>{body}</Link>
            ) : (
              <div key={card.room.id} className={className}>{body}</div>
            );
          })}
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
  actionLabel,
  canCreate
}: {
  title: string;
  empty: string;
  cards: { room: Room; stay: StaySlice | null; detail?: string }[];
  actionLabel: string;
  canCreate: boolean;
}) {
  return (
    <section className="card p-4">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="mt-3 space-y-2">
        {cards.map((card) => {
          const href = card.stay ? `/reservations/${card.stay.id}` : canCreate ? '/reservations/new' : null;
          const body = (
            <>
              <p className="font-bold">Room {card.room.name}</p>
              <p className="text-sm text-slate-600">{card.stay?.guest_name}</p>
              {card.detail ? <p className="text-sm font-medium text-slate-800">{card.detail}</p> : null}
              <p className="text-sm font-semibold text-slate-900">{actionLabel}</p>
            </>
          );
          const key = card.stay?.id || card.room.id;
          return href ? (
            <Link key={key} href={href} className="block rounded-lg border border-slate-200 px-3 py-3 hover:bg-slate-50">{body}</Link>
          ) : (
            <div key={key} className="rounded-lg border border-slate-200 px-3 py-3">{body}</div>
          );
        })}
        {!cards.length ? <p className="text-sm text-slate-500">{empty}</p> : null}
      </div>
    </section>
  );
}
