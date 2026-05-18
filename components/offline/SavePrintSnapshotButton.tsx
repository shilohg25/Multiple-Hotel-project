'use client';

import { useState } from 'react';
import { savePrintSnapshot } from '@/lib/offline/db';

export function SavePrintSnapshotButton({
  title,
  hotelName,
  payload
}: {
  title: string;
  hotelName?: string | null;
  payload: Record<string, unknown>;
}) {
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function saveSnapshot() {
    setMessage('');
    setSaving(true);
    try {
      await savePrintSnapshot({ title, hotelName, payload });
      setMessage('Saved offline print snapshot.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save offline snapshot.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button className="btn-secondary print-hidden" type="button" disabled={saving} onClick={() => void saveSnapshot()}>
        {saving ? 'Saving...' : 'Save Print Snapshot'}
      </button>
      {message ? <span className="print-hidden text-sm text-slate-500">{message}</span> : null}
    </span>
  );
}
