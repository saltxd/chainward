import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReportView } from './report-view';
import { isThinReport, reportIndexable } from '@/lib/risk';
import { reportPageCopy } from '@/lib/reportPageCopy';
import type { RiskReport, TokenReport } from '@/lib/api';
import { classifyProbe, tokenAnswer, tokenTitle } from '@/lib/tokenAnswer';
import { DEFAULT_OG_IMAGE } from '@/lib/siteCopy';
import { isAddress } from '@/lib/params';
import { chainMeta, chainQuery, parseChainParam, type RiskChainParam } from '@/lib/chains';

const API_URL = process.env.API_INTERNAL_URL || 'http://localhost:8000';

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

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

/** The rug check already in the cache for a Base token, or null. Cache-only: the server render never reads the chain. */
async function fetchCachedTokenCheck(address: string): Promise<TokenReport | null> {
  try {
    // Not kept by Next: a miss cached here would preview a link shared a minute later as a wallet.
    const res = await fetch(`${API_URL}/api/risk/token-report/${encodeURIComponent(address)}?cached=1`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { success: boolean; data?: TokenReport };
    if (!json.success || !json.data) return null;
    const probe = classifyProbe(json.data, null);
    return probe.kind === 'token' ? probe.check : null;
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
      title: 'Risk check: invalid address',
      robots: { index: false, follow: false },
    };
  }

  const chainName = chainMeta(chain).name;
  const canonical = `https://chainward.ai/report/${lowered}${chainQuery(chain)}`;

  // A Base token checked in the last few minutes previews as its rug check: named by its
  // address (a token's own name is its deployer's choice) and not indexed.
  const tokenCheck = chain === 'base' ? await fetchCachedTokenCheck(lowered) : null;
  if (tokenCheck) {
    const title = tokenTitle(tokenCheck);
    const description = `${tokenAnswer(tokenCheck).word}: ${tokenCheck.verdict.reason}`;
    return {
      title,
      description,
      alternates: { canonical },
      robots: { index: false, follow: true },
      openGraph: { title, description, siteName: 'ChainWard', url: canonical, type: 'website', images: [DEFAULT_OG_IMAGE] },
      twitter: { card: 'summary_large_image', site: '@chainwardai', title, description, images: [DEFAULT_OG_IMAGE.url] },
    };
  }

  const report = await fetchReport(lowered, chain);
  const ogImageUrl = `https://chainward.ai/api/report/${lowered}/og${chainQuery(chain)}`;

  // No report yet (teaser/no_history), or an answer that is neither Pay nor Hold → noindex.
  const thin = isThinReport(report?.verdict);

  // Same copy the client puts in the tab after a re-check (report-view.tsx).
  const { title, description } = reportPageCopy({ report, short: truncated, chainName });

  return {
    title,
    description,
    alternates: { canonical },
    robots: thin || !reportIndexable(report)
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
