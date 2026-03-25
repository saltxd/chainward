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
        '/base/digest/snippets',
      ],
    },
    sitemap: 'https://chainward.ai/sitemap.xml',
  };
}
