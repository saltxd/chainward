import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';

// 402index.io verifies that we own api.chainward.ai by fetching this file and
// comparing it with the hash it issued; a verified domain gets its listings
// approved without manual review. The hash is public by design.
describe('GET /.well-known/402index-verify.txt', () => {
  it('serves exactly the hash 402index issued, as plain text', async () => {
    const app = createApp({ corsOrigins: ['https://chainward.ai'], x402Check: null });
    const res = await app.request('/.well-known/402index-verify.txt');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/plain/);
    expect(await res.text()).toBe('9ed1abee6b118a2073cf0ffc377486c2ef20dc86e12c5ac125a9dd64eae18183');
  });
});
