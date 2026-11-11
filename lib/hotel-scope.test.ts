import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hotelsForProfile, rowsForHotels, rowsLinkedTo } from './hotel-scope.ts';

const hotels = [{ id: 'hotel-a', name: 'TEST- A' }, { id: 'hotel-b', name: 'TEST- B' }];
const manager = { role: 'manager', hotel_id: 'hotel-a' };

describe('hotel scope', () => {
  it('does not give a manager another hotel’s rows', () => {
    const allowed = new Set(hotelsForProfile(manager, hotels).map((hotel) => hotel.id));
    const items = [
      { hotel_id: 'hotel-a', name: 'Breakfast' },
      { hotel_id: 'hotel-b', name: 'Other hotel breakfast' }
    ];
    assert.deepEqual(rowsForHotels(items, allowed).map((item) => item.name), ['Breakfast']);
  });

  it('drops channel rates whose room type belongs to another hotel', () => {
    const allowedHotels = new Set(hotelsForProfile(manager, hotels).map((hotel) => hotel.id));
    const roomTypes = rowsForHotels(
      [
        { id: 'type-a', hotel_id: 'hotel-a' },
        { id: 'type-b', hotel_id: 'hotel-b' }
      ],
      allowedHotels
    );
    const typeIds = new Set(roomTypes.map((roomType) => roomType.id));
    const rates = rowsLinkedTo(
      [
        { room_type_id: 'type-a', rate: 2250 },
        { room_type_id: 'type-b', rate: 9000 }
      ],
      (rate) => rate.room_type_id,
      typeIds
    );
    assert.deepEqual(rates, [{ room_type_id: 'type-a', rate: 2250 }]);
  });

  it('lets an owner see every hotel that was loaded', () => {
    const owner = { role: 'owner', hotel_id: null };
    assert.deepEqual(hotelsForProfile(owner, hotels).map((hotel) => hotel.id), ['hotel-a', 'hotel-b']);
  });
});
