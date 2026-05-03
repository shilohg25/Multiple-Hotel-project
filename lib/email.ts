import { supabaseAdmin } from './supabase-admin';
import type { Guest, Hotel, Reservation } from '@/types/app';
import { currency } from './money';
import { formatDate } from './date';

const RESEND_URL = 'https://api.resend.com/emails';

type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  reservationId?: string;
  guestId?: string;
  template: 'house_rules' | 'booking_confirmation' | string;
};

async function logEmail(payload: EmailPayload, status: string, providerId?: string, error?: string) {
  await supabaseAdmin.from('email_logs').insert({
    reservation_id: payload.reservationId ?? null,
    guest_id: payload.guestId ?? null,
    template: payload.template,
    to_email: payload.to,
    subject: payload.subject,
    provider_id: providerId ?? null,
    status,
    error: error ?? null,
    sent_at: status === 'sent' ? new Date().toISOString() : null
  });
}

export async function sendEmail(payload: EmailPayload) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'Reservations <reservations@example.com>';

  if (!apiKey) {
    await logEmail(payload, 'skipped', undefined, 'RESEND_API_KEY is not configured');
    return { ok: false, skipped: true };
  }

  try {
    const response = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html
      })
    });

    const json = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!response.ok) {
      const error = json.message || `Email provider returned ${response.status}`;
      await logEmail(payload, 'failed', undefined, error);
      return { ok: false, error };
    }

    await logEmail(payload, 'sent', json.id);
    return { ok: true, id: json.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown email error';
    await logEmail(payload, 'failed', undefined, message);
    return { ok: false, error: message };
  }
}

function shell(title: string, body: string) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a;max-width:680px;margin:auto">
      <h2>${title}</h2>
      ${body}
      <p style="font-size:12px;color:#64748b;margin-top:28px">This is an automated reservation email.</p>
    </div>
  `;
}

export async function sendHouseRulesEmail(input: { hotel: Hotel; reservation: Reservation; guest: Guest }) {
  if (!input.guest.email || input.reservation.house_rules_sent_at) return;

  const subject = `${input.hotel.name} house rules for your booking`;
  const body = shell(
    'House rules and booking terms',
    `
      <p>Hello ${input.guest.full_name},</p>
      <p>Your booking record has been created. Please review the property rules below.</p>
      <h3>House rules</h3>
      <p style="white-space:pre-line">${escapeHtml(input.hotel.house_rules)}</p>
      <h3>Booking terms</h3>
      <p style="white-space:pre-line">${escapeHtml(input.hotel.booking_terms)}</p>
      <p><strong>Status:</strong> ${input.reservation.status.replaceAll('_', ' ')}</p>
      <p><strong>Stay:</strong> ${formatDate(input.reservation.check_in)} to ${formatDate(input.reservation.check_out)}</p>
    `
  );

  const result = await sendEmail({
    to: input.guest.email,
    subject,
    html: body,
    reservationId: input.reservation.id,
    guestId: input.guest.id,
    template: 'house_rules'
  });

  if (result.ok || ('skipped' in result && result.skipped)) {
    await supabaseAdmin
      .from('reservations')
      .update({ house_rules_sent_at: new Date().toISOString() })
      .eq('id', input.reservation.id);
  }
}

export async function sendBookingConfirmationEmail(input: { hotel: Hotel; reservation: Reservation; guest: Guest }) {
  if (!input.guest.email || input.reservation.confirmation_sent_at) return;

  const subject = `${input.hotel.name} booking confirmed`;
  const body = shell(
    'Booking confirmed',
    `
      <p>Hello ${input.guest.full_name},</p>
      <p>Your down payment has been confirmed. Your booking is now secured.</p>
      <p><strong>Hotel:</strong> ${input.hotel.name}</p>
      <p><strong>Stay:</strong> ${formatDate(input.reservation.check_in)} to ${formatDate(input.reservation.check_out)}</p>
      <p><strong>Total amount:</strong> ${currency(input.reservation.total_amount, input.hotel.default_currency)}</p>
      <p><strong>Required down payment:</strong> ${currency(input.reservation.downpayment_required, input.hotel.default_currency)}</p>
      <p>Please bring valid ID and keep your payment proof for verification at check-in.</p>
    `
  );

  const result = await sendEmail({
    to: input.guest.email,
    subject,
    html: body,
    reservationId: input.reservation.id,
    guestId: input.guest.id,
    template: 'booking_confirmation'
  });

  if (result.ok || ('skipped' in result && result.skipped)) {
    await supabaseAdmin
      .from('reservations')
      .update({ confirmation_sent_at: new Date().toISOString() })
      .eq('id', input.reservation.id);
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
