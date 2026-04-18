import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Nunito, DM_Mono } from 'next/font/google';
// Import JSON directly — avoid importing @tt/core here as it pulls in client-only
// modules (ThemeContext, createContext) that break Server Component compilation.
import en from '../../../packages/core/src/i18n/en.json';
import de from '../../../packages/core/src/i18n/de.json';
import fr from '../../../packages/core/src/i18n/fr.json';
import es from '../../../packages/core/src/i18n/es.json';
import { Providers } from '../components/Providers';
import '../styles/globals.scss';

const translations = { en, de, fr, es };
type SupportedLocale = keyof typeof translations;

const BASE_URL = 'https://www.twintracker.app';
const OG_IMAGE_URL = `${BASE_URL}/og-image.png`;

const SUPPORTED_LOCALES: SupportedLocale[] = ['en', 'de', 'fr', 'es'];

function resolveLocale(acceptLanguage: string | null): SupportedLocale {
  if (!acceptLanguage) {
    return 'en';
  }
  const preferred = acceptLanguage
    .split(',')
    .map(s => s.split(';')[0].trim().slice(0, 2).toLowerCase());
  return (preferred.find(l => SUPPORTED_LOCALES.includes(l as SupportedLocale)) ??
    'en') as SupportedLocale;
}

function getResolvedLocale(): SupportedLocale {
  return resolveLocale(headers().get('accept-language'));
}

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '700', '800'],
  variable: '--font-nunito',
});
const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-dm-mono',
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = getResolvedLocale();
  const t = translations[locale].meta;

  return {
    metadataBase: new URL(BASE_URL),
    title: {
      default: t.title,
      template: `%s | TwinTracker`,
    },
    description: t.description,
    keywords: t.keywords.split(', '),
    authors: [{ name: 'Chris Wolff' }],
    manifest: '/manifest.json',
    openGraph: {
      type: 'website',
      url: BASE_URL,
      siteName: 'TwinTracker',
      title: t.title,
      description: t.description,
      images: [{ url: OG_IMAGE_URL, width: 1200, height: 630, alt: 'TwinTracker' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t.title,
      description: t.description,
      images: [OG_IMAGE_URL],
    },
    alternates: {
      canonical: BASE_URL,
      languages: {
        en: BASE_URL,
        de: BASE_URL,
        fr: BASE_URL,
        es: BASE_URL,
        'x-default': BASE_URL,
      },
    },
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

// Inline script runs synchronously before first paint — no flash of wrong theme.
const themeScript = `
(function() {
  var h = new Date().getHours();
  var mode = (h >= 6 && h < 22) ? 'day' : 'night';
  document.documentElement.dataset.theme = mode;
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = getResolvedLocale();

  return (
    <html lang={locale} className={`${nunito.variable} ${dmMono.variable}`}>
      <head>
        <link rel="icon" type="image/svg+xml" href="/icon.svg" />
        <link rel="icon" type="image/png" sizes="48x48" href="/icon-48.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icon-16.png" />
        <link rel="apple-touch-icon" href="/icon-1024.png" />
        {/* eslint-disable-next-line react/no-danger */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script
          defer
          src="https://cloud.umami.is/script.js"
          data-website-id="6a1a8583-5c0b-4bb1-887c-f43f7f12096f"
        />
      </head>
      <body suppressHydrationWarning>
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
