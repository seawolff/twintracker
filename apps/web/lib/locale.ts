import { headers } from 'next/headers';

const SUPPORTED_LOCALES = ['en', 'de', 'fr', 'es'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export function resolveLocale(): SupportedLocale {
  const acceptLanguage = headers().get('accept-language');
  if (!acceptLanguage) {
    return 'en';
  }
  const preferred = acceptLanguage
    .split(',')
    .map(s => s.split(';')[0].trim().slice(0, 2).toLowerCase());
  return (preferred.find(l => SUPPORTED_LOCALES.includes(l as SupportedLocale)) ??
    'en') as SupportedLocale;
}
