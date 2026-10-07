import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import DocsPage from '../page';

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
});
