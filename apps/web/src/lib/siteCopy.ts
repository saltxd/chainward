/**
 * The site's default title, description and share card. The root layout uses
 * them as fallbacks for every page; the home page uses them too and owns the
 * canonical URL (a canonical in the root layout is inherited by every page).
 */

export const SITE_URL = 'https://chainward.ai';

export const SITE_TITLE = 'ChainWard: check any address before you pay it';

export const SITE_DESCRIPTION =
  'Paste any Base or BNB Chain address before you pay or hire it. ChainWard tells you Pay or Hold, and why, from the wallet’s on-chain history. Free.';

/** public/chainward-og-card.png, rendered by `pnpm --filter @chainward/web og:render default`. */
export const DEFAULT_OG_IMAGE = {
  url: '/chainward-og-card.png',
  width: 1200,
  height: 630,
  alt: 'ChainWard. About to pay or hire an AI agent? Paste its address first. Pay or Hold, and why. Free.',
};
