'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { Hotel, Reservation, Room } from '@/types/app';
import { addDays, diffDays, eachDate, formatDate, toISODate } from '@/lib/date';
import { currency } from '@/lib/money';
import { ReservationStatusBadge } from './StatusBadge';

type DraftMove = {
  check_in: string;
  check_out: string;
  room_id: string;
};

const DENSITY = {
  compact: { dayWidth: 72, rowHeight: 48, roomLabelWidth: 168, headerHeight: 36, barHeight: 20 },
  comfortable: { dayWidth: 92, rowHeight: 64, roomLabelWidth: 190, headerHeight: 42, barHeight: 24 }
} as const;

type Density = keyof typeof DENSITY;

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart < bEnd && aEnd > bStart;
}

function reservationColor(status: Reservation['status']) {
  switch (status) {
    case 'secured': return 'bg-emerald-600 border-emerald-700 text-white';
    case 'payment_submitted': return 'bg-blue-600 border-blue-700 text-white';
    case 'checked_in': return 'bg-indigo-600 border-indigo-700 text-white';
    case 'cancelled': return 'bg-red-100 border-red-200 text-red-700';
    default: return 'bg-amber-100 border-amber-200 text-amber-900';
  }
}

export function ReservationBoard({
  hotel,
  hotels,
  rooms,
  reservations,
  from,
  to
}: {
  hotel: Hotel;
  hotels: Hotel[];
  rooms: Room[];
  reservations: Reservation[];
  from: string;
  to: string;
}) {
  const [density, setDensity] = useState<Density>('compact');
  const [roomSearch, setRoomSearch] = useState('');
  const days = useMemo(() => eachDate(from, to), [from, to]);
  const densityConfig = DENSITY[density];
  const currentRange = Math.max(1, diffDays(from, to));
  const [drafts, setDrafts] = useState<Record<string, DraftMove>>({});
  const [notice, setNotice] = useState('');
  const [drag, setDrag] = useState<null | {
    id: string;
    startX: number;
    startY: number;
    originalCheckIn: string;
    originalCheckOut: string;
    originalRoomIndex: number;
  }>(null);

  const visibleRooms = useMemo(() => {
    const query = roomSearch.trim().toLowerCase();
    if (!query) return rooms;
    return rooms.filter((room) => {
      const name = room.name.toLowerCase();
      const typeName = (room.room_type_name || '').toLowerCase();
      return name.includes(query) || typeName.includes(query);
    });
  }, [roomSearch, rooms]);

  const roomIndex = useMemo(() => {
    const map = new Map<string, number>();
    visibleRooms.forEach((room, index) => map.set(room.id, index));
    return map;
  }, [visibleRooms]);

  const visibleReservations = useMemo(
    () => reservations.filter((reservation) => roomIndex.has((drafts[reservation.id]?.room_id || reservation.room_id))),
    [reservations, roomIndex, drafts]
  );

  async function saveMove(id: string, draft: DraftMove) {
    setNotice('Saving move...');
    const response = await fetch(`/api/reservations/${id}/move`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft)
    });
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      setNotice(json.error || 'Move failed.');
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    setNotice('Booking moved. Refreshing...');
    window.location.reload();
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const xDays = Math.round((event.clientX - drag.startX) / densityConfig.dayWidth);
    const yRows = Math.round((event.clientY - drag.startY) / densityConfig.rowHeight);
    const nextRoomIndex = Math.max(0, Math.min(visibleRooms.length - 1, drag.originalRoomIndex + yRows));
    const length = Math.max(1, diffDays(drag.originalCheckIn, drag.originalCheckOut));
    const nextCheckIn = toISODate(addDays(drag.originalCheckIn, xDays));
    const nextCheckOut = toISODate(addDays(nextCheckIn, length));
    const nextRoom = visibleRooms[nextRoomIndex];
    if (!nextRoom) return;
    setDrafts((prev) => ({ ...prev, [drag.id]: { check_in: nextCheckIn, check_out: nextCheckOut, room_id: nextRoom.id } }));
  }

  function onPointerUp() {
    if (!drag) return;
    const draft = drafts[drag.id];
    setDrag(null);
    if (draft) void saveMove(drag.id, draft);
  }

  const buildRangeHref = (nextFrom: string, rangeDays: number) =>
    `/reservations?hotel=${hotel.id}&from=${nextFrom}&to=${toISODate(addDays(nextFrom, rangeDays))}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap gap-2">
          {hotels.map((item) => (
            <Link
              key={item.id}
              href={`/reservations?hotel=${item.id}&from=${from}&to=${to}`}
              className={item.id === hotel.id ? 'btn-primary' : 'btn-secondary'}
            >
              {item.name}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={buildRangeHref(toISODate(addDays(from, -currentRange)), currentRange)} className="btn-secondary">Previous</Link>
          <Link href={buildRangeHref(toISODate(addDays(from, currentRange)), currentRange)} className="btn-secondary">Next</Link>
          {[7, 14, 30].map((range) => (
            <Link key={range} href={buildRangeHref(from, range)} className={currentRange === range ? 'btn-primary' : 'btn-secondary'}>
              {range} days
            </Link>
          ))}
          {(['compact', 'comfortable'] as Density[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setDensity(value)}
              className={density === value ? 'btn-primary' : 'btn-secondary'}
            >
              {value === 'compact' ? 'Compact' : 'Comfortable'}
            </button>
          ))}
          <Link href="/reservations/new" className="btn-primary">New reservation</Link>
        </div>
      </div>

      {notice ? <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{notice}</div> : null}

      {!rooms.length ? (
        <div className="card p-6">
          <h2 className="text-lg font-bold">This hotel/property has no rooms or units yet.</h2>
          <p className="mt-2 text-sm text-slate-500">Add at least one active room/unit before using the booking board for this property.</p>
          <Link href={`/rooms?hotel=${hotel.id}&focus=add`} className="btn-primary mt-4">Add rooms/units</Link>
        </div>
      ) : null}

      {rooms.length ? <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="flex flex-col justify-between gap-2 md:flex-row md:items-start">
            <div>
              <h2 className="text-base font-bold leading-tight">Gantt booking board</h2>
              <p className="mt-0.5 text-xs text-slate-500">Drag a booking horizontally to change dates or vertically to move rooms. Secured overlaps are blocked.</p>
            </div>
            <p className="text-xs text-slate-500">{formatDate(from)} – {formatDate(toISODate(addDays(to, -1)))}</p>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={roomSearch}
                onChange={(event) => setRoomSearch(event.target.value)}
                placeholder="Search room..."
                className="h-9 w-48 rounded-md border border-slate-300 px-3 text-sm outline-none ring-slate-200 placeholder:text-slate-400 focus:ring"
              />
              <p className="text-xs text-slate-500">Showing {visibleRooms.length} of {rooms.length} rooms</p>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Status legend</span>
              <ReservationStatusBadge status="tentative" />
              <ReservationStatusBadge status="payment_submitted" />
              <ReservationStatusBadge status="secured" />
              <ReservationStatusBadge status="checked_in" />
            </div>
          </div>
        </div>
        <div className="min-h-[420px] overflow-auto" style={{ height: 'calc(100vh - 260px)' }}>
          <div
            className="relative select-none"
            style={{ width: densityConfig.roomLabelWidth + days.length * densityConfig.dayWidth, height: densityConfig.headerHeight + Math.max(1, visibleRooms.length) * densityConfig.rowHeight }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <div className="sticky left-0 top-0 z-30 flex items-center border-b border-r border-slate-200 bg-slate-50 px-3 text-xs font-bold" style={{ width: densityConfig.roomLabelWidth, height: densityConfig.headerHeight }}>
              Room
            </div>
            {days.map((day, index) => (
              <div
                key={day}
                className="absolute top-0 z-20 flex items-center justify-center border-b border-r border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600"
                style={{ left: densityConfig.roomLabelWidth + index * densityConfig.dayWidth, width: densityConfig.dayWidth, height: densityConfig.headerHeight }}
              >
                {formatDate(day)}
              </div>
            ))}
            {visibleRooms.map((room, index) => (
              <div key={room.id}>
                <div
                  className={`sticky left-0 z-20 flex items-center border-b border-r border-slate-200 px-3 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}
                  style={{ top: densityConfig.headerHeight + index * densityConfig.rowHeight, width: densityConfig.roomLabelWidth, height: densityConfig.rowHeight }}
                >
                  <div>
                    <p className="text-sm font-semibold leading-tight">{room.name}</p>
                    <p className="text-[10px] leading-tight text-slate-500">{room.room_type_name || 'Room'} · {currency(room.base_rate, hotel.default_currency)}</p>
                  </div>
                </div>
                {days.map((day, dayIndex) => (
                  <div
                    key={`${room.id}-${day}`}
                    className={`absolute border-b border-r border-slate-100 ${index % 2 === 0 ? 'bg-white/70' : 'bg-slate-50/50'}`}
                    style={{ left: densityConfig.roomLabelWidth + dayIndex * densityConfig.dayWidth, top: densityConfig.headerHeight + index * densityConfig.rowHeight, width: densityConfig.dayWidth, height: densityConfig.rowHeight }}
                  />
                ))}
              </div>
            ))}
            {visibleReservations.map((reservation, reservationListIndex) => {
              const draft = drafts[reservation.id];
              const checkIn = draft?.check_in || reservation.check_in;
              const checkOut = draft?.check_out || reservation.check_out;
              const roomId = draft?.room_id || reservation.room_id;
              const y = roomIndex.get(roomId);
              if (y === undefined) return null;
              const start = Math.max(0, diffDays(from, checkIn));
              const length = Math.max(1, diffDays(checkIn, checkOut));
              const left = densityConfig.roomLabelWidth + start * densityConfig.dayWidth + 4;
              const overlapLevel = visibleReservations
                .slice(0, reservationListIndex)
                .filter((other) => {
                  const otherDraft = drafts[other.id];
                  const otherRoomId = otherDraft?.room_id || other.room_id;
                  const otherCheckIn = otherDraft?.check_in || other.check_in;
                  const otherCheckOut = otherDraft?.check_out || other.check_out;
                  return otherRoomId === roomId && rangesOverlap(checkIn, checkOut, otherCheckIn, otherCheckOut);
                }).length % 2;
              const top = densityConfig.headerHeight + y * densityConfig.rowHeight + 4 + overlapLevel * (densityConfig.barHeight + 4);
              const width = Math.max(densityConfig.dayWidth - 8, length * densityConfig.dayWidth - 8);
              const height = densityConfig.barHeight;
              return (
                <div
                  key={reservation.id}
                  onPointerDown={(event) => {
                    const originalRoomIndex = roomIndex.get(draft?.room_id || reservation.room_id) || 0;
                    setDrag({
                      id: reservation.id,
                      startX: event.clientX,
                      startY: event.clientY,
                      originalCheckIn: reservation.check_in,
                      originalCheckOut: reservation.check_out,
                      originalRoomIndex
                    });
                  }}
                  className={`absolute z-10 cursor-grab overflow-hidden rounded-md border px-2 py-0.5 text-[11px] shadow-sm active:cursor-grabbing ${reservationColor(reservation.status)}`}
                  style={{ left, top, width, height }}
                  title={`${reservation.guests?.full_name || 'Guest'}\nCheck-in: ${formatDate(checkIn)}\nCheck-out: ${formatDate(checkOut)}\nStatus: ${reservation.status.replace('_', ' ')}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold">{reservation.guests?.full_name || 'Guest'}</span>
                    <Link
                      href={`/reservations/${reservation.id}`}
                      onPointerDown={(event) => event.stopPropagation()}
                      className="shrink-0 font-semibold underline"
                    >
                      Open
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div> : null}
    </div>
  );
}
