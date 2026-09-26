import type { MetadataRoute } from 'next';
import { isThinReport, reportPath } from '@/lib/risk';
import type { RiskLibraryResult } from '@/lib/api';
import { getAllDecodes } from '@/lib/decodes';

// Run per-request (with the inner fetch's cache) so the sitemap can reach the
// internal API. Default behavior is to evaluate at build time, which can't see
// API_INTERNAL_URL because it points at the in-cluster service.
export const dynamic = 'force-dynamic';

const SITE = 'https://chainward.ai';
const API_INTERNAL_URL = process.env.API_INTERNAL_URL || 'http://localhost:8000';

// Cap how many reports we enumerate so the sitemap stays bounded.
const REPORTS_LIMIT = 100;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static routes
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE}/reports`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${SITE}/base`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${SITE}/hyperliquid`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${SITE}/decodes`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE}/mcp`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE}/docs/api`, changeFrequency: 'monthly', priority: 0.5 },
  ];

  // Published decodes — the site's deepest pages (drafts are excluded by the loader).
  const decodeRoutes: MetadataRoute.Sitemap = getAllDecodes().map((d) => ({
    url: `${SITE}/decodes/${d.slug}`,
    lastModified: new Date(d.date),
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }));

  // Per-agent routes — every named observatory agent (unnamed placeholder
  // slugs are too thin to index; the API filters them out).
  let agentRoutes: MetadataRoute.Sitemap = [];
  try {
    const res = await fetch(`${API_INTERNAL_URL}/api/observatory/sitemap`, {
      next: { revalidate: 3600 },
    });

    if (res.ok) {
      const json = (await res.json()) as {
        data?: Array<{ slug: string; updatedAt: string }>;
      };
      agentRoutes = (json.data ?? []).map((a) => ({
        url: `${SITE}/base/${a.slug}`,
        lastModified: new Date(a.updatedAt),
        changeFrequency: 'daily' as const,
        priority: 0.7,
      }));
    }
  } catch {
    // If the API is unreachable, fall back to the other routes.
  }

  // Public risk reports — enumerate non-thin (indexable) ones only.
  let reportRoutes: MetadataRoute.Sitemap = [];
  try {
    const res = await fetch(
      `${API_INTERNAL_URL}/api/risk/library?sort=recent&limit=${REPORTS_LIMIT}&offset=0`,
      { next: { revalidate: 3600 } },
    );
    if (res.ok) {
      const json = (await res.json()) as {
        success: boolean;
        data?: RiskLibraryResult;
      };
      const reports = json.data?.reports ?? [];
      reportRoutes = reports
        .filter((r) => !isThinReport(r.flag_count, r.band))
        .map((r) => ({
          url: `${SITE}${reportPath(r.address)}`,
          lastModified: new Date(r.as_of_date),
          changeFrequency: 'daily' as const,
          priority: 0.6,
        }));
    }
  } catch {
    // API unreachable — omit report routes.
  }

  return [...staticRoutes, ...decodeRoutes, ...agentRoutes, ...reportRoutes];
}
