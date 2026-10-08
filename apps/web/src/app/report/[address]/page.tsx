import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReportView } from './report-view';
import { isThinReport } from '@/lib/risk';
import type { RiskBand, RiskReport } from '@/lib/api';
import { isAddress } from '@/lib/params';
import { chainMeta, chainQuery, parseChainParam, type RiskChainParam } from '@/lib/chains';

const API_URL = process.env.API_INTERNAL_URL || 'http://localhost:8000';

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

const BAND_WORD: Record<RiskBand, string> = {
  'low-signal': 'low-signal',
  mixed: 'mixed-signal',
  elevated: 'elevated-signal',
  'high-signal': 'high-signal',
};

/** Server-side fetch of the cached report for metadata. Does NOT increment
 * view_count concerns here — the GET route bumps on the client read; the
 * metadata fetch reads the same row. Returns null when there is no report. */
async function fetchReport(address: string, chain: RiskChainParam): Promise<RiskReport | null> {
  try {
    const res = await fetch(`${API_URL}/api/risk/report/${encodeURIComponent(address)}${chainQuery(chain)}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      success: boolean;
      data?: { report: RiskReport };
    };
    if (!json.success || !json.data?.report) return null;
    return json.data.report;
  } catch {
    return null;
  }
}

type SearchParams = Promise<{ chain?: string | string[] }>;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ address: string }>;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { address } = await params;
  const chain = parseChainParam((await searchParams).chain);
  const lowered = address.toLowerCase();
  const truncated = truncateAddress(address);

  if (!isAddress(address) || !chain) {
    return {
      title: 'Risk Check — Invalid Address',
      robots: { index: false, follow: false },
    };
  }

  const chainName = chainMeta(chain).name;
  const report = await fetchReport(lowered, chain);
  const canonical = `https://chainward.ai/report/${lowered}${chainQuery(chain)}`;
  const ogImageUrl = `https://chainward.ai/api/report/${lowered}/og${chainQuery(chain)}`;

  // No report yet (teaser/no_history) or a thin/empty-wallet report → noindex.
  const thin =
    !report || isThinReport(report.flags.length, report.band);

  const flagCount = report?.flags.length ?? 0;
  const bandWord = report ? BAND_WORD[report.band] : 'pending';
  const title = report
    ? `Risk flags for ${truncated} — ${flagCount} flag${flagCount === 1 ? '' : 's'} · ${bandWord}`
    : `Risk check — ${truncated}`;
  const description = report
    ? `${flagCount} on-chain risk flag${flagCount === 1 ? '' : 's'} for ${truncated} on ${chainName}, with evidence. Risk flags from on-chain behavior only — not a safety verdict.`
    : `Run a free on-chain check for ${truncated} on ${chainName}: pay, hold or unknown, with the reason and the evidence.`;

  return {
    title,
    description,
    alternates: { canonical },
    robots: thin
      ? { index: false, follow: true }
      : { index: true, follow: true },
    openGraph: {
      title,
      description,
      siteName: 'ChainWard',
      url: canonical,
      type: 'website',
      images: [{ url: ogImageUrl, width: 1200, height: 675 }],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@chainwardai',
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ address: string }>;
  searchParams: SearchParams;
}) {
  const { address } = await params;
  const chain = parseChainParam((await searchParams).chain);
  // A non-address (or unknown chain) is a 404, not a 200 "invalid target" page
  // (crawlers index status codes).
  if (!isAddress(address) || !chain) notFound();
  return <ReportView address={address} chain={chain} />;
}
