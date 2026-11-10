'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Hotel } from '@/types/app';
import { cardSettlementNet, guestCardCharge } from '@/lib/card-fees';
import { currency } from '@/lib/money';

export type PaymentChannel = {
  id: string;
  hotel_id: string;
  code: string;
  name: string;
  kind: string;
  surcharge_percent: number;
  mdr_percent: number;
  requires_proof: boolean;
  counts_as_cash: boolean;
  is_collectible: boolean;
  active: boolean;
  sort_order: number;
};

export function PaymentChannelsManager({ hotels, channels }: { hotels: Hotel[]; channels: PaymentChannel[] }) {
  const router = useRouter();
  const [hotelId, setHotelId] = useState(hotels[0]?.id || '');
  const [message, setMessage] = useState('');
  const hotel = hotels.find((item) => item.id === hotelId) || hotels[0];
  const rows = channels.filter((item) => item.hotel_id === hotel?.id).sort((a, b) => a.sort_order - b.sort_order);
  if (!hotel) return <p className="text-sm text-slate-500">Add a property first.</p>;

  return (
    <div className="space-y-4">
      {message ? <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm">{message}</p> : null}
      <label className="block max-w-sm space-y-1">Property
        <select className="w-full" value={hotel.id} onChange={(event) => setHotelId(event.target.value)}>
          {hotels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      {rows.map((channel) => (
        <form
          key={channel.id}
          className="card grid gap-3 p-4 md:grid-cols-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const response = await fetch(`/api/settings/payment-channels/${channel.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: form.get('name'),
                surcharge_percent: Number(form.get('surcharge_percent')),
                mdr_percent: Number(form.get('mdr_percent')),
                requires_proof: form.get('requires_proof') === 'on',
                active: form.get('active') === 'on'
              })
            });
            const json = await response.json().catch(() => ({}));
            setMessage(response.ok ? `${channel.name} saved.` : json.error || 'Could not save.');
            if (response.ok) router.refresh();
          }}
        >
          <label className="space-y-1 md:col-span-2">Name
            <input name="name" defaultValue={channel.name} className="w-full" />
          </label>
          <label className="space-y-1">Guest surcharge %
            <input name="surcharge_percent" type="number" min="0" max="100" step="0.001" defaultValue={Number(channel.surcharge_percent)} className="w-full" />
          </label>
          <label className="space-y-1">Bank MDR %
            <input name="mdr_percent" type="number" min="0" max="100" step="0.001" defaultValue={Number(channel.mdr_percent)} className="w-full" />
          </label>
          <p className="text-sm text-slate-500 md:col-span-2">
            {channel.kind === 'card'
              ? `Example on ₱2,250: guest pays ${currency(guestCardCharge(2250, Number(channel.surcharge_percent)), hotel.default_currency)}, bank net about ${currency(cardSettlementNet(guestCardCharge(2250, Number(channel.surcharge_percent)), Number(channel.mdr_percent)), hotel.default_currency)}.`
              : channel.is_collectible ? 'This stays on collectables until the payout arrives.' : channel.counts_as_cash ? 'This counts as cash in the drawer.' : 'Not cash.'}
          </p>
          <label className="flex items-center gap-2 text-sm"><input name="requires_proof" type="checkbox" defaultChecked={channel.requires_proof} /> Proof required</label>
          <label className="flex items-center gap-2 text-sm"><input name="active" type="checkbox" defaultChecked={channel.active} /> Active</label>
          <button className="btn-secondary md:col-span-4" type="submit">Save {channel.name}</button>
        </form>
      ))}
    </div>
  );
}
