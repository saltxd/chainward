import { getAllDecodes } from '@/lib/decodes';
import { buildDecodesFeed } from '@/lib/decodesFeed';

// deliverables/ is read at build time and is not in the runtime image, so the
// feed is rendered once at build, the same way the decode pages are.
export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(buildDecodesFeed(getAllDecodes()), {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
}
