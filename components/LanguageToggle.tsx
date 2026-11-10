'use client';

import { useRouter } from 'next/navigation';
import { localeNames, LOCALES, type Locale } from '@/lib/i18n/types';

export function LanguageToggle({ locale }: { locale: Locale }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-xs text-slate-600">
      Language
      <select
        aria-label="Language"
        className="py-1"
        value={locale}
        onChange={(event) => {
          document.cookie = `locale=${event.target.value}; path=/; max-age=31536000; samesite=lax`;
          router.refresh();
        }}
      >
        {LOCALES.map((code) => <option key={code} value={code}>{localeNames[code]}</option>)}
      </select>
    </label>
  );
}
