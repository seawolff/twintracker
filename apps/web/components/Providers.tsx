'use client';
import { ThemeProvider, initI18n } from '@tt/core';

// Initialise i18n once — server defaults to 'en', client uses browser locale.
initI18n(typeof navigator !== 'undefined' ? navigator.language : 'en');

export function Providers({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
