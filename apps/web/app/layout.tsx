import type { Metadata, Viewport } from 'next';
import { Nunito, DM_Mono } from 'next/font/google';
import { Providers } from '../components/Providers';
import '../styles/globals.scss';

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

export const metadata: Metadata = {
  title: 'TwinTracker',
  description: 'One thumb. Zero math. Baby care tracking for new parents.',
  manifest: '/manifest.json',
};

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
  return (
    <html lang="en" className={`${nunito.variable} ${dmMono.variable}`}>
      <head>
        {/* eslint-disable-next-line react/no-danger */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
