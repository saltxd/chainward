import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChainWard } from '../src/index.js';

// alerts.create takes a lookbackWindow (the window for balance_drop and
// inactivity, the idle time for idle_balance). SDK 0.1.1 accepted it and never
// sent it, so every such alert ran on the server default.

afterEach(() => vi.unstubAllGlobals());

function captureBody() {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { id: 1 } }), { status: 201 }));
  vi.stubGlobal('fetch', fetchMock);
  return () => {
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    return JSON.parse(init.body as string) as Record<string, unknown>;
  };
}

describe('alerts.create', () => {
  it('sends the lookback window', async () => {
    const body = captureBody();
    await new ChainWard({ apiKey: 'ag_test', baseUrl: 'https://api.test' }).alerts.create({
      wallet: '0x42A09A72eC47647FE9BE1f450Ab8F835D0FF556a',
      type: 'inactivity',
      lookbackWindow: '36 hours',
      channels: ['webhook'],
      webhookUrl: 'https://example.com/hook',
    });
    expect(body()).toMatchObject({ alertType: 'inactivity', lookbackWindow: '36 hours' });
  });

  it('leaves it out when not given', async () => {
    const body = captureBody();
    await new ChainWard({ apiKey: 'ag_test', baseUrl: 'https://api.test' }).alerts.create({
      wallet: '0x42A09A72eC47647FE9BE1f450Ab8F835D0FF556a',
      type: 'large_transfer',
      threshold: 100,
      channels: ['webhook'],
    });
    expect(body()).not.toHaveProperty('lookbackWindow');
    expect(body()).toMatchObject({ thresholdValue: '100', thresholdUnit: 'usd' });
  });
});
