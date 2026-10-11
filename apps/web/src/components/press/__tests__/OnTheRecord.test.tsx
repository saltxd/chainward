import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { OnTheRecord } from '../OnTheRecord';

// The homepage's outside proof: only things a reader can click through and check.
describe('OnTheRecord', () => {
  const html = renderToStaticMarkup(<OnTheRecord />);

  it('links each claim to where it can be checked', () => {
    expect(html).toContain('https://github.com/DefiLlama/dimension-adapters/pull/9906');
    expect(html).toContain('https://smartflowproai.substack.com/p/the-spread-by-seller-stack');
    expect(html).toContain('https://payapi.market/api/chainward-pay-hold-or-unknown-for-any-address');
    expect(html).toContain('https://www.x402scan.com/recipient/0xf7ee65130fb2b3bb42cc5cbfed085d7d482667cd');
  });

  it('claims no endorsement it cannot show', () => {
    expect(html).not.toMatch(/as seen on|trusted by|partner|Colosseum/i);
    expect(html).not.toContain('—');
  });
});
