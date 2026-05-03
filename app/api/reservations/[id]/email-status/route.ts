import { NextResponse } from 'next/server';
import { canAccessHotel } from '@/lib/auth';
import { jsonError, requireApiStaff } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { EmailDraftKind } from '@/lib/email-drafts';

const templateToColumn: Record<EmailDraftKind, 'house_rules_sent_at' | 'confirmation_sent_at'> = {
  house_rules: 'house_rules_sent_at',
  booking_confirmation: 'confirmation_sent_at'
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const staff = auth.staff;
  const { id } = await params;
  const payload = await request.json();
  const template = String(payload.template || '') as EmailDraftKind;
  const column = templateToColumn[template];

  if (!column) return jsonError('Unknown email template.');

  const { data: reservation, error } = await supabaseAdmin
    .from('reservations')
    .select('*, guests(*)')
    .eq('id', id)
    .single();

  if (error || !reservation) return jsonError('Reservation not found.', 404);
  if (!canAccessHotel(staff.profile, reservation.hotel_id)) return jsonError('Hotel access denied.', 403);

  const sentAt = new Date().toISOString();
  const { error: updateError } = await supabaseAdmin
    .from('reservations')
    .update({ [column]: sentAt })
    .eq('id', id);

  if (updateError) return jsonError(updateError.message, 400);

  const toEmail = String(payload.to_email || reservation.guests?.email || '').trim();
  const subject = String(payload.subject || '').trim() || template.replaceAll('_', ' ');
  if (toEmail) {
    await supabaseAdmin.from('email_logs').insert({
      reservation_id: id,
      guest_id: reservation.guest_id,
      template,
      to_email: toEmail,
      subject,
      status: 'manual_sent',
      sent_at: sentAt
    });
  }

  await supabaseAdmin.from('audit_logs').insert({
    hotel_id: reservation.hotel_id,
    reservation_id: id,
    actor_id: staff.userId,
    action: 'email.marked_sent',
    details: { template, to_email: toEmail }
  });

  return NextResponse.json({ sent_at: sentAt, template });
}
