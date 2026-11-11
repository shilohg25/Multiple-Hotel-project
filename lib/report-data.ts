import 'server-only';

import { canAccessHotel, type StaffContext } from './auth';
import { businessMonth, businessTimeZone, businessToday, localDayBounds, localMonthBounds, timestampInRange } from './date';
import { supabaseAdmin } from './supabase-admin';
import type { CashCount, Hotel, LedgerEntry, Payment, Remittance, Reservation, ReservationCharge } from '@/types/app';

export async function getAccessibleHotels(profile: StaffContext['profile']) {
  const { data } = await supabaseAdmin.from('hotels').select('*').eq('active', true).order('name');
  return ((data || []) as Hotel[]).filter((hotel) => canAccessHotel(profile, hotel.id));
}

export function dayBounds(date: string, timeZone?: string | null) {
  return localDayBounds(date, businessTimeZone(timeZone));
}

export function monthRange(month: string, timeZone?: string | null) {
  return localMonthBounds(month, businessTimeZone(timeZone));
}

export type DailyReportData = {
  hotel: Hotel;
  date: string;
  reservations: Reservation[];
  checkIns: Reservation[];
  checkOuts: Reservation[];
  confirmedPayments: Payment[];
  pendingPayments: Payment[];
  tentativeFollowups: Reservation[];
  charges: ReservationCharge[];
  ledgerEntries: LedgerEntry[];
  cashCounts: CashCount[];
  dayTourSales: number;
  remittances: Remittance[];
  totals: {
    roomPayments: number;
    serviceCharges: number;
    breakfastCharges: number;
    dayTourSales: number;
    cashReceived: number;
    bankOnlineReceived: number;
    expectedCash: number;
    actualEndingCash: number;
    variance: number;
    remittanceDue: number;
    remittancePaid: number;
  };
};

export async function getDailyReportData(staff: StaffContext, input: { hotelId?: string; date?: string }): Promise<{ hotels: Hotel[]; report: DailyReportData | null }> {
  const hotels = await getAccessibleHotels(staff.profile);
  const hotel = hotels.find((item) => item.id === input.hotelId) || hotels[0];
  if (!hotel) return { hotels, report: null };

  const date = input.date || businessToday(hotel.timezone);
  const { start, end } = dayBounds(date, hotel.timezone);
  const [{ data: reservationsRaw }, { data: paymentsRaw }, { data: pendingPaymentsRaw }, { data: chargesRaw }, { data: ledgerRaw }, { data: cashRaw }, { data: dayToursRaw }, { data: remittancesRaw }] = await Promise.all([
    supabaseAdmin
      .from('reservations')
      .select('*, guests(full_name,email,phone), rooms(name,room_type_name)')
      .eq('hotel_id', hotel.id)
      .or(`check_in.eq.${date},check_out.eq.${date},created_at.gte.${start}`)
      .lte('created_at', end)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('payments')
      .select('*, reservations!inner(hotel_id, guests(full_name), rooms(name))')
      .eq('status', 'confirmed')
      .eq('reservations.hotel_id', hotel.id)
      .gte('confirmed_at', start)
      .lte('confirmed_at', end),
    supabaseAdmin
      .from('payments')
      .select('*, reservations!inner(hotel_id, guests(full_name), rooms(name), check_in, check_out)')
      .eq('status', 'submitted')
      .eq('reservations.hotel_id', hotel.id),
    supabaseAdmin
      .from('reservation_charges')
      .select('*')
      .eq('hotel_id', hotel.id)
      .gte('created_at', start)
      .lte('created_at', end),
    supabaseAdmin
      .from('ledger_entries')
      .select('*')
      .eq('hotel_id', hotel.id)
      .eq('entry_date', date),
    supabaseAdmin
      .from('cash_counts')
      .select('*')
      .eq('hotel_id', hotel.id)
      .eq('count_date', date),
    supabaseAdmin
      .from('day_tour_bookings')
      .select('total_amount')
      .eq('hotel_id', hotel.id)
      .eq('tour_date', date)
      .in('status', ['secured', 'completed']),
    supabaseAdmin
      .from('remittances')
      .select('*')
      .eq('from_hotel_id', hotel.id)
      .lte('period_start', date)
      .gte('period_end', date)
  ]);

  const reservations = (reservationsRaw || []) as Reservation[];
  const confirmedPayments = (paymentsRaw || []) as Payment[];
  const pendingPayments = (pendingPaymentsRaw || []) as Payment[];
  const charges = (chargesRaw || []) as ReservationCharge[];
  const ledgerEntries = (ledgerRaw || []) as LedgerEntry[];
  const cashCounts = (cashRaw || []) as CashCount[];
  const remittances = (remittancesRaw || []) as Remittance[];
  const roomPayments = confirmedPayments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const serviceCharges = charges.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
  const breakfastCharges = charges.filter((item) => item.category === 'breakfast').reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
  const dayTourSales = (dayToursRaw || []).reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
  const cashReceived = ledgerEntries.filter((item) => item.payment_method === 'cash' && !item.is_collectible).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const bankOnlineReceived = ledgerEntries.filter((item) => item.payment_method !== 'cash' && !item.is_collectible).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const actualEndingCash = cashCounts.reduce((sum, item) => sum + Number(item.denomination || 0) * Number(item.quantity || 0), 0);
  const expectedCash = roomPayments + cashReceived;
  const remittanceDue = remittances.reduce((sum, item) => sum + Number(item.amount_due || 0), 0);
  const remittancePaid = remittances.reduce((sum, item) => sum + Number(item.amount_paid || 0), 0);

  return {
    hotels,
    report: {
      hotel,
      date,
      reservations,
      checkIns: reservations.filter((item) => item.check_in === date),
      checkOuts: reservations.filter((item) => item.check_out === date),
      confirmedPayments,
      pendingPayments,
      tentativeFollowups: reservations.filter((item) => item.status === 'tentative' || item.status === 'payment_submitted'),
      charges,
      ledgerEntries,
      cashCounts,
      dayTourSales,
      remittances,
      totals: {
        roomPayments,
        serviceCharges,
        breakfastCharges,
        dayTourSales,
        cashReceived,
        bankOnlineReceived,
        expectedCash,
        actualEndingCash,
        variance: actualEndingCash - expectedCash,
        remittanceDue,
        remittancePaid
      }
    }
  };
}

export async function getMonthlyReportData(staff: StaffContext, input: { hotelId?: string; month?: string }) {
  const hotels = await getAccessibleHotels(staff.profile);
  const hotel = hotels.find((item) => item.id === input.hotelId) || hotels[0];
  if (!hotel) return { hotels, hotel: null, month: input.month || '', days: [], totalsByDay: [], totals: null };
  const month = input.month || businessMonth(hotel.timezone);
  const range = monthRange(month, hotel.timezone);
  const startIso = range.start;
  const endIso = range.end;

  const [{ data: reservationsRaw }, { data: paymentsRaw }, { data: chargesRaw }, { data: dayToursRaw }, { data: remittancesRaw }] = await Promise.all([
    supabaseAdmin.from('reservations').select('*').eq('hotel_id', hotel.id).gte('check_in', range.startDate).lte('check_in', range.endDate),
    supabaseAdmin.from('payments').select('amount, confirmed_at, reservations!inner(hotel_id)').eq('status', 'confirmed').eq('reservations.hotel_id', hotel.id).gte('confirmed_at', startIso).lte('confirmed_at', endIso),
    supabaseAdmin.from('reservation_charges').select('*').eq('hotel_id', hotel.id).gte('created_at', startIso).lte('created_at', endIso),
    supabaseAdmin.from('day_tour_bookings').select('tour_date,total_amount,status').eq('hotel_id', hotel.id).gte('tour_date', range.startDate).lte('tour_date', range.endDate),
    supabaseAdmin.from('remittances').select('*').eq('from_hotel_id', hotel.id).gte('period_start', range.startDate).lte('period_start', range.endDate)
  ]);

  const reservations = (reservationsRaw || []) as Reservation[];
  const charges = (chargesRaw || []) as ReservationCharge[];
  const payments = (paymentsRaw || []) as { amount: number; confirmed_at: string | null }[];
  const dayTours = (dayToursRaw || []) as { tour_date: string; total_amount: number; status: string }[];
  const remittances = (remittancesRaw || []) as Remittance[];

  const totalsByDay = range.days.map((day) => {
    const { start: dayStart, end: dayEnd } = dayBounds(day, hotel.timezone);
    const dayReservations = reservations.filter((item) => item.check_in === day);
    const dayCharges = charges.filter((item) => timestampInRange(item.created_at, dayStart, dayEnd));
    const dayPayments = payments.filter((item) => timestampInRange(item.confirmed_at, dayStart, dayEnd));
    const dayTourRows = dayTours.filter((item) => item.tour_date === day && ['secured', 'completed'].includes(item.status));
    return {
      day,
      roomRevenue: dayReservations.reduce((sum, item) => sum + Number(item.total_amount || 0), 0),
      serviceCharges: dayCharges.reduce((sum, item) => sum + Number(item.total_amount || 0), 0),
      breakfastCharges: dayCharges.filter((item) => item.category === 'breakfast').reduce((sum, item) => sum + Number(item.total_amount || 0), 0),
      confirmedPayments: dayPayments.reduce((sum, item) => sum + Number(item.amount || 0), 0),
      dayTourSales: dayTourRows.reduce((sum, item) => sum + Number(item.total_amount || 0), 0),
      cancelledNoShow: dayReservations.filter((item) => item.status === 'cancelled' || item.status === 'no_show').length
    };
  });

  return {
    hotels,
    hotel,
    month,
    days: range.days,
    totalsByDay,
    totals: {
      roomRevenue: totalsByDay.reduce((sum, item) => sum + item.roomRevenue, 0),
      serviceCharges: totalsByDay.reduce((sum, item) => sum + item.serviceCharges, 0),
      breakfastCharges: totalsByDay.reduce((sum, item) => sum + item.breakfastCharges, 0),
      confirmedPayments: totalsByDay.reduce((sum, item) => sum + item.confirmedPayments, 0),
      dayTourSales: totalsByDay.reduce((sum, item) => sum + item.dayTourSales, 0),
      cancelledNoShow: totalsByDay.reduce((sum, item) => sum + item.cancelledNoShow, 0),
      remittanceDue: remittances.reduce((sum, item) => sum + Number(item.amount_due || 0), 0)
    }
  };
}
