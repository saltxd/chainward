import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WatchWallet } from '../_components';

const ADDR = '0x4baADbA26C3C0bdEf9E8fAf173925d463aA53BB2';

describe('WatchWallet', () => {
  it('offers free watching of this wallet on a Base report', () => {
    const html = renderToStaticMarkup(<WatchWallet address={ADDR} chain="base" />);
    expect(html).toContain(
      'Is this your agent, or one you pay often? Watch it free: get a Discord or webhook ping when it goes quiet, a transaction fails, or its balance drops.',
    );
    expect(html).toContain(`href="/agents?register=true&amp;address=${ADDR.toLowerCase()}"`);
    expect(html).toContain('Watch this wallet →');
  });

  it('renders nothing on a BNB Chain report (only Base wallets can be watched)', () => {
    expect(renderToStaticMarkup(<WatchWallet address={ADDR} chain="bsc" />)).toBe('');
  });
});
