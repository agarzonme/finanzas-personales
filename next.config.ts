import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Para importar respaldos grandes. En Vercel el tope real es 4,5 MB por petición.
    serverActions: { bodySizeLimit: '20mb' },
    proxyClientMaxBodySize: '20mb',
  },
  // Cabeceras de seguridad básicas para todas las páginas.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
