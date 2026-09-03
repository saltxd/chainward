import { afterEach, describe, expect, it, vi } from 'vitest';
import { track } from '../track';

type UmamiWindow = { umami?: { track?: (name: string, data?: Record<string, unknown>) => void } };
const g = globalThis as unknown as { window?: UmamiWindow };

afterEach(() => {
  delete g.window;
});

describe('track', () => {
  it('is a no-op when there is no window (server render)', () => {
    expect(() => track('check_submit', { kind: 'address' })).not.toThrow();
  });

  it('is a no-op when the tracker has not been injected', () => {
    g.window = {};
    expect(() => track('check_submit')).not.toThrow();
  });

  it('forwards the event name and data to the Umami tracker', () => {
    const spy = vi.fn();
    g.window = { umami: { track: spy } };
    track('brief_cta_click', { placement: 'landing-line' });
    expect(spy).toHaveBeenCalledWith('brief_cta_click', { placement: 'landing-line' });
  });

  it('never lets a tracker failure reach the caller', () => {
    g.window = {
      umami: {
        track: () => {
          throw new Error('beacon blocked');
        },
      },
    };
    expect(() => track('brief_paid', { price: 5 })).not.toThrow();
  });
});
