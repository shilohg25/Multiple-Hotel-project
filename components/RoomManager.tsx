'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Hotel, Role, Room } from '@/types/app';
import { currency } from '@/lib/money';

export function RoomManager({ hotels, rooms, role }: { hotels: Hotel[]; rooms: Room[]; role: Role }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedHotelId = searchParams.get('hotel') || hotels[0]?.id || '';
  const focus = searchParams.get('focus');
  const selectedHotel = hotels.find((hotel) => hotel.id === selectedHotelId) || hotels[0];
  const visibleRooms = useMemo(() => rooms.filter((room) => room.hotel_id === selectedHotel?.id), [rooms, selectedHotel?.id]);
  const activeRoomCount = visibleRooms.filter((room) => room.active).length;
  const canManage = role === 'owner' || role === 'manager';
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMode, setBulkMode] = useState<'range' | 'custom'>('range');
  const [editingId, setEditingId] = useState<string | null>(null);
  const addCardRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (focus !== 'add') return;
    const timer = window.setTimeout(() => {
      addCardRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [focus, selectedHotel?.id]);

  function changeHotel(hotelId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('hotel', hotelId);
    params.delete('focus');
    router.push(`/rooms?${params.toString()}`);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedHotel) return;
    const formElement = event.currentTarget;
    setMessage('');
    setLoading(true);
    const form = new FormData(formElement);
    form.set('hotel_id', selectedHotel.id);
    form.set('active', form.get('active') === 'on' ? 'true' : 'false');

    const response = await fetch('/api/rooms', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(form.entries())),
      headers: { 'Content-Type': 'application/json' }
    });
    setLoading(false);
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(json.error || 'Failed to save room/unit.');
      return;
    }
    formElement.reset();
    setMessage('Room/unit saved. Existing reservations keep their saved posted room rate.');
    router.refresh();
  }

  async function onBulkSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedHotel) return;
    const formElement = event.currentTarget;
    setMessage('');
    setBulkLoading(true);
    const form = new FormData(formElement);
    form.set('hotel_id', selectedHotel.id);
    form.set('mode', bulkMode);
    form.set('active', form.get('active') === 'on' ? 'true' : 'false');

    const response = await fetch('/api/rooms/bulk', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(form.entries())),
      headers: { 'Content-Type': 'application/json' }
    });
    setBulkLoading(false);
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(json.error || 'Failed to create rooms/units.');
      return;
    }
    formElement.reset();
    setMessage(json.message || `Created ${json.created_count || 0} rooms/units.`);
    router.refresh();
  }

  if (!selectedHotel) {
    return <div className="card p-6 text-sm text-slate-500">Add a hotel/property first.</div>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <section className="space-y-6">
        <section className="card p-5">
          <div className="grid gap-4 md:grid-cols-[1fr_260px] md:items-end">
            <div>
              <h2 className="text-lg font-bold">{selectedHotel.name}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {activeRoomCount} active room/unit{activeRoomCount === 1 ? '' : 's'} of {visibleRooms.length} total.
              </p>
              {!activeRoomCount ? (
                <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                  This hotel/property has no rooms or units yet. Add the first one using the form. Reservations cannot be created for this hotel until at least one active room/unit exists.
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <label>Hotel / property</label>
              <select value={selectedHotel.id} onChange={(event) => changeHotel(event.target.value)} className="w-full">
                {hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}
              </select>
            </div>
          </div>
        </section>

        <section className="card overflow-hidden">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-lg font-bold">Rooms / Units</h2>
              <p className="mt-1 text-sm text-slate-500">Only active rooms/units appear in reservation forms and the booking board.</p>
            </div>
            {canManage ? <a href={`/rooms?hotel=${selectedHotel.id}&focus=add`} className={focus === 'add' ? 'btn-primary' : 'btn-secondary'}>Add rooms/units</a> : null}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[860px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Room / unit</th>
                  <th className="px-5 py-3">Type / category</th>
                  <th className="px-5 py-3">Capacity</th>
                  <th className="px-5 py-3">Base rate</th>
                  <th className="px-5 py-3">Sort</th>
                  <th className="px-5 py-3">Status</th>
                  {canManage ? <th className="px-5 py-3">Action</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRooms.map((room) => (
                  <RoomRow
                    key={room.id}
                    room={room}
                    currencyCode={selectedHotel.default_currency}
                    canManage={canManage}
                    editing={editingId === room.id}
                    onEdit={() => setEditingId(room.id)}
                    onCancel={() => setEditingId(null)}
                    onSaved={(messageText) => {
                      setMessage(messageText);
                      setEditingId(null);
                      router.refresh();
                    }}
                  />
                ))}
                {!visibleRooms.length ? (
                  <tr>
                    <td className="px-5 py-6 text-slate-500" colSpan={canManage ? 7 : 6}>No rooms/units for this hotel/property yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <aside className="space-y-6">
        {message ? <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</div> : null}
        {!canManage ? (
          <section className="card p-5 text-sm text-slate-500">
            Owner or manager access is required to add or edit rooms/units.
          </section>
        ) : (
          <>
            <section ref={addCardRef} className={`card p-5 ${focus === 'add' || !activeRoomCount ? 'ring-2 ring-slate-900' : ''}`}>
              <h2 className="text-lg font-bold">Add one room/unit</h2>
              <p className="mt-1 text-sm text-slate-500">Examples: RM 201, Unit 1, Studio A, Villa 1, Whole Property.</p>
              <form onSubmit={onSubmit} className="mt-4 space-y-4">
                <div className="space-y-2">
                  <label>Room / unit name</label>
                  <input name="name" required placeholder="RM 201, Unit 1, Studio A" className="w-full" />
                </div>
                <div className="space-y-2">
                  <label>Room / unit type</label>
                  <input name="room_type_name" placeholder="Standard, Studio, Villa, Whole Property" className="w-full" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label>Capacity</label>
                    <input name="capacity" type="number" min="1" defaultValue="2" className="w-full" />
                  </div>
                  <div className="space-y-2">
                    <label>Base rate</label>
                    <input name="base_rate" type="number" min="0" step="0.01" defaultValue="0" className="w-full" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label>Sort order</label>
                  <input name="sort_order" type="number" defaultValue="100" className="w-full" />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input name="active" type="checkbox" defaultChecked />
                  Active
                </label>
                <button className="btn-primary w-full" disabled={loading} type="submit">{loading ? 'Saving...' : 'Save room/unit'}</button>
              </form>
            </section>

            <section className="card p-5">
              <h2 className="text-lg font-bold">Bulk add rooms/units</h2>
              <p className="mt-1 text-sm text-slate-500">Create a number range or paste custom unit names, one per line.</p>
              <div className="mt-4 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm font-semibold">
                <button className={bulkMode === 'range' ? 'rounded-md bg-white px-3 py-2 shadow-sm' : 'px-3 py-2 text-slate-500'} type="button" onClick={() => setBulkMode('range')}>Number range</button>
                <button className={bulkMode === 'custom' ? 'rounded-md bg-white px-3 py-2 shadow-sm' : 'px-3 py-2 text-slate-500'} type="button" onClick={() => setBulkMode('custom')}>Custom names</button>
              </div>
              <form onSubmit={onBulkSubmit} className="mt-4 space-y-4">
                {bulkMode === 'range' ? (
                  <>
                    <div className="space-y-2">
                      <label>Prefix <span className="text-slate-400">optional</span></label>
                      <input name="prefix" placeholder="RM" className="w-full" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label>Start number</label>
                        <input name="start_number" type="number" required placeholder="201" className="w-full" />
                      </div>
                      <div className="space-y-2">
                        <label>End number</label>
                        <input name="end_number" type="number" required placeholder="205" className="w-full" />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <label>Room/unit names</label>
                    <textarea name="names" rows={5} placeholder={'Villa A\nVilla B\nCottage 1\nCottage 2'} className="w-full" />
                  </div>
                )}
                <div className="space-y-2">
                  <label>Room / unit type</label>
                  <input name="room_type_name" placeholder="Standard, Studio, Villa, Whole Property" className="w-full" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label>Capacity</label>
                    <input name="capacity" type="number" min="1" defaultValue="2" className="w-full" />
                  </div>
                  <div className="space-y-2">
                    <label>Base rate</label>
                    <input name="base_rate" type="number" min="0" step="0.01" defaultValue="0" className="w-full" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label>Sort order start</label>
                  <input name="sort_order_start" type="number" defaultValue="100" className="w-full" />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input name="active" type="checkbox" defaultChecked />
                  Active
                </label>
                <button className="btn-primary w-full" disabled={bulkLoading} type="submit">{bulkLoading ? 'Creating...' : 'Create rooms/units'}</button>
              </form>
            </section>
          </>
        )}
      </aside>
    </div>
  );
}

function RoomRow({
  room,
  currencyCode,
  canManage,
  editing,
  onEdit,
  onCancel,
  onSaved
}: {
  room: Room;
  currencyCode: string;
  canManage: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    form.set('active', form.get('active') === 'on' ? 'true' : 'false');
    setSaving(true);
    const response = await fetch(`/api/rooms/${room.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(form.entries()))
    });
    setSaving(false);
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      onSaved(json.error || 'Failed to update room/unit.');
      return;
    }
    onSaved('Room/unit updated. Existing reservations keep their saved posted room rate.');
  }

  if (editing) {
    return (
      <tr>
        <td colSpan={7} className="bg-slate-50 px-5 py-4">
          <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-6 md:items-end">
            <div className="space-y-2 md:col-span-2">
              <label>Room / unit name</label>
              <input name="name" defaultValue={room.name} required className="w-full" />
            </div>
            <div className="space-y-2">
              <label>Type / category</label>
              <input name="room_type_name" defaultValue={room.room_type_name || ''} className="w-full" />
            </div>
            <div className="space-y-2">
              <label>Capacity</label>
              <input name="capacity" type="number" min="1" defaultValue={room.capacity} className="w-full" />
            </div>
            <div className="space-y-2">
              <label>Base rate</label>
              <input name="base_rate" type="number" min="0" step="0.01" defaultValue={Number(room.base_rate || 0)} className="w-full" />
            </div>
            <div className="space-y-2">
              <label>Sort order</label>
              <input name="sort_order" type="number" defaultValue={room.sort_order} className="w-full" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input name="active" type="checkbox" defaultChecked={room.active} />
              Active
            </label>
            <div className="flex gap-2 md:col-span-5">
              <button className="btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button>
              <button className="btn-secondary" type="button" onClick={onCancel}>Cancel</button>
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="px-5 py-3 font-semibold">{room.name}</td>
      <td className="px-5 py-3 text-slate-600">{room.room_type_name || '-'}</td>
      <td className="px-5 py-3 text-slate-600">{room.capacity}</td>
      <td className="px-5 py-3 text-slate-600">{currency(room.base_rate, currencyCode)}</td>
      <td className="px-5 py-3 text-slate-600">{room.sort_order}</td>
      <td className="px-5 py-3 text-slate-600">{room.active ? 'Active' : 'Inactive'}</td>
      {canManage ? (
        <td className="px-5 py-3">
          <button className="btn-secondary" type="button" onClick={onEdit}>Edit</button>
        </td>
      ) : null}
    </tr>
  );
}
