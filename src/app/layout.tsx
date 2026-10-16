import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Mis finanzas', template: '%s · Mis finanzas' },
  description: 'Tus cuentas, presupuestos, metas e inversiones en un solo lugar.',
  applicationName: 'Mis finanzas',
  appleWebApp: { capable: true, title: 'Finanzas', statusBarStyle: 'default' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2f5f1' },
    { media: '(prefers-color-scheme: dark)', color: '#101917' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CO">
    <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
