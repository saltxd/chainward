import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BriefOffer } from '../BriefOffer';

// Briefs are delivered privately. The public @chainwardai thread option is retired:
// it would post from the brand account with no review.

describe('BriefOffer', () => {
  const html = renderToStaticMarkup(<BriefOffer placement="test" />);

  it('promises private delivery only', () => {
    expect(html).toContain('Delivered privately within 48 hours');
    expect(html).not.toMatch(/public @chainwardai thread|as a public thread/);
  });

  it('takes a page-specific title', () => {
    const custom = renderToStaticMarkup(<BriefOffer placement="test" title="Want the launch wallet's whole record?" />);
    expect(custom).toContain('Want the launch wallet&#x27;s whole record?');
  });
});
