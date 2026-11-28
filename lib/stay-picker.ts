import { formatDate } from './date.ts';

export const STAY_PICKER_STATUS_ORDER = ['overdue', 'in_house', 'arrival', 'departure'] as const;
export type StayPickerStatus = (typeof STAY_PICKER_STATUS_ORDER)[number];
export type StayPickerAction = 'charge' | 'payment';

export const STAY_PICKER_HASH = {
  charge: 'add-charge',
  payment: 'record-payment'
} as const;

/** Whole rows that fit in the scroll box before a scrollbar appears. */
export const STAY_PICKER_VISIBLE_ROWS = 5;
export const STAY_PICKER_ROW_HEIGHT_PX = 96;
export const STAY_PICKER_ROW_GAP_PX = 8;

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

export function stayPickerListNeedsMaxHeight(total: number, visibleRows = STAY_PICKER_VISIBLE_ROWS): boolean {
  return total > visibleRows;
}

/** CSS fallback only: assumes each row is STAY_PICKER_ROW_HEIGHT_PX. Used until real rows are measured. */
export function stayPickerListMaxHeightPx(visibleRows = STAY_PICKER_VISIBLE_ROWS): number {
  const rows = Math.max(1, visibleRows);
  return rows * STAY_PICKER_ROW_HEIGHT_PX + (rows - 1) * STAY_PICKER_ROW_GAP_PX;
}

/**
 * Cap for a scrolling list from measured row heights.
 * No cap when there are at most `visibleRows` stays, so a wrapped/tall row is never clipped.
 */
export function stayPickerListMaxHeightFromRowHeights(
  rowHeights: number[],
  gapPx = STAY_PICKER_ROW_GAP_PX,
  visibleRows = STAY_PICKER_VISIBLE_ROWS
): number | undefined {
  if (rowHeights.length <= visibleRows) return undefined;
  const visible = rowHeights.slice(0, visibleRows);
  return visible.reduce((sum, height) => sum + height, 0) + (visible.length - 1) * gapPx;
}

/** Preferred once rows are laid out: first-to-last of the first N rows includes CSS gaps exactly. */
export function stayPickerListMaxHeightFromRowBoxes(
  boxes: { top: number; bottom: number }[],
  visibleRows = STAY_PICKER_VISIBLE_ROWS
): number | undefined {
  if (boxes.length <= visibleRows) return undefined;
  const first = boxes[0];
  const last = boxes[visibleRows - 1];
  if (!first || !last) return undefined;
  return last.bottom - first.top;
}

export function stayPickerCountLabel(total: number, one: string, many: string): string {
  if (total === 1) return one;
  return many.replaceAll('{n}', String(total));
}

/** Space should activate the Add charge / Record payment links, like Enter does on <a>. */
export function stayPickerLinkActivatesOnKey(key: string): boolean {
  return key === ' ' || key === 'Spacebar';
}

/**
 * Today shows Add charge only when the caller may add charges.
 * Pass canAddReservationCharges(profile); this helper does not change that rule.
 */
export function stayPickerActions(canAddCharges: boolean): StayPickerAction[] {
  return canAddCharges ? ['charge', 'payment'] : ['payment'];
}
