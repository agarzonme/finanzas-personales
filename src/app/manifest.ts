import type { MetadataRoute } from 'next';

// Permite "Agregar a la pantalla de inicio" en el celular (requiere HTTPS o localhost).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mis finanzas',
    short_name: 'Finanzas',
    description: 'Tus cuentas, presupuestos, metas e inversiones.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f2f5f1',
    theme_color: '#2f6b4f',
    lang: 'es-CO',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
