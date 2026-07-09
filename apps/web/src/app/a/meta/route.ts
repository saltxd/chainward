import { NextResponse } from 'next/server';

/**
 * Runtime analytics config for the client tracker loader.
 *
 * The public pages are statically prerendered, so anything the layout reads
 * from process.env is baked at CI build time — where analytics env is empty.
 * This route is forced dynamic: it reads the pod's env on every request, so
 * the website id stays runtime-changeable without a rebuild.
 *
 *   GET /a/meta → 204 when analytics is unconfigured (dev / self-hosters)
 *              → 200 { websiteId } when the pod has UMAMI_WEBSITE_ID set
 */

export const dynamic = 'force-dynamic';

export function GET() {
  const websiteId = process.env.UMAMI_WEBSITE_ID;
  // Require the proxy upstream too — a website id without an upstream would
  // load a tracker whose beacons all 404/204 into nothing.
  if (!websiteId || !process.env.UMAMI_INTERNAL_URL) {
    return new NextResponse(null, { status: 204 });
  }
  return NextResponse.json(
    { websiteId },
    // Cache in the browser briefly so client-side navigations don't refetch,
    // but never at the CDN (config changes should land within a minute).
    { headers: { 'cache-control': 'private, max-age=60' } },
  );
}
