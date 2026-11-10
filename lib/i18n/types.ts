export const LOCALES = ['en', 'tl', 'hil', 'akl', 'mln'] as const;
export type Locale = (typeof LOCALES)[number];

export type MessageCatalog = {
  needsReview: boolean;
  labels: Record<string, string>;
  guides: Record<string, { title: string; summary: string; steps: string[] }>;
  faqs: { question: string; answer: string }[];
};

export function isLocale(value: string | undefined | null): value is Locale {
  return LOCALES.includes(value as Locale);
}

export const localeNames: Record<Locale, string> = {
  en: 'English',
  tl: 'Tagalog',
  hil: 'Hiligaynon',
  akl: 'Aklanon',
  mln: 'Malaynon'
};
