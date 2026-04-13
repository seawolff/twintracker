'use client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { ThemeProvider, initI18n } from '@tt/core';

// Initialise i18n once — server defaults to 'en', client uses browser locale.
initI18n(typeof navigator !== 'undefined' ? navigator.language : 'en');

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ''}>
      <ThemeProvider>{children}</ThemeProvider>
    </GoogleOAuthProvider>
  );
}
