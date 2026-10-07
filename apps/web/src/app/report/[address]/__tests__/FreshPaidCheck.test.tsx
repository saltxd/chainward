import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FreshPaidCheck } from '../_components';

const ADDR = '0x4baadba26c3c0bdef9e8faf173925d463aa53bb2';

describe('FreshPaidCheck', () => {
  it('offers a fresh paid check of this address next to the free report', () => {
    const html = renderToStaticMarkup(<FreshPaidCheck address={ADDR} chain="base" />);
    expect(html).toContain('Fresh paid check');
    expect(html).toContain(`data-resource="https://api.chainward.ai/api/risk/x402?address=${ADDR}"`);
    expect(html).toContain('>Run the $0.05 check with your wallet</button>');
  });

  it('checks the BNB Chain address on a BNB Chain report', () => {
    const html = renderToStaticMarkup(<FreshPaidCheck address={ADDR} chain="bsc" />);
    expect(html).toContain(`data-resource="https://api.chainward.ai/api/risk/x402?address=${ADDR}&amp;chain=bsc"`);
  });
});
