const DEFAULT_TIMEOUT_MS = 30_000;

// The paid x402 handlers in apps/api run for up to 55 s (a fresh decode), and
// the payment middleware settles on any 2xx whether or not the caller is still
// connected. If the proxy aborted first, the buyer would get a 502 and still
// be charged, so paid paths wait longer than any handler's budget.
const PAID_TIMEOUT_MS = 65_000;
const PAID_PATH_RE = /^\/api\/(?:risk\/(?:x402(?:\/[^/]*)?|seller-demand|hires)|paid\/.+)\/?$/;

/** How long the proxy waits for the API on this path before answering 502. */
export function upstreamTimeoutMs(pathname: string): number {
  return PAID_PATH_RE.test(pathname) ? PAID_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
}
