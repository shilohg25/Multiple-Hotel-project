'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Guest, Hotel, Reservation } from '@/types/app';
import {
  buildBookingConfirmationDraft,
  buildHouseRulesDraft,
  buildMailtoUrl,
  type EmailDraft,
  type EmailDraftKind
} from '@/lib/email-drafts';

export function EmailDraftPanel({
  hotel,
  reservation,
  guest
}: {
  hotel: Hotel;
  reservation: Reservation;
  guest: Guest;
}) {
  const router = useRouter();
  const drafts = useMemo(() => ({
    house_rules: buildHouseRulesDraft({ hotel, reservation, guest }),
    booking_confirmation: buildBookingConfirmationDraft({ hotel, reservation, guest })
  }), [hotel, reservation, guest]);
  const [selectedKind, setSelectedKind] = useState<EmailDraftKind>('house_rules');
  const [draft, setDraft] = useState<EmailDraft>(drafts.house_rules);
  const [message, setMessage] = useState('');

  function selectDraft(kind: EmailDraftKind) {
    setSelectedKind(kind);
    setDraft(drafts[kind]);
    setMessage('');
  }

  async function copyDraft() {
    await navigator.clipboard.writeText(`To: ${draft.to}\nSubject: ${draft.subject}\n\n${draft.body}`);
    setMessage('Draft copied to clipboard.');
  }

  async function markAsSent() {
    setMessage('Saving email status...');
    const response = await fetch(`/api/reservations/${reservation.id}/email-status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template: selectedKind, to_email: draft.to, subject: draft.subject })
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(json.error || 'Unable to mark email as sent.');
      return;
    }
    setMessage('Email marked as sent.');
    router.refresh();
  }

  const hasEmail = Boolean(guest.email);
  const confirmationAllowed = reservation.status === 'secured' || reservation.status === 'checked_in' || reservation.status === 'checked_out';
  const actionAllowed = hasEmail && (selectedKind !== 'booking_confirmation' || confirmationAllowed);
  const mailtoUrl = buildMailtoUrl(draft);

  return (
    <section className="card p-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <h2 className="text-lg font-bold">Manual email drafts</h2>
          <p className="mt-1 text-sm text-slate-500">
            No email API is required. Open a prefilled draft, edit it, send from your email app, then mark it as sent.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className={selectedKind === 'house_rules' ? 'btn-primary' : 'btn-secondary'}
            type="button"
            onClick={() => selectDraft('house_rules')}
          >
            House rules
          </button>
          <button
            className={selectedKind === 'booking_confirmation' ? 'btn-primary' : 'btn-secondary'}
            type="button"
            onClick={() => selectDraft('booking_confirmation')}
          >
            Confirmation
          </button>
        </div>
      </div>

      {!hasEmail ? (
        <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Add a guest email address before using email drafts.
        </div>
      ) : null}
      {selectedKind === 'booking_confirmation' && !confirmationAllowed ? (
        <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Confirmation drafts should be sent only after the down payment is confirmed and the booking status is secured.
        </div>
      ) : null}
      {message ? <div className="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</div> : null}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label>To</label>
          <input value={draft.to} onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))} className="w-full" />
        </div>
        <div className="space-y-2">
          <label>Subject</label>
          <input value={draft.subject} onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value }))} className="w-full" />
        </div>
        <div className="space-y-2 md:col-span-2">
          <label>Email body</label>
          <textarea value={draft.body} onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))} rows={12} className="w-full font-mono text-xs" />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <a className={`btn-primary ${!actionAllowed ? 'pointer-events-none opacity-50' : ''}`} href={actionAllowed ? mailtoUrl : '#'}>
          Open email draft
        </a>
        <button className="btn-secondary" type="button" onClick={() => void copyDraft()} disabled={!actionAllowed}>Copy draft</button>
        <button className="btn-secondary" type="button" onClick={() => void markAsSent()} disabled={!actionAllowed}>Mark as sent</button>
      </div>
    </section>
  );
}
