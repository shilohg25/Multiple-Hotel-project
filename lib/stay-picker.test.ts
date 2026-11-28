import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  STAY_PICKER_ROW_GAP_PX,
  STAY_PICKER_ROW_HEIGHT_PX,
  STAY_PICKER_VISIBLE_ROWS,
  formatStayPickerDates,
  stayPickerActionHref,
  stayPickerActions,
  stayPickerCountLabel,
  stayPickerLinkActivatesOnKey,
  stayPickerListMaxHeightPx,
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

describe('stay picker follow-ups', () => {
  it('sizes the list box to a whole number of rows', () => {
    assert.equal(STAY_PICKER_VISIBLE_ROWS, 5);
    assert.equal(
      stayPickerListMaxHeightPx(),
      STAY_PICKER_VISIBLE_ROWS * STAY_PICKER_ROW_HEIGHT_PX + (STAY_PICKER_VISIBLE_ROWS - 1) * STAY_PICKER_ROW_GAP_PX
    );
    assert.equal(stayPickerListMaxHeightPx(4), 4 * STAY_PICKER_ROW_HEIGHT_PX + 3 * STAY_PICKER_ROW_GAP_PX);
    assert.equal(stayPickerListMaxHeightPx(1), STAY_PICKER_ROW_HEIGHT_PX);
  });

  it('shows a stay count so a scrolled list is not silent about hidden rows', () => {
    assert.equal(stayPickerCountLabel(1, '1 stay', '{n} stays'), '1 stay');
    assert.equal(stayPickerCountLabel(4, '1 stay', '{n} stays'), '4 stays');
    assert.equal(stayPickerCountLabel(0, '1 stay', '{n} stays'), '0 stays');
  });

  it('treats Space like Enter on the charge and payment links', () => {
    assert.equal(stayPickerLinkActivatesOnKey(' '), true);
    assert.equal(stayPickerLinkActivatesOnKey('Spacebar'), true);
    assert.equal(stayPickerLinkActivatesOnKey('Enter'), false);
    assert.equal(stayPickerLinkActivatesOnKey('Tab'), false);
  });

  it('hides Add charge when the caller cannot add charges, without changing the rule', () => {
    assert.deepEqual(stayPickerActions(true), ['charge', 'payment']);
    assert.deepEqual(stayPickerActions(false), ['payment']);
  });
});
