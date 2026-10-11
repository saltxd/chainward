import { describe, expect, it } from 'vitest';
import { readCappedBody } from '../readCappedBody';

function stream(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

describe('readCappedBody', () => {
  it('returns the whole body when it fits', async () => {
    const body = await readCappedBody(stream(['ab', 'cd']), 4);
    expect(new TextDecoder().decode(body!)).toBe('abcd');
  });

  it('returns null once the body passes the cap', async () => {
    expect(await readCappedBody(stream(['ab', 'cde']), 4)).toBeNull();
  });

  it('returns an empty body for no stream', async () => {
    expect((await readCappedBody(null, 4))!.byteLength).toBe(0);
  });
});
