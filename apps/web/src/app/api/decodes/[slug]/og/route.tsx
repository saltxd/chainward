import { getDecodeBySlug } from '@/lib/decodes';
import { DecodeCard, OG_SIZE } from '@/lib/og/cards';
import { decodeCard } from '@/lib/og/model';
import { cardResponse } from '@/lib/og/render';

/**
 * The share card for /decodes/<slug>. Decodes with a pre-rendered
 * public/decodes/<slug>/og.png point X at that file instead (X fetches static
 * images reliably); `pnpm --filter @chainward/web og:render decodes` renders
 * those from this same card.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const decode = getDecodeBySlug(slug);
  if (!decode) return new Response('Not found', { status: 404 });

  return cardResponse(
    <DecodeCard card={decodeCard(decode.meta)} />,
    OG_SIZE.wide,
    'public, max-age=86400, stale-while-revalidate=3600',
  );
}
