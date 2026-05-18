import 'server-only';

import { notFound } from 'next/navigation';
import { canAccessHotel, type StaffContext } from './auth';
import { supabaseAdmin } from './supabase-admin';
import type { Guest, Hotel, Payment, Reservation, ReservationCharge, Room } from '@/types/app';

export type PaymentWithProfile = Payment & {
  profiles?: { full_name: string | null } | null;
};

export type ReservationPrintData = {
  reservation: Reservation & { guests: Guest; hotels: Hotel; rooms: Room };
  charges: ReservationCharge[];
  payments: PaymentWithProfile[];
  additionalChargesTotal: number;
  confirmedPaymentsTotal: number;
  grandTotal: number;
  balanceDue: number;
};

export async function getReservationPrintData(id: string, staff: StaffContext): Promise<ReservationPrintData> {
  const { data, error } = await supabaseAdmin
    .from('reservations')
    .select('*, guests(*), hotels(*), rooms(*)')
    .eq('id', id)
    .single();

  if (error || !data) notFound();
  if (!canAccessHotel(staff.profile, data.hotel_id)) notFound();

  const reservation = data as Reservation & { guests: Guest; hotels: Hotel; rooms: Room };
  const [{ data: chargesRaw }, { data: paymentsRaw }] = await Promise.all([
    supabaseAdmin
      .from('reservation_charges')
      .select('*')
      .eq('reservation_id', reservation.id)
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('payments')
      .select('*, profiles:confirmed_by(full_name)')
      .eq('reservation_id', reservation.id)
      .order('created_at', { ascending: true })
  ]);

  const charges = (chargesRaw || []) as ReservationCharge[];
  const payments = (paymentsRaw || []) as PaymentWithProfile[];
  const additionalChargesTotal = charges.reduce((sum, charge) => sum + Number(charge.total_amount || 0), 0);
  const confirmedPaymentsTotal = payments
    .filter((payment) => payment.status === 'confirmed')
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const grandTotal = Number(reservation.total_amount || 0) + additionalChargesTotal;

  return {
    reservation,
    charges,
    payments,
    additionalChargesTotal,
    confirmedPaymentsTotal,
    grandTotal,
    balanceDue: grandTotal - confirmedPaymentsTotal
  };
}

export async function getPaymentPrintData(id: string, staff: StaffContext) {
  const { data, error } = await supabaseAdmin
    .from('payments')
    .select('*, profiles:confirmed_by(full_name), reservations(*, guests(*), hotels(*), rooms(*))')
    .eq('id', id)
    .single();

  if (error || !data) notFound();
  const reservation = data.reservations as Reservation & { guests: Guest; hotels: Hotel; rooms: Room };
  if (!reservation || !canAccessHotel(staff.profile, reservation.hotel_id)) notFound();

  return {
    payment: data as PaymentWithProfile & {
      reservations: Reservation & { guests: Guest; hotels: Hotel; rooms: Room };
    },
    reservation
  };
}

export function shortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}
