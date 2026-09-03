// scripts/auto-decode/lib/__tests__/brief-output.test.ts
import { describe, expect, it } from 'vitest';
import { chunkForDiscord, parseBriefOutput } from '../brief-output';

const MD = '# Brief\n\nParagraph one.\n\nParagraph two.';
const THREAD = ['@you — your ChainWard Intel Brief on 0x1234…cdef:', 'Run your own: chainward.ai/request-brief'];

function out(parts: { md?: string; thread?: unknown; summary?: string }): string {
  const s: string[] = ['some preamble the model printed'];
  if (parts.md !== undefined) s.push(`<BRIEF_MARKDOWN>\n${parts.md}\n</BRIEF_MARKDOWN>`);
  if (parts.thread !== undefined) s.push(`<BRIEF_THREAD>\n${JSON.stringify(parts.thread)}\n</BRIEF_THREAD>`);
  if (parts.summary !== undefined) s.push(`<BRIEF_SUMMARY>${parts.summary}</BRIEF_SUMMARY>`);
  return s.join('\n');
}

describe('parseBriefOutput', () => {
  it('returns the markdown brief and summary for a private order', () => {
    const r = parseBriefOutput(out({ md: MD, summary: 'A token; headline.' }), { needThread: false });
    expect(r.markdown).toBe(MD);
    expect(r.summary).toBe('A token; headline.');
    expect(r.thread).toBeUndefined();
  });

  it('requires the markdown brief regardless of delivery', () => {
    expect(() => parseBriefOutput(out({ thread: THREAD }), { needThread: true })).toThrow(/BRIEF_MARKDOWN/);
    expect(() => parseBriefOutput(out({ md: '   ' }), { needThread: false })).toThrow(/BRIEF_MARKDOWN/);
  });

  it('returns a validated thread for a public order', () => {
    const r = parseBriefOutput(out({ md: MD, thread: THREAD }), { needThread: true });
    expect(r.thread).toEqual(THREAD);
  });

  it('rejects a public order whose thread is missing or malformed', () => {
    expect(() => parseBriefOutput(out({ md: MD }), { needThread: true })).toThrow(/BRIEF_THREAD/);
    expect(() => parseBriefOutput(out({ md: MD, thread: ['only one'] }), { needThread: true })).toThrow(/BRIEF_THREAD/);
    expect(() => parseBriefOutput(out({ md: MD, thread: [...THREAD, 'x'.repeat(281)] }), { needThread: true })).toThrow(
      /BRIEF_THREAD/,
    );
  });

  it('ignores a malformed thread on a private order', () => {
    const r = parseBriefOutput(out({ md: MD, thread: 'not an array' }), { needThread: false });
    expect(r.thread).toBeUndefined();
    expect(r.markdown).toBe(MD);
  });

  it('uses the last block when the model emits one more than once', () => {
    const twice = out({ md: 'draft' }) + '\n' + out({ md: MD });
    expect(parseBriefOutput(twice, { needThread: false }).markdown).toBe(MD);
  });
});

describe('chunkForDiscord', () => {
  it('returns one chunk for short text', () => {
    expect(chunkForDiscord('hello', 1900)).toEqual(['hello']);
  });

  it('returns nothing for empty text', () => {
    expect(chunkForDiscord('', 1900)).toEqual([]);
  });

  it('splits on paragraph boundaries and never exceeds the limit', () => {
    const p = 'x'.repeat(50);
    const text = [p, p, p, p].join('\n\n');
    const chunks = chunkForDiscord(text, 110);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(110);
    expect(chunks.join('\n\n').replace(/\n\n/g, '')).toBe(text.replace(/\n\n/g, ''));
  });

  it('hard-splits a single paragraph longer than the limit', () => {
    const chunks = chunkForDiscord('y'.repeat(250), 100);
    expect(chunks.map((c) => c.length)).toEqual([100, 100, 50]);
  });
});
