import 'server-only';

import { canAccessHotel, type StaffContext } from './auth';
import { supabaseAdmin } from './supabase-admin';
import type { CashCount, Hotel, LedgerEntry, Payment, Remittance, Reservation, ReservationCharge } from '@/types/app';

export async function getAccessibleHotels(profile: StaffContext['profile']) {
  const { data } = await supabaseAdmin.from('hotels').select('*').eq('active', true).order('name');
  return ((data || []) as Hotel[]).filter((hotel) => canAccessHotel(profile, hotel.id));
}

export function dayBounds(date: string) {
  return {
    start: `${date}T00:00:00.000Z`,
    end: `${date}T23:59:59.999Z`
  };
}

export function monthRange(month: string) {
  const [yearText, monthText] = month.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0));
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    days: Array.from({ length: end.getUTCDate() }, (_, index) => new Date(Date.UTC(year, monthIndex, index + 1)).toISOString().slice(0, 10))
  };
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

export async function getDailyReportData(staff: StaffContext, input: { hotelId?: string; date: string }): Promise<{ hotels: Hotel[]; report: DailyReportData | null }> {
  const hotels = await getAccessibleHotels(staff.profile);
  const hotel = hotels.find((item) => item.id === input.hotelId) || hotels[0];
  if (!hotel) return { hotels, report: null };

  const { start, end } = dayBounds(input.date);
  const [{ data: reservationsRaw }, { data: paymentsRaw }, { data: pendingPaymentsRaw }, { data: chargesRaw }, { data: ledgerRaw }, { data: cashRaw }, { data: dayToursRaw }, { data: remittancesRaw }] = await Promise.all([
    supabaseAdmin
      .from('reservations')
      .select('*, guests(full_name,email,phone), rooms(name,room_type_name)')
      .eq('hotel_id', hotel.id)
      .or(`check_in.eq.${input.date},check_out.eq.${input.date},created_at.gte.${start}`)
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
      .eq('entry_date', input.date),
    supabaseAdmin
      .from('cash_counts')
      .select('*')
      .eq('hotel_id', hotel.id)
      .eq('count_date', input.date),
    supabaseAdmin
      .from('day_tour_bookings')
      .select('total_amount')
      .eq('hotel_id', hotel.id)
      .eq('tour_date', input.date)
      .in('status', ['secured', 'completed']),
    supabaseAdmin
      .from('remittances')
      .select('*')
      .eq('from_hotel_id', hotel.id)
      .lte('period_start', input.date)
      .gte('period_end', input.date)
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
      date: input.date,
      reservations,
      checkIns: reservations.filter((item) => item.check_in === input.date),
      checkOuts: reservations.filter((item) => item.check_out === input.date),
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

export async function getMonthlyReportData(staff: StaffContext, input: { hotelId?: string; month: string }) {
  const hotels = await getAccessibleHotels(staff.profile);
  const hotel = hotels.find((item) => item.id === input.hotelId) || hotels[0];
  if (!hotel) return { hotels, hotel: null, days: [], totalsByDay: [], totals: null };
  const range = monthRange(input.month);
  const startIso = `${range.startDate}T00:00:00.000Z`;
  const endIso = `${range.endDate}T23:59:59.999Z`;

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
    const dayStart = `${day}T00:00:00.000Z`;
    const dayEnd = `${day}T23:59:59.999Z`;
    const dayReservations = reservations.filter((item) => item.check_in === day);
    const dayCharges = charges.filter((item) => item.created_at >= dayStart && item.created_at <= dayEnd);
    const dayPayments = payments.filter((item) => item.confirmed_at && item.confirmed_at >= dayStart && item.confirmed_at <= dayEnd);
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
