'use client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { ThemeProvider, initI18n, configure } from '@tt/core';

let activeLocale: string | null = null;

function ensureProviderSetup(locale: string) {
  if (locale !== activeLocale) {
    initI18n(locale);
    activeLocale = locale;
  }
  // Set platform + app version headers for all API requests from the web app.
  // NEXT_PUBLIC_APP_VERSION is injected at build time from package.json.
  configure('', undefined, 'web', process.env.NEXT_PUBLIC_APP_VERSION ?? undefined);
}

export function Providers({ children, locale }: { children: React.ReactNode; locale: string }) {
  ensureProviderSetup(locale);

  return (
    <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ''}>
      <ThemeProvider>{children}</ThemeProvider>
    </GoogleOAuthProvider>
  );
}
