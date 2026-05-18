export const serviceCategoryOptions = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'extra_bed', label: 'Extra bed' },
  { value: 'chauffeur', label: 'Chauffeur' },
  { value: 'airport_pickup', label: 'Airport pickup' },
  { value: 'airport_dropoff', label: 'Airport drop-off' },
  { value: 'late_checkout', label: 'Late checkout' },
  { value: 'early_checkin', label: 'Early check-in' },
  { value: 'laundry', label: 'Laundry' },
  { value: 'corkage', label: 'Corkage' },
  { value: 'damage', label: 'Damage' },
  { value: 'lost_key', label: 'Lost key' },
  { value: 'extra_towel', label: 'Extra towel' },
  { value: 'extra_person', label: 'Extra person' },
  { value: 'day_tour', label: 'Day tour' },
  { value: 'other', label: 'Other' }
] as const;

export const serviceCategoryValues = serviceCategoryOptions.map((option) => option.value);

export function normalizeServiceCategory(value: unknown) {
  const category = String(value || '').trim();
  return serviceCategoryValues.includes(category as (typeof serviceCategoryValues)[number]) ? category : 'other';
}
