import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      disallow: [
        '/api/',
        '/overview',
        '/agents',
        '/transactions',
        '/alerts',
        '/settings',
        '/login',
        '/register',
        // Exact match and subpaths only: a bare '/wallet' prefix also hid the public /wallet-api page.
        '/wallet$',
        '/wallet/',
        '/base/digest/snippets',
      ],
    },
    sitemap: 'https://chainward.ai/sitemap.xml',
  };
}
