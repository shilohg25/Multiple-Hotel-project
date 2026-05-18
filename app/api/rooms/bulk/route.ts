import { NextResponse } from 'next/server';
import { canAccessHotel, canManagePricingSetup } from '@/lib/auth';
import { jsonError, requireApiStaff } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-admin';

function toBoolean(value: unknown, fallback: boolean) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return String(value) === 'true' || String(value) === 'on';
}

function uniqueNames(names: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];
  let duplicateInputCount = 0;

  names.forEach((name) => {
    const key = name.trim().toLowerCase();
    if (!key) return;
    if (seen.has(key)) {
      duplicateInputCount += 1;
      return;
    }
    seen.add(key);
    unique.push(name.trim());
  });

  return { unique, duplicateInputCount };
}

export async function POST(request: Request) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const staff = auth.staff;
  if (!canManagePricingSetup(staff.profile)) return jsonError('Owner or manager access is required to bulk create rooms/units.', 403);

  const payload = await request.json();
  const hotelId = String(payload.hotel_id || '');
  if (!hotelId || !canAccessHotel(staff.profile, hotelId)) return jsonError('Hotel access denied.', 403);

  const mode = String(payload.mode || (Array.isArray(payload.rooms) ? 'array' : 'range'));
  let requestedRooms: Array<{
    name: string;
    room_type_name: string | null;
    capacity: number;
    base_rate: number;
    sort_order: number;
    active: boolean;
  }> = [];

  if (Array.isArray(payload.rooms)) {
    requestedRooms = payload.rooms
      .map((room: Record<string, unknown>, index: number) => ({
        name: String(room.name || '').trim(),
        room_type_name: String(room.room_type_name || '').trim() || null,
        capacity: Math.max(1, Number(room.capacity || 2)),
        base_rate: Math.max(0, Number(room.base_rate || 0)),
        sort_order: Number(room.sort_order || 100 + index),
        active: toBoolean(room.active, true)
      }))
      .filter((room: { name: string }) => room.name);
  } else if (mode === 'custom') {
    const names = String(payload.names || '')
      .split(/\r?\n/)
      .map((name) => name.trim())
      .filter(Boolean);
    requestedRooms = names.map((name, index) => ({
      name,
      room_type_name: String(payload.room_type_name || '').trim() || null,
      capacity: Math.max(1, Number(payload.capacity || 2)),
      base_rate: Math.max(0, Number(payload.base_rate || 0)),
      sort_order: Number(payload.sort_order_start || payload.sort_order || 100) + index,
      active: toBoolean(payload.active, true)
    }));
  } else {
    const prefix = String(payload.prefix || '').trim();
    const startNumber = Number(payload.start_number);
    const endNumber = Number(payload.end_number);
    if (!Number.isInteger(startNumber) || !Number.isInteger(endNumber)) return jsonError('Start and end numbers are required.');
    if (endNumber < startNumber) return jsonError('End number must be greater than or equal to start number.');
    if (endNumber - startNumber > 199) return jsonError('Create 200 rooms/units or fewer at a time.');
    const names = Array.from({ length: endNumber - startNumber + 1 }, (_item, index) => {
      const number = startNumber + index;
      return prefix ? `${prefix} ${number}` : String(number);
    });
    requestedRooms = names.map((name, index) => ({
      name,
      room_type_name: String(payload.room_type_name || '').trim() || null,
      capacity: Math.max(1, Number(payload.capacity || 2)),
      base_rate: Math.max(0, Number(payload.base_rate || 0)),
      sort_order: Number(payload.sort_order_start || payload.sort_order || 100) + index,
      active: toBoolean(payload.active, true)
    }));
  }

  const roomByLowerName = new Map(requestedRooms.map((room) => [room.name.toLowerCase(), room]));
  const { unique, duplicateInputCount } = uniqueNames(requestedRooms.map((room) => room.name));
  if (!unique.length) return jsonError('Enter at least one room/unit name.');

  const { data: existingRaw, error: existingError } = await supabaseAdmin
    .from('rooms')
    .select('name')
    .eq('hotel_id', hotelId);

  if (existingError) return jsonError(existingError.message, 400);

  const existingNames = new Set((existingRaw || []).map((room) => String(room.name).toLowerCase()));
  const insertNames = unique.filter((name) => !existingNames.has(name.toLowerCase()));
  const skippedDuplicates = unique.length - insertNames.length + duplicateInputCount;

  const rows = insertNames.map((name) => {
    const source = roomByLowerName.get(name.toLowerCase());
    return {
      hotel_id: hotelId,
      name,
      room_type_name: source?.room_type_name || null,
      capacity: source?.capacity || 2,
      base_rate: source?.base_rate || 0,
      sort_order: source?.sort_order || 100,
      active: source?.active ?? true
    };
  });

  if (!rows.length) {
    return NextResponse.json({
      created_count: 0,
      skipped_duplicates: skippedDuplicates,
      message: `Created 0 rooms/units. Skipped ${skippedDuplicates} duplicates. Some rooms already existed and were skipped.`
    });
  }

  const { data, error } = await supabaseAdmin.from('rooms').insert(rows).select('*');
  if (error) return jsonError(error.message, 400);

  const createdCount = data?.length || 0;
  return NextResponse.json({
    rooms: data || [],
    created_count: createdCount,
    skipped_duplicates: skippedDuplicates,
    message: skippedDuplicates
      ? `Created ${createdCount} rooms/units. Skipped ${skippedDuplicates} duplicates. Some rooms already existed and were skipped.`
      : `Created ${createdCount} rooms/units.`
  });
}
