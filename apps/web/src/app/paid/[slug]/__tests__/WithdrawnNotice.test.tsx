import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WithdrawnNotice } from '../WithdrawnNotice';

// A dataset taken off sale keeps its page, so old decode links still land
// somewhere: the reason and the decode, never a pay box.
describe('WithdrawnNotice', () => {
  const html = renderToStaticMarkup(
    <WithdrawnNotice
      reason="Withdrawn from sale while we ask the data source for permission."
      decodeHref="/decodes/x402-on-base-two-weeks-later"
    />,
  );

  it('says why the dataset is off sale', () => {
    expect(html).toContain('Withdrawn from sale while we ask the data source for permission.');
  });

  it('links to the decode the data came from', () => {
    expect(html).toContain('href="/decodes/x402-on-base-two-weeks-later"');
  });

  it('offers no way to pay', () => {
    expect(html).not.toMatch(/\bPay\b|USDC/);
  });
});
