export const ROOM_JUST_TAKEN = 'Those dates were just taken for this room. Please pick other dates or another room.';

/** Postgres exclusion violations and the app's own overlap wording. */
export function isRoomOverlapError(error: { message?: string; code?: string; details?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  const text = `${error.message || ''} ${error.details || ''}`;
  return code === '23P01' || /exclusion constraint|prevent_holding_room_overlap|prevent_secured_room_overlap|\boverlaps?\b/i.test(text);
}
