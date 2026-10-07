import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PayCheckButton, PayCheckRow } from '../PayCheckButton';
import { outcomeEvent } from '../payState';

const RESOURCE = 'https://api.chainward.ai/api/risk/seller-demand?address=0x68396bd35874695ad86cd29410bd80a550991a2b';

describe('PayCheckButton (as served, before any click)', () => {
  const html = renderToStaticMarkup(<PayCheckButton resource={RESOURCE} label="Seller check" price="$0.10" />);

  it('is one button that names the price', () => {
    expect(html).toContain('>Run the $0.10 check with your wallet</button>');
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(`data-resource="${RESOURCE}"`);
  });

  it('renders no panel until clicked', () => {
    expect(html).not.toContain('pay-panel');
  });
});

describe('PayCheckRow', () => {
  it('adds one compact button cell to the row and no panel row', () => {
    const html = renderToStaticMarkup(
      <table>
        <tbody>
          <PayCheckRow resource={RESOURCE} label="Seller check for 0x6839…1a2b" price="$0.10" colSpan={3}>
            <td>a</td>
            <td>b</td>
          </PayCheckRow>
        </tbody>
      </table>,
    );
    expect(html.match(/<tr/g)).toHaveLength(1);
    expect(html).toContain('<td>a</td><td>b</td><td class="pay-cell">');
    expect(html).toContain('aria-label="Seller check for 0x6839…1a2b: run the $0.10 check with your wallet"');
    expect(html).toContain('>$0.10 check</button>');
    expect(html).toContain(`data-resource="${RESOURCE}"`);
  });
});

describe('outcomeEvent', () => {
  it('maps a paid check to its result', () => {
    expect(outcomeEvent({ kind: 'paid', data: { a: 1 }, transaction: '0xabc' })).toEqual({
      type: 'paid',
      data: { a: 1 },
      transaction: '0xabc',
    });
  });

  it('maps a refusal, a failed check and a cancelled signature to not charged', () => {
    expect(outcomeEvent({ kind: 'refused', message: 'Not enough USDC on Base in this wallet.' })).toEqual({
      type: 'failed',
      message: 'Not enough USDC on Base in this wallet.',
      charged: false,
    });
    expect(outcomeEvent({ kind: 'failed', status: 504, message: 'The check did not finish in time.' })).toEqual({
      type: 'failed',
      message: 'The check did not finish in time.',
      charged: false,
    });
    expect(outcomeEvent({ kind: 'cancelled' })).toEqual({ type: 'failed', message: 'Signature cancelled.', charged: false });
  });

  it('says a broken-off paid request may have been charged', () => {
    expect(outcomeEvent({ kind: 'interrupted' })).toEqual({
      type: 'failed',
      message: 'The connection dropped after the payment was sent.',
      charged: 'unknown',
    });
  });
});
