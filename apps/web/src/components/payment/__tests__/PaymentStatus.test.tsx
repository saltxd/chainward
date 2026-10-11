import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PaymentStatus } from '../PaymentStatus';
import { ClaimByHash } from '../ClaimByHash';

const HASH = '0x' + '5e'.repeat(32);
const noop = () => {};

describe('PaymentStatus while Base confirms', () => {
  const html = renderToStaticMarkup(
    <PaymentStatus phase="waiting" txHash={HASH} message={null} onCheckAgain={noop} onStartOver={noop} />,
  );

  it('says the payment was sent and the buyer can leave', () => {
    expect(html).toContain('Your payment was sent.');
    expect(html).toContain('this can take a minute or two');
    expect(html).toContain('You can leave this page and come back.');
  });

  it('shows the full transaction hash and a BaseScan link', () => {
    expect(html).toContain(HASH);
    expect(html).toContain(`href="https://basescan.org/tx/${HASH}"`);
    expect(html).toContain('View on BaseScan');
  });

  it('announces itself to screen readers', () => {
    expect(html).toContain('role="status"');
  });

  it('offers no way to start over (or pay again) while the payment is in flight', () => {
    expect(html).not.toContain('Start over');
    expect(html).not.toContain('Pay ');
  });

  it('uses no em dashes', () => {
    expect(html).not.toContain('—');
  });
});

describe('PaymentStatus after the ten-minute window', () => {
  const html = renderToStaticMarkup(
    <PaymentStatus phase="timeout" txHash={HASH} message={null} onCheckAgain={noop} onStartOver={noop} />,
  );

  it('keeps the hash, says nothing is lost, and offers to check again', () => {
    expect(html).toContain(HASH);
    expect(html).toContain('saved in this browser');
    expect(html).toContain('>Check again</button>');
    expect(html).toContain('hello@chainward.ai');
  });

  it('still offers no way to pay again', () => {
    expect(html).not.toContain('Start over');
  });
});

describe('PaymentStatus on a final error', () => {
  const html = renderToStaticMarkup(
    <PaymentStatus
      phase="failed"
      txHash={HASH}
      message="This transaction failed on Base, so no USDC was sent."
      onCheckAgain={noop}
      onStartOver={noop}
    />,
  );

  it('shows the plain reason with the hash', () => {
    expect(html).toContain('This transaction failed on Base, so no USDC was sent.');
    expect(html).toContain(HASH);
  });

  it('lets the buyer start over, and says that moves no money', () => {
    expect(html).toContain('>Start over</button>');
    expect(html).toContain('does not move any money');
  });
});

describe('PaymentStatus when a brief session lapsed', () => {
  it('asks to sign in again and keeps the hash', () => {
    const html = renderToStaticMarkup(
      <PaymentStatus phase="signin" txHash={HASH} message="Sign in again." onCheckAgain={noop} onStartOver={noop} onSignIn={noop} />,
    );
    expect(html).toContain('Sign in again.');
    expect(html).toContain('>Sign in again</button>');
    expect(html).toContain(HASH);
    expect(html).not.toContain('Start over');
  });
});

describe('PaymentStatus with nothing to show', () => {
  it('renders nothing before a payment and after it is confirmed', () => {
    for (const phase of ['idle', 'confirmed'] as const) {
      expect(renderToStaticMarkup(<PaymentStatus phase={phase} txHash={null} message={null} onCheckAgain={noop} onStartOver={noop} />)).toBe('');
    }
  });
});

describe('ClaimByHash (as served)', () => {
  const html = renderToStaticMarkup(
    <ClaimByHash summary="Already paid? Paste your transaction hash" hint="Paid from another wallet?" onSubmit={noop} />,
  );

  it('is a collapsed box with the plain prompt', () => {
    expect(html).toContain('<details');
    expect(html).toContain('Already paid? Paste your transaction hash');
    expect(html).toContain('Paid from another wallet?');
  });

  it('has a hash input and a submit button that starts disabled until the hash is valid', () => {
    expect(html).toContain('placeholder="0x…"');
    expect(html.toLowerCase()).toContain('spellcheck="false"');
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  });
});
