import type { Metadata, Viewport } from 'next';
import { Gilda_Display, Noto_Sans } from 'next/font/google';
import { ToastProvider } from '@/components/ui/toast';
import './globals.css';

// Gilda Display: serif de alto contraste afín a Agatho (la del logo), solo para títulos y códigos sellados.
// Noto Sans: cuerpo y datos, la misma familia que v1 (continuidad para quien ya usa Winzer).
const display = Gilda_Display({ subsets: ['latin'], weight: '400', variable: '--font-display', display: 'swap' });
const body = Noto_Sans({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Winzer', template: '%s · Winzer' },
  description: 'Gestión integral para viñas boutique: de la parra a la botella, y de la venta al F29.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Winzer', statusBarStyle: 'default' }
};
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f6f4' },
    { media: '(prefers-color-scheme: dark)', color: '#0f0e0d' }
  ]
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL" className={`${display.variable} ${body.variable}`} style={{ ['--font-numeric' as string]: 'var(--font-body)' }}>
      <body className="min-h-dvh font-sans">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
