/** Today action links. Label and href helpers only; no money or access changes. */

export const TODAY_EXPENSE_HASH = 'expense';

export function todayWalkInHref() {
  return '/reservations/new';
}

export function todayCashSheetHref(query: string) {
  return query ? `/today/close?${query}` : '/today/close';
}

/** Add expense lands on the typed-entry section of the Daily cash sheet. */
export function todayExpenseHref(query: string) {
  return `${todayCashSheetHref(query)}#${TODAY_EXPENSE_HASH}`;
}
