import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { VerdictBlock } from '../_components';

// The report page opens with Pay / Hold / Unknown and the one reason, above
// the band and the exhibits. Reports filed before verdicts existed render nothing.

describe('VerdictBlock', () => {
  it('shows the decision, its reason and its limit', () => {
    const html = renderToStaticMarkup(
      <VerdictBlock
        verdict={{ label: 'hold', text: 'Hold', reason: 'Stranded value: holds 5,451 USDC while dormant.', limits: 'On-chain behavior only.' }}
      />,
    );
    expect(html).toContain('rr-verdict--hold');
    expect(html).toContain('Hold');
    expect(html).toContain('Stranded value: holds 5,451 USDC while dormant.');
    expect(html).toContain('On-chain behavior only.');
  });

  it('renders nothing when the report carries no verdict', () => {
    expect(renderToStaticMarkup(<VerdictBlock verdict={undefined} />)).toBe('');
  });
});
