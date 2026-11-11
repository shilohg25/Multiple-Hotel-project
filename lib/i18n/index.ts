import { cookies } from 'next/headers';
import { akl } from './akl';
import { en } from './en';
import { hil } from './hil';
import { mln } from './mln';
import { tl } from './tl';
import { isLocale, type Locale, type MessageCatalog } from './types';

const catalogs: Record<Locale, MessageCatalog> = { en, tl, hil, akl, mln };

export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get('locale')?.value;
  return isLocale(value) ? value : 'en';
}

export function label(locale: Locale, key: string): string {
  return catalogs[locale]?.labels[key] || en.labels[key] || key;
}

export function messagesFor(locale: Locale) {
  const selected = catalogs[locale] ?? en;
  const guideIds = Object.keys(en.guides);
  return {
    needsReview: locale !== 'en' && selected.needsReview,
    labels: { ...en.labels, ...selected.labels },
    guides: guideIds.map((id) => ({ id, ...(selected.guides[id] || en.guides[id]) })),
    faqs: en.faqs.map((faq, index) => selected.faqs[index] || faq)
  };
}
