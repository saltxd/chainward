import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Nothing in apps/web imports next/image, yet the /_next/image optimizer
  // endpoint is served by default — and it is where Next's unauthenticated
  // AVIF RCE (fixed in 15.5.24) lived. No consumer, no endpoint.
  images: { unoptimized: true },
  transpilePackages: ['@chainward/common'],
  // API proxying handled by app/api/[...path]/route.ts (preserves Set-Cookie for auth)
  async redirects() {
    return [
      // Slug renamed (twice) to bypass Twitter's stuck "no image" cache. The
      // dynamic /api/decodes/<slug>/og route was silently failing X's scraper,
      // so we switched to a pre-rendered static og.png. Old slugs redirect.
      { source: '/decodes/aixbt', destination: '/decodes/aixbt-on-chain', permanent: true },
      { source: '/decodes/aixbt-decode', destination: '/decodes/aixbt-on-chain', permanent: true },
      { source: '/decodes/opengradient-decode', destination: '/decodes/opengradient-on-chain', permanent: true },
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
          // Cloudflare also sets HSTS at the edge; this covers the origin.
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          // allow-popups: Coinbase Smart Wallet and WalletConnect open popups that post back.
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // No 'unsafe-eval': the built chunks don't eval (only guarded
              // Function('return this') globalThis fallbacks that never run in a browser).
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              // Hosts the wallet stack actually calls: WalletConnect (relay/rpc/pulse/verify
              // on .org, legacy .com, Reown config), viem's default public RPCs for base + mainnet,
              // Coinbase Wallet SDK and MetaMask SDK backends.
              [
                "connect-src 'self' https://api.chainward.ai",
                'https://*.walletconnect.org wss://*.walletconnect.org',
                'https://*.walletconnect.com wss://*.walletconnect.com',
                // Reown/AppKit remote project config (inside the WalletConnect connector)
                'https://api.web3modal.org',
                'https://mainnet.base.org https://mainnet-preconf.base.org https://eth.merkle.io',
                'https://*.coinbase.com wss://*.coinbase.com',
                'https://*.metamask.io wss://*.metamask.io',
                'https://*.alchemy.com',
              ].join(' '),
              'frame-src https://*.walletconnect.org https://*.walletconnect.com',
              "frame-ancestors 'none'",
              "form-action 'self'",
              "object-src 'none'",
              "base-uri 'self'",
            ].join('; '),
          },
        ],
      },
      {
        // Override Next.js's default ISR Cache-Control (s-maxage=N, stale-while-revalidate=31535700)
        // The year-long SWR window meant Cloudflare served year-stale pages.
        // 60s fresh + 60s SWR keeps the audit close to live without hammering the upstreams.
        source: '/hyperliquid',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=60, stale-while-revalidate=60' },
        ],
      },
    ];
  },
};

export default nextConfig;
