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

const dayWidth = 84;
const roomLabelWidth = 180;
const rowHeight = 64;
const headerHeight = 40;

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
  const days = useMemo(() => eachDate(from, to), [from, to]);
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

  const roomIndex = useMemo(() => {
    const map = new Map<string, number>();
    rooms.forEach((room, index) => map.set(room.id, index));
    return map;
  }, [rooms]);

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
    const xDays = Math.round((event.clientX - drag.startX) / dayWidth);
    const yRows = Math.round((event.clientY - drag.startY) / rowHeight);
    const nextRoomIndex = Math.max(0, Math.min(rooms.length - 1, drag.originalRoomIndex + yRows));
    const length = Math.max(1, diffDays(drag.originalCheckIn, drag.originalCheckOut));
    const nextCheckIn = toISODate(addDays(drag.originalCheckIn, xDays));
    const nextCheckOut = toISODate(addDays(nextCheckIn, length));
    const nextRoom = rooms[nextRoomIndex];
    if (!nextRoom) return;
    setDrafts((prev) => ({ ...prev, [drag.id]: { check_in: nextCheckIn, check_out: nextCheckOut, room_id: nextRoom.id } }));
  }

  function onPointerUp() {
    if (!drag) return;
    const draft = drafts[drag.id];
    setDrag(null);
    if (draft) void saveMove(drag.id, draft);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
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
        <div className="flex gap-2">
          <Link href={`/reservations?hotel=${hotel.id}&from=${toISODate(addDays(from, -30))}&to=${from}`} className="btn-secondary">Previous</Link>
          <Link href={`/reservations?hotel=${hotel.id}&from=${to}&to=${toISODate(addDays(to, 30))}`} className="btn-secondary">Next</Link>
          <Link href="/reservations/new" className="btn-primary">New reservation</Link>
        </div>
      </div>

      {notice ? <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{notice}</div> : null}

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="flex flex-col justify-between gap-2 md:flex-row md:items-start">
            <div>
              <h2 className="text-base font-bold leading-tight">Gantt booking board</h2>
              <p className="mt-0.5 text-xs text-slate-500">Drag a booking horizontally to change dates or vertically to move rooms. Secured overlaps are blocked.</p>
            </div>
            <p className="text-xs text-slate-500">{formatDate(from)} – {formatDate(toISODate(addDays(to, -1)))}</p>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900">
              <ReservationStatusBadge status="tentative" />
            </div>
            <div className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-900">
              <ReservationStatusBadge status="payment_submitted" />
            </div>
            <div className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-900">
              <ReservationStatusBadge status="secured" />
            </div>
            <div className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-900">
              <ReservationStatusBadge status="checked_in" />
            </div>
          </div>
        </div>
        <div className="max-h-[72vh] overflow-auto">
          <div
            className="relative select-none"
            style={{ width: roomLabelWidth + days.length * dayWidth, height: headerHeight + Math.max(1, rooms.length) * rowHeight }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <div className="sticky left-0 top-0 z-30 flex items-center border-b border-r border-slate-200 bg-slate-50 px-3 text-xs font-bold" style={{ width: roomLabelWidth, height: headerHeight }}>
              Room
            </div>
            {days.map((day, index) => (
              <div
                key={day}
                className="absolute top-0 z-20 flex items-center justify-center border-b border-r border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600"
                style={{ left: roomLabelWidth + index * dayWidth, width: dayWidth, height: headerHeight }}
              >
                {formatDate(day)}
              </div>
            ))}
            {rooms.map((room, index) => (
              <div key={room.id}>
                <div
                  className="sticky left-0 z-20 flex items-center border-b border-r border-slate-200 bg-white px-3"
                  style={{ top: headerHeight + index * rowHeight, width: roomLabelWidth, height: rowHeight }}
                >
                  <div>
                    <p className="text-sm font-semibold leading-tight">{room.name}</p>
                    <p className="text-[11px] leading-tight text-slate-500">{room.room_type_name || 'Room'} · {currency(room.base_rate, hotel.default_currency)}</p>
                  </div>
                </div>
                {days.map((day, dayIndex) => (
                  <div
                    key={`${room.id}-${day}`}
                    className="absolute border-b border-r border-slate-100"
                    style={{ left: roomLabelWidth + dayIndex * dayWidth, top: headerHeight + index * rowHeight, width: dayWidth, height: rowHeight }}
                  />
                ))}
              </div>
            ))}
            {reservations.map((reservation, reservationListIndex) => {
              const draft = drafts[reservation.id];
              const checkIn = draft?.check_in || reservation.check_in;
              const checkOut = draft?.check_out || reservation.check_out;
              const roomId = draft?.room_id || reservation.room_id;
              const y = roomIndex.get(roomId);
              if (y === undefined) return null;
              const start = Math.max(0, diffDays(from, checkIn));
              const length = Math.max(1, diffDays(checkIn, checkOut));
              const left = roomLabelWidth + start * dayWidth + 5;
              const overlapLevel = reservations
                .slice(0, reservationListIndex)
                .filter((other) => {
                  const otherDraft = drafts[other.id];
                  const otherRoomId = otherDraft?.room_id || other.room_id;
                  const otherCheckIn = otherDraft?.check_in || other.check_in;
                  const otherCheckOut = otherDraft?.check_out || other.check_out;
                  return otherRoomId === roomId && rangesOverlap(checkIn, checkOut, otherCheckIn, otherCheckOut);
                }).length % 2;
              const top = headerHeight + y * rowHeight + 5 + overlapLevel * 25;
              const width = Math.max(dayWidth - 10, length * dayWidth - 10);
              const height = 22;
              return (
                <div
                  key={reservation.id}
                  onPointerDown={(event) => {
                    const originalRoomIndex = roomIndex.get(reservation.room_id) || 0;
                    setDrag({
                      id: reservation.id,
                      startX: event.clientX,
                      startY: event.clientY,
                      originalCheckIn: reservation.check_in,
                      originalCheckOut: reservation.check_out,
                      originalRoomIndex
                    });
                  }}
                  className={`absolute z-30 cursor-grab rounded-lg border px-2 py-0.5 text-[11px] shadow-sm active:cursor-grabbing ${reservationColor(reservation.status)}`}
                  style={{ left, top, width, height }}
                  title="Drag to move"
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
      </div>
    </div>
  );
}
