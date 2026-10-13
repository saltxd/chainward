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
    for (const text of ['Inactive', 'No track record', 'Couldn&#x27;t check']) expect(html).toContain(text);
  });

  it('lists only the datasets on sale', () => {
    expect(html).toContain('Dataset slugs today: <code>termix-wallets</code> and <code>set-and-earn-week-one</code>');
    expect(html).not.toContain('x402-sellers-base');
  });

  it('documents the counterparty check at the path the 402 challenge names', () => {
    expect(html).toContain('GET /api/risk/x402?address=');
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
