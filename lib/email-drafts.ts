import type { Guest, Hotel, Reservation } from '@/types/app';
import { formatDate } from './date';
import { currency } from './money';

export type EmailDraftKind = 'house_rules' | 'booking_confirmation';

export type EmailDraft = {
  kind: EmailDraftKind;
  to: string;
  subject: string;
  body: string;
};

function guestLine(guest: Pick<Guest, 'full_name'>) {
  return guest.full_name?.trim() || 'Guest';
}

export function buildHouseRulesDraft(input: {
  hotel: Hotel;
  reservation: Reservation;
  guest: Guest;
}): EmailDraft {
  const { hotel, reservation, guest } = input;
  const subject = `${hotel.name} house rules and booking details`;
  const body = [
    `Hello ${guestLine(guest)},`,
    '',
    `Your booking request for ${hotel.name} has been recorded.`,
    '',
    `Booking status: ${reservation.status.replaceAll('_', ' ')}`,
    `Stay dates: ${formatDate(reservation.check_in)} to ${formatDate(reservation.check_out)}`,
    `Required down payment: ${currency(reservation.downpayment_required, hotel.default_currency)}`,
    '',
    'House rules:',
    hotel.house_rules || 'House rules will be provided by the hotel.',
    '',
    'Booking terms:',
    hotel.booking_terms || 'Bookings are tentative until the hotel confirms the down payment.',
    '',
    'Payment proof is mandatory. Dates are blocked only after payment is confirmed by the hotel.',
    '',
    `Regards,`,
    hotel.name
  ].join('\n');

  return {
    kind: 'house_rules',
    to: guest.email || '',
    subject,
    body
  };
}

export function buildBookingConfirmationDraft(input: {
  hotel: Hotel;
  reservation: Reservation;
  guest: Guest;
}): EmailDraft {
  const { hotel, reservation, guest } = input;
  const subject = `${hotel.name} booking confirmation`;
  const body = [
    `Hello ${guestLine(guest)},`,
    '',
    `Your down payment has been confirmed. Your booking is now secured.`,
    '',
    `Hotel: ${hotel.name}`,
    `Room booking dates: ${formatDate(reservation.check_in)} to ${formatDate(reservation.check_out)}`,
    `Total amount: ${currency(reservation.total_amount, hotel.default_currency)}`,
    `Confirmed down payment requirement: ${currency(reservation.downpayment_required, hotel.default_currency)}`,
    '',
    'Please bring a valid ID and keep your payment proof for verification at check-in.',
    '',
    `Regards,`,
    hotel.name
  ].join('\n');

  return {
    kind: 'booking_confirmation',
    to: guest.email || '',
    subject,
    body
  };
}

export function buildMailtoUrl(draft: Pick<EmailDraft, 'to' | 'subject' | 'body'>) {
  const query = new URLSearchParams({ subject: draft.subject, body: draft.body });
  return `mailto:${encodeURIComponent(draft.to)}?${query.toString()}`;
}
