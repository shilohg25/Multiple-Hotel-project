import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatStayPickerDates,
  stayPickerActionHref,
  stayPickerRow,
  stayPickerRows,
  type StayPickerLabels,
  type StayPickerStay
} from './stay-picker.ts';

const labels: StayPickerLabels = {
  room: 'Room',
  statuses: {
    overdue: 'Overdue',
    in_house: 'In house',
    arrival: 'Arrival',
    departure: 'Departure'
  }
};

const ada: StayPickerStay = {
  id: 'stay-ada',
  guestName: 'TEST- Ada Arrival',
  roomName: '201',
  checkIn: '2026-11-27',
  checkOut: '2026-11-29',
  status: 'arrival'
};

const ben: StayPickerStay = {
  id: 'stay-ben',
  guestName: 'TEST- Ben In-House',
  roomName: '202',
  checkIn: '2026-11-25',
  checkOut: '2026-11-28',
  status: 'in_house'
};

const cora: StayPickerStay = {
  id: 'stay-cora',
  guestName: 'TEST- Cora Departure',
  roomName: '301',
  checkIn: '2026-11-24',
  checkOut: '2026-11-27',
  status: 'overdue'
};

describe('stay picker hrefs', () => {
  it('sends Add charge and Record payment to the matching section of the stay', () => {
    assert.equal(stayPickerActionHref('stay-ben', 'charge'), '/reservations/stay-ben#add-charge');
    assert.equal(stayPickerActionHref('stay-ben', 'payment'), '/reservations/stay-ben#record-payment');
  });

  it('returns no link until a stay is chosen', () => {
    assert.equal(stayPickerActionHref('', 'charge'), '');
    assert.equal(stayPickerActionHref('   ', 'payment'), '');
  });
});

describe('stay picker rows', () => {
  it('lists guest name, room, dates, and status — not a raw id', () => {
    const row = stayPickerRow(ada, labels);
    assert.equal(row.guestName, 'TEST- Ada Arrival');
    assert.equal(row.roomLabel, 'Room 201');
    assert.equal(row.dates, 'Nov 27, 2026 – Nov 29, 2026');
    assert.equal(row.statusLabel, 'Arrival');
    assert.equal(row.summary, 'TEST- Ada Arrival · Room 201 · Nov 27, 2026 – Nov 29, 2026 · Arrival');
    assert.equal(row.summary.includes(ada.id), false);
  });

  it('formats a date range with an en dash', () => {
    assert.equal(formatStayPickerDates('2026-11-25', '2026-11-28'), 'Nov 25, 2026 – Nov 28, 2026');
  });

  it('keeps the caller order, including overdue before in-house stays', () => {
    const rows = stayPickerRows([cora, ben, ada], labels);
    assert.deepEqual(rows.map((row) => [row.id, row.statusLabel]), [
      ['stay-cora', 'Overdue'],
      ['stay-ben', 'In house'],
      ['stay-ada', 'Arrival']
    ]);
  });

  it('uses the provided room and status labels', () => {
    const row = stayPickerRow(ben, {
      room: 'Kuwarto',
      statuses: { ...labels.statuses, in_house: 'Nasa loob' }
    });
    assert.equal(row.roomLabel, 'Kuwarto 202');
    assert.equal(row.statusLabel, 'Nasa loob');
    assert.equal(row.summary, 'TEST- Ben In-House · Kuwarto 202 · Nov 25, 2026 – Nov 28, 2026 · Nasa loob');
  });
});
