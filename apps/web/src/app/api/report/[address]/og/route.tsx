import type { RiskReport } from '@/lib/api';
import { isAddress } from '@/lib/params';
import { chainMeta, chainQuery, parseChainParam, type RiskChainParam } from '@/lib/chains';
import { OG_SIZE, ReportCard } from '@/lib/og/cards';
import { reportCard } from '@/lib/og/model';
import { cardResponse } from '@/lib/og/render';

const API_URL = process.env.API_INTERNAL_URL || 'http://localhost:8000';

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
    return json.success ? (json.data?.report ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * The share card for /report/<address>: the answer as a stamp (Pay, Hold, or
 * which kind of too-little-to-judge), what it means and the one reason. With
 * no answer yet (no report, or one filed before verdicts), it asks the question.
 */
export async function GET(request: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!isAddress(address)) return new Response('Not found', { status: 404 });

  const lowered = address.toLowerCase();
  const chain = parseChainParam(new URL(request.url).searchParams.get('chain')) ?? 'base';
  const report = await fetchReport(lowered, chain);
  const card = reportCard(report, lowered, chainMeta(chain).name);

  return cardResponse(<ReportCard card={card} />, OG_SIZE.wide, 'public, max-age=3600, stale-while-revalidate=600');
}
