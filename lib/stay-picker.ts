import { formatDate } from './date.ts';

export const STAY_PICKER_STATUS_ORDER = ['overdue', 'in_house', 'arrival', 'departure'] as const;
export type StayPickerStatus = (typeof STAY_PICKER_STATUS_ORDER)[number];
export type StayPickerAction = 'charge' | 'payment';

export const STAY_PICKER_HASH = {
  charge: 'add-charge',
  payment: 'record-payment'
} as const;

export type StayPickerStay = {
  id: string;
  guestName: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  status: StayPickerStatus;
};

export type StayPickerLabels = {
  room: string;
  statuses: Record<StayPickerStatus, string>;
};

export type StayPickerRow = {
  id: string;
  guestName: string;
  roomLabel: string;
  dates: string;
  status: StayPickerStatus;
  statusLabel: string;
  summary: string;
};

export function stayPickerActionHref(stayId: string, action: StayPickerAction): string {
  const id = stayId.trim();
  if (!id) return '';
  return `/reservations/${id}#${STAY_PICKER_HASH[action]}`;
}

export function formatStayPickerDates(checkIn: string, checkOut: string): string {
  return `${formatDate(checkIn)} – ${formatDate(checkOut)}`;
}

export function stayPickerRow(stay: StayPickerStay, labels: StayPickerLabels): StayPickerRow {
  const roomLabel = `${labels.room} ${stay.roomName}`.trim();
  const dates = formatStayPickerDates(stay.checkIn, stay.checkOut);
  const statusLabel = labels.statuses[stay.status];
  return {
    id: stay.id,
    guestName: stay.guestName,
    roomLabel,
    dates,
    status: stay.status,
    statusLabel,
    summary: `${stay.guestName} · ${roomLabel} · ${dates} · ${statusLabel}`
  };
}

export function stayPickerRows(stays: StayPickerStay[], labels: StayPickerLabels): StayPickerRow[] {
  return stays.map((stay) => stayPickerRow(stay, labels));
}
