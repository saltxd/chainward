import { describe, expect, it } from 'vitest';
import { buildFulfillmentUpdate } from '../lib/briefFulfillment';

describe('buildFulfillmentUpdate', () => {
  it('stores the brief and stamps fulfilment for a delivered order', () => {
    const u = buildFulfillmentUpdate({
      status: 'fulfilled',
      deliveryRef: 'in-app',
      briefMarkdown: '## Brief\n\nBody.',
      prevNotes: null,
    });
    expect(u.status).toBe('fulfilled');
    expect(u.fulfilledAt).toBeInstanceOf(Date);
    expect(u.briefMarkdown).toBe('## Brief\n\nBody.');
    expect(u.notes).toBe('delivered: in-app');
  });

  it('records the error and never stamps fulfilment for a failed order', () => {
    const u = buildFulfillmentUpdate({ status: 'failed', error: 'claude exited 1', prevNotes: null });
    expect(u.status).toBe('failed');
    expect(u.fulfilledAt).toBeUndefined();
    expect(u.briefMarkdown).toBeUndefined();
    expect(u.notes).toBe('error: claude exited 1');
  });

  it('appends to existing notes instead of overwriting the buyer\'s request notes', () => {
    const u = buildFulfillmentUpdate({
      status: 'fulfilled',
      deliveryRef: 'x:123',
      prevNotes: 'verify their burn claims',
    });
    expect(u.notes).toBe('verify their burn claims | delivered: x:123');
  });

  it('drops an empty brief rather than storing blank content', () => {
    const u = buildFulfillmentUpdate({ status: 'fulfilled', deliveryRef: 'x:1', briefMarkdown: '   ', prevNotes: null });
    expect(u.briefMarkdown).toBeUndefined();
  });
});
