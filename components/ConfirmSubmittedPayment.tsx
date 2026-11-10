'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ConfirmSubmittedPayment({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState('');

  async function confirm() {
    setMessage('Confirming...');
    const response = await fetch(`/api/payments/${paymentId}/confirm`, { method: 'PATCH' });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error(json);
      setMessage(json.error || 'The payment could not be confirmed.');
      return;
    }
    setMessage('Confirmed.');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      <button className="btn-primary" type="button" onClick={() => void confirm()}>Confirm</button>
      {message ? <span className="text-xs text-slate-600">{message}</span> : null}
    </div>
  );
}
