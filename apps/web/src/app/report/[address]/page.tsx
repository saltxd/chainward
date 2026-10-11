import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReportView } from './report-view';
import { isThinReport, reportSearchCopy } from '@/lib/risk';
import { plainAnswer } from '@/lib/plainAnswer';
import type { RiskReport } from '@/lib/api';
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
  const report = await fetchReport(lowered, chain);
  const canonical = `https://chainward.ai/report/${lowered}${chainQuery(chain)}`;
  const ogImageUrl = `https://chainward.ai/api/report/${lowered}/og${chainQuery(chain)}`;

  // No report yet (teaser/no_history) or a thin/empty-wallet report → noindex.
  const thin =
    !report || isThinReport(report.flags.length, report.band);

  // The third answer is named by case (Inactive, No track record, Couldn't check), as on the page.
  const answer = report ? plainAnswer(report) : null;
  const verdict =
    report?.verdict && answer && answer.label === 'unknown'
      ? { ...report.verdict, text: answer.word, reason: answer.why }
      : report?.verdict;
  const { title, description } = reportSearchCopy({
    short: truncated,
    chainName,
    flagCount: report ? report.flags.length : null,
    verdict,
  });

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
