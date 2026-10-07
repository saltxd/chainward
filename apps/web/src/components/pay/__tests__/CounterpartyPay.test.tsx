import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CounterpartyPay } from '../CounterpartyPay';

const ADDR = '0x4baadba26c3c0bdef9e8faf173925d463aa53bb2';

describe('CounterpartyPay', () => {
  it('asks for an address, with Base and BNB Chain to choose from', () => {
    const html = renderToStaticMarkup(<CounterpartyPay />);
    expect(html).toContain('placeholder="0x…"');
    expect(html).toContain('<option value="base" selected="">Base</option>');
    expect(html).toContain('<option value="bsc">BNB Chain</option>');
  });

  it('keeps the button off until the address is one', () => {
    const html = renderToStaticMarkup(<CounterpartyPay />);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Run the \$0\.05 check with your wallet<\/button>/);
    expect(html).not.toContain('data-resource');
  });

  it('buys the counterparty check for a valid address', () => {
    const html = renderToStaticMarkup(<CounterpartyPay defaultAddress={ADDR} />);
    expect(html).toContain(`data-resource="https://api.chainward.ai/api/risk/x402?address=${ADDR}"`);
    expect(html).toContain('>Run the $0.05 check with your wallet</button>');
  });
});
