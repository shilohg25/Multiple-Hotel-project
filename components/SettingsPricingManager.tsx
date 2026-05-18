'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Hotel, Room } from '@/types/app';
import { currency } from '@/lib/money';

type RoomDraft = {
  room_type_name: string;
  capacity: string;
  base_rate: string;
  active: boolean;
};

function draftFromRoom(room: Room): RoomDraft {
  return {
    room_type_name: room.room_type_name || '',
    capacity: String(room.capacity ?? 1),
    base_rate: String(Number(room.base_rate || 0)),
    active: Boolean(room.active)
  };
}

export function SettingsPricingManager({ hotels, rooms }: { hotels: Hotel[]; rooms: Room[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedHotelId = searchParams.get('hotel') || hotels[0]?.id || '';
  const selectedHotel = hotels.find((hotel) => hotel.id === selectedHotelId) || hotels[0];
  const visibleRooms = useMemo(() => rooms.filter((room) => room.hotel_id === selectedHotel?.id), [rooms, selectedHotel?.id]);
  const [drafts, setDrafts] = useState<Record<string, RoomDraft>>(() =>
    Object.fromEntries(rooms.map((room) => [room.id, draftFromRoom(room)]))
  );
  const [message, setMessage] = useState('');
  const [savingRoomId, setSavingRoomId] = useState<string | null>(null);

  function changeHotel(hotelId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('hotel', hotelId);
    router.push(`/settings/pricing?${params.toString()}`);
  }

  function updateDraft(room: Room, key: keyof RoomDraft, value: string | boolean) {
    setDrafts((current) => ({
      ...current,
      [room.id]: {
        ...(current[room.id] || draftFromRoom(room)),
        [key]: value
      }
    }));
  }

  async function saveRoom(room: Room) {
    const draft = drafts[room.id] || draftFromRoom(room);
    setMessage('');
    setSavingRoomId(room.id);

    try {
      const response = await fetch(`/api/settings/rooms/${room.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_type_name: draft.room_type_name,
          capacity: Number(draft.capacity || 1),
          base_rate: Number(draft.base_rate || 0),
          active: draft.active
        })
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(json.error || 'Failed to save room.');
        return;
      }
      setDrafts((current) => ({
        ...current,
        [room.id]: draftFromRoom(json.room as Room)
      }));
      setMessage('Room pricing saved.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save room.');
    } finally {
      setSavingRoomId(null);
    }
  }

  if (!selectedHotel) {
    return <div className="card p-6 text-sm text-slate-500">Add an active hotel before managing room pricing.</div>;
  }

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_260px] md:items-end">
          <div>
            <h2 className="text-lg font-bold">Room Pricing</h2>
            <p className="mt-1 text-sm text-slate-500">
              &ldquo;Price changes affect new bookings only. Existing reservations keep their saved posted room rate.&rdquo;
            </p>
          </div>
          <div className="space-y-2">
            <label>Hotel</label>
            <select value={selectedHotel.id} onChange={(event) => changeHotel(event.target.value)} className="w-full">
              {hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}
            </select>
          </div>
        </div>
      </section>

      {message ? <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</div> : null}

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[880px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Room</th>
                <th className="px-5 py-3">Room type</th>
                <th className="px-5 py-3">Capacity</th>
                <th className="px-5 py-3">Current base rate</th>
                <th className="px-5 py-3">Active</th>
                <th className="px-5 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleRooms.map((room) => {
                const draft = drafts[room.id] || draftFromRoom(room);
                return (
                  <tr key={room.id}>
                    <td className="px-5 py-3 font-semibold">{room.name}</td>
                    <td className="px-5 py-3">
                      <input
                        value={draft.room_type_name}
                        onChange={(event) => updateDraft(room, 'room_type_name', event.target.value)}
                        placeholder="Room type"
                        className="w-44"
                      />
                    </td>
                    <td className="px-5 py-3">
                      <input
                        value={draft.capacity}
                        onChange={(event) => updateDraft(room, 'capacity', event.target.value)}
                        type="number"
                        min="1"
                        className="w-24"
                      />
                    </td>
                    <td className="px-5 py-3">
                      <input
                        value={draft.base_rate}
                        onChange={(event) => updateDraft(room, 'base_rate', event.target.value)}
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-32"
                        aria-label={`${room.name} base rate`}
                      />
                      <p className="mt-1 text-xs text-slate-500">{currency(room.base_rate, selectedHotel.default_currency)}</p>
                    </td>
                    <td className="px-5 py-3">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={draft.active}
                          onChange={(event) => updateDraft(room, 'active', event.target.checked)}
                        />
                        <span>{draft.active ? 'Active' : 'Inactive'}</span>
                      </label>
                    </td>
                    <td className="px-5 py-3">
                      <button className="btn-primary" type="button" disabled={savingRoomId === room.id} onClick={() => void saveRoom(room)}>
                        {savingRoomId === room.id ? 'Saving...' : 'Save'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!visibleRooms.length ? (
                <tr>
                  <td className="px-5 py-6 text-slate-500" colSpan={6}>No rooms for this hotel yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
