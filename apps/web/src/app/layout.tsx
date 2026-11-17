import type { Metadata, Viewport } from 'next';
import { Fraunces, Instrument_Sans } from 'next/font/google';
import { ToastProvider } from '@/components/ui/toast';
import './globals.css';

// Fraunces: serif con carácter de etiqueta de vino, solo para títulos. Instrument Sans: cuerpo y datos.
const display = Fraunces({ subsets: ['latin'], variable: '--font-display', axes: ['opsz'], display: 'swap' });
const body = Instrument_Sans({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Winzer', template: '%s · Winzer' },
  description: 'Gestión integral para viñas boutique: de la parra a la botella, y de la venta al F29.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Winzer', statusBarStyle: 'default' }
};
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf8f4' },
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
