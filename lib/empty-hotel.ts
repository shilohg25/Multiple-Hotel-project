export const EMPTY_HOTEL_MESSAGE_KEY = 'empty.noHotel';
export const EMPTY_HOTEL_MESSAGE_OWNER_KEY = 'empty.noHotelOwner';

export const EMPTY_HOTEL_MESSAGE_EN =
  'No hotel is available for your account. Ask a manager.';

export const EMPTY_HOTEL_MESSAGE_OWNER_EN =
  'No hotel is available for your account. Add a hotel or turn one back on.';

export function emptyHotelMessageKey(role: string | null | undefined): string {
  return role === 'owner' ? EMPTY_HOTEL_MESSAGE_OWNER_KEY : EMPTY_HOTEL_MESSAGE_KEY;
}

export function shouldShowHotelActionLinks(hotelCount: number): boolean {
  return hotelCount > 0;
}

export function shouldShowOwnerPanel(role: string): boolean {
  return role === 'owner';
}

export function shouldShowOwnerControlsHeading(role: string): boolean {
  return role === 'owner';
}
