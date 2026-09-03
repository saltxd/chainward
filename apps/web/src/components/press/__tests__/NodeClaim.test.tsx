import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NodeClaim, NodeClaimText } from '../NodeClaim';

const props = { live: 'our own Base node', neutral: 'the chain' };

describe('NodeClaimText', () => {
  it('claims the own node only when provenance is live', () => {
    expect(renderToStaticMarkup(<NodeClaimText status="live" {...props} />)).toBe(
      'our own Base node',
    );
  });

  it.each(['unknown', 'syncing', 'offline'] as const)(
    'falls back to the neutral wording when status is %s',
    (status) => {
      expect(renderToStaticMarkup(<NodeClaimText status={status} {...props} />)).toBe(
        'the chain',
      );
    },
  );
});

describe('NodeClaim (server render)', () => {
  it('never asserts the own node in static HTML, before telemetry can confirm it', () => {
    // Effects do not run during a server render, so this is exactly what
    // crawlers and the prerendered page deliver. It must be the neutral claim.
    const html = renderToStaticMarkup(<NodeClaim {...props} />);
    expect(html).toBe('the chain');
    expect(html).not.toContain('own Base node');
  });
});
