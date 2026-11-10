export type AccessProfile = {
  role: string;
  hotel_id: string | null;
};

export function hotelsForProfile<T extends { id: string }>(profile: AccessProfile, hotels: T[]): T[] {
  if (profile.role === 'owner') return hotels;
  return hotels.filter((hotel) => hotel.id === profile.hotel_id);
}

export function rowsForHotels<T extends { hotel_id?: string | null }>(rows: T[], hotelIds: ReadonlySet<string>): T[] {
  return rows.filter((row) => typeof row.hotel_id === 'string' && hotelIds.has(row.hotel_id));
}

export function rowsLinkedTo<T>(
  rows: T[],
  parentId: (row: T) => string | null | undefined,
  allowedParentIds: ReadonlySet<string>
): T[] {
  return rows.filter((row) => {
    const id = parentId(row);
    return typeof id === 'string' && allowedParentIds.has(id);
  });
}
