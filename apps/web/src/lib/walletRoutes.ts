/**
 * Routes whose page or layout loads the wallet stack (wagmi, RainbowKit, and
 * on the sign-in pages siwe with ethers): sign-in, the pay flows and the
 * dashboard. A Next <Link> prefetches its target's JavaScript as soon as the
 * link scrolls into view, so a plain link to one of these from a public page
 * downloads the whole wallet stack on a page that never uses it. Links to them
 * from public pages pass prefetch={false}; the page then loads on click.
 */
const WALLET_ROUTE = /^\/(login|request-brief|paid|overview|agents|transactions|alerts|settings)(?=[/?#]|$)/;

export function needsWallet(href: string): boolean {
  return WALLET_ROUTE.test(href);
}

/** The prefetch prop for a public link: off for wallet routes, Next's default otherwise. */
export function publicLinkPrefetch(href: string): false | undefined {
  return needsWallet(href) ? false : undefined;
}
