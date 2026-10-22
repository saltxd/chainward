import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import DocsPage from '../page';
import ApiReferencePage from '../api/page';
import CliDocsPage from '../cli/page';
import AlertTypesPage from '../alerts/page';

describe('/docs', () => {
  const html = renderToStaticMarkup(<DocsPage />);

  it('lets a reader buy the counterparty check from the paid section', () => {
    const paid = html.slice(html.indexOf('Pay per request over x402'), html.indexOf('<h2>Datasets</h2>'));
    expect(paid).toContain('placeholder="0x…"');
    expect(paid).toContain('Run the $0.05 check with your wallet');
    expect(paid).toContain('USDC on Base');
  });

  it('still sends curl users to api.chainward.ai', () => {
    expect(html).toContain('send paid requests to <code>https://api.chainward.ai</code> directly');
  });

  it('explains the machine label apart from the words a person sees', () => {
    for (const label of ['pay', 'hold', 'unknown']) expect(html).toContain(`<code>${label}</code>`);
    for (const text of ['Inactive', 'No track record', 'Couldn&#x27;t check', 'Payer hidden']) expect(html).toContain(text);
    expect(html).toContain('has four wordings');
  });

  it('lists only the datasets on sale', () => {
    expect(html).toContain('Dataset slugs today: <code>termix-wallets</code> and <code>set-and-earn-week-one</code>');
    expect(html).not.toContain('x402-sellers-base');
  });

  it('documents the counterparty check at the path the 402 challenge names', () => {
    expect(html).toContain('GET /api/risk/x402?address=');
  });

  it('documents the rug check with its price and what it does not cover', () => {
    const paid = html.slice(html.indexOf('Pay per request over x402'), html.indexOf('<h2>Datasets</h2>'));
    expect(paid).toContain('GET /api/risk/rugcheck?token=');
    expect(paid).toContain('0.02 USDC');
    expect(paid).toContain('not a honeypot');
  });

  // An agent pays nothing for an address that is not a token, and can tell a cached answer from a fresh one.
  it('says the rug check refuses a non-token before payment and dates every answer', () => {
    const paid = html.slice(html.indexOf('Pay per request over x402'), html.indexOf('<h2>Datasets</h2>'));
    expect(paid).toContain('NOT_A_TOKEN');
    expect(paid).toMatch(/before payment/);
    expect(paid).not.toMatch(/that\s+answer is charged/);
    for (const field of ['checked_at', 'cached', 'age_seconds']) expect(paid).toContain(`<code>${field}</code>`);
  });

  // People paste a token on chainward.ai for free; the paid route is for bots and apps.
  it('says people can run the rug check free on the site', () => {
    const paid = html.slice(html.indexOf('Pay per request over x402'), html.indexOf('<h2>Datasets</h2>'));
    expect(paid).toContain('href="/rugcheck"');
    expect(paid).toMatch(/free on the site/);
  });

  it('sends x402 sellers to the endpoint watch from the paid section', () => {
    const paid = html.slice(html.indexOf('Pay per request over x402'), html.indexOf('<h2>Datasets</h2>'));
    expect(paid).toContain('href="/x402/watch"');
    expect(paid).toContain('Sell over x402 yourself?');
  });

  // The label set: what our published investigations found about a wallet.
  it('says a strong label from our published investigations answers Hold, and the rug check names the launch wallet\'s', () => {
    const paid = html.slice(html.indexOf('Pay per request over x402'), html.indexOf('<h2>Datasets</h2>'));
    expect(paid).toMatch(/a strong label from our published investigations or detectors answers <code>hold<\/code>/i);
    expect(paid).toMatch(/labels our published investigations put on the launch wallet/);
    // The detector's rule is public: what earns the label, and for how long.
    expect(paid).toMatch(/labeled a serial\s+launcher until 30 days after that launch/);
  });

  // Most Clanker launches come from wallets that launch dozens of tokens a day.
  it('says the rug check counts Clanker launches by the same wallet, and names the admin behind a service launch', () => {
    const paid = html.slice(html.indexOf('Pay per request over x402'), html.indexOf('<h2>Datasets</h2>'));
    expect(paid).toMatch(/how many tokens it\s+launched through Clanker, Doppler and Zora in the busiest 24 hours around this one/);
    expect(paid).toMatch(/made for another wallet \(Clanker(&#x27;|')s\s+token admin, Zora(&#x27;|')s payout recipient or Doppler(&#x27;|')s vesting beneficiary\), the\s+wallet checks run on that wallet/);
  });
});

describe.each([
  ['/docs', DocsPage],
  ['/docs/api', ApiReferencePage],
  ['/docs/cli', CliDocsPage],
  ['/docs/alerts', AlertTypesPage],
])('%s', (_path, Page) => {
  const html = renderToStaticMarkup(<Page />);

  it('gives every code block a Copy button', () => {
    const blocks = html.match(/<pre/g) ?? [];
    expect(blocks.length).toBeGreaterThan(0);
    expect(html.match(/aria-label="Copy code"/g)).toHaveLength(blocks.length);
  });

  it('quotes API URLs with a query string, so zsh does not glob them', () => {
    const urls = [...html.matchAll(/(\S{0,6})https:\/\/api\.chainward\.ai\/[^\s<]*\?/g)];
    for (const [url, before] of urls) expect(before, url).toMatch(/(&#x27;|&quot;)$/);
  });

  it('uses no em dashes', () => {
    expect(html).not.toContain('—');
  });
});
