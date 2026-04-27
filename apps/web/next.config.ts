import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  transpilePackages: ['@chainward/common'],
  // API proxying handled by app/api/[...path]/route.ts (preserves Set-Cookie for auth)
  async redirects() {
    return [
      // Slug renamed to bypass Twitter's stuck "no image" cache against the
      // old URL after a botched first scrape. Old URL → new permanently.
      { source: '/decodes/aixbt', destination: '/decodes/aixbt-decode', permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self' https://api.chainward.ai wss://*.walletconnect.com https://*.walletconnect.com https://*.alchemy.com",
              "frame-src 'self' https://verify.walletconnect.com",
              "object-src 'none'",
              "base-uri 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
