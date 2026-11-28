export const EMPTY_HOTEL_MESSAGE_KEY = 'empty.noHotel';

export const EMPTY_HOTEL_MESSAGE_EN =
  'No hotel is available for your account. Ask a manager.';

export function shouldShowHotelActionLinks(hotelCount: number): boolean {
  return hotelCount > 0;
}

export function shouldShowOwnerPanel(role: string): boolean {
  return role === 'owner';
}

export function shouldShowOwnerControlsHeading(role: string): boolean {
  return role === 'owner';
}
