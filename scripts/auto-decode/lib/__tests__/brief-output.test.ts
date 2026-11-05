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
    expect(() => parseBriefOutput(out({ thread: THREAD }), { needThread: true, buyerHandle: 'you' })).toThrow(/BRIEF_MARKDOWN/);
    expect(() => parseBriefOutput(out({ md: '   ' }), { needThread: false })).toThrow(/BRIEF_MARKDOWN/);
  });

  it('returns a validated thread for a public order', () => {
    const r = parseBriefOutput(out({ md: MD, thread: THREAD }), { needThread: true, buyerHandle: 'you' });
    expect(r.thread).toEqual(THREAD);
  });

  it('rejects a public order whose thread is missing or malformed', () => {
    const pub = { needThread: true, buyerHandle: 'you' } as const;
    expect(() => parseBriefOutput(out({ md: MD }), pub)).toThrow(/BRIEF_THREAD/);
    expect(() => parseBriefOutput(out({ md: MD, thread: ['only one'] }), pub)).toThrow(/BRIEF_THREAD/);
    expect(() => parseBriefOutput(out({ md: MD, thread: [...THREAD, 'x'.repeat(281)] }), pub)).toThrow(/BRIEF_THREAD/);
  });

  // A public thread posts from @chainwardai with no human review. The buyer's
  // handle is the only account it may tag, and it must open the thread.
  it('accepts a thread that opens by tagging the buyer, in any letter case', () => {
    const thread = ['@Alice_B — your ChainWard Intel Brief on 0x1234…cdef:', 'Run your own: chainward.ai/request-brief'];
    expect(parseBriefOutput(out({ md: MD, thread }), { needThread: true, buyerHandle: 'alice_b' }).thread).toEqual(thread);
  });

  it('rejects a thread that does not open with the buyer tag', () => {
    const thread = ['Your ChainWard Intel Brief on 0x1234…cdef:', 'Run your own: chainward.ai/request-brief'];
    expect(() => parseBriefOutput(out({ md: MD, thread }), { needThread: true, buyerHandle: 'alice_b' })).toThrow(/buyer/);
    const longer = ['@alice_bob — your ChainWard Intel Brief on 0x1234…cdef:', 'Run your own: chainward.ai/request-brief'];
    expect(() => parseBriefOutput(out({ md: MD, thread: longer }), { needThread: true, buyerHandle: 'alice_b' })).toThrow(/buyer/);
  });

  it('rejects a thread that tags any other account', () => {
    const thread = ['@alice_b — your ChainWard Intel Brief on 0x1234…cdef:', 'Ask @someone_else. Run your own: chainward.ai/request-brief'];
    expect(() => parseBriefOutput(out({ md: MD, thread }), { needThread: true, buyerHandle: 'alice_b' })).toThrow(/BRIEF_THREAD/);
  });

  // X's parser (twitter-text) counts `＠` as an at-sign and allows `.` before a
  // mention, so `.@victim` and `＠victim` tag the account; links post as links
  // (review of fix/llm-run-hardening, Important 3). Only the opening buyer tag
  // may carry an @, in any form, and the only link is chainward.ai.
  const OPENING = '@alice_b — your ChainWard Intel Brief on 0x1234…cdef:';
  const CLOSING = 'Run your own: chainward.ai/request-brief';
  const FULLWIDTH_AT = String.fromCharCode(0xff20);
  const SMALL_AT = String.fromCharCode(0xfe6b);
  const fullwidth = (s: string) => [...s].map((c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)).join('');
  const pub = { needThread: true, buyerHandle: 'alice_b' } as const;

  it.each([
    ['.@ mid-tweet', [OPENING, `Shout out .@victim for the data. ${CLOSING}`]],
    ['.@ at the start of a tweet', [OPENING, `.@victim this one is for you. ${CLOSING}`]],
    ['fullwidth @', [OPENING, `${FULLWIDTH_AT}victim take a look. ${CLOSING}`]],
    ['small @', [OPENING, `${SMALL_AT}victim take a look. ${CLOSING}`]],
    ['@ after a letter', [OPENING, `ping x@victim now. ${CLOSING}`]],
    ['@ in brackets', [OPENING, `(@victim) ${CLOSING}`]],
    ['an email address', [OPENING, `Questions: hello@chainward.ai. ${CLOSING}`]],
    ['the buyer tagged twice', [OPENING, `Again @alice_b. ${CLOSING}`]],
    ['a second fullwidth buyer tag', [OPENING, `${FULLWIDTH_AT}alice_b again. ${CLOSING}`]],
  ])('rejects a thread with %s', (_label, thread) => {
    expect(() => parseBriefOutput(out({ md: MD, thread }), pub)).toThrow(/BRIEF_THREAD/);
  });

  it.each([
    ['an https link', [OPENING, `Details: https://evil.example/claim ${CLOSING}`]],
    ['a link to an IP', [OPENING, `Details: http://203.0.113.9/x ${CLOSING}`]],
    ['a bare domain', [OPENING, `Claim at evil.xyz/airdrop ${CLOSING}`]],
    ['a short-link domain', [OPENING, `More: t.co/abc123 ${CLOSING}`]],
    ['a www host', [OPENING, `More: www.evil.com ${CLOSING}`]],
    ['a chainward look-alike host', [OPENING, `More: chainward.ai.evil.com/x ${CLOSING}`]],
    ['a fullwidth domain', [OPENING, `More: ${fullwidth('evil.com')} ${CLOSING}`]],
    ['an ideographic full stop', [OPENING, `More: evil${String.fromCharCode(0x3002)}com ${CLOSING}`]],
    ['an agent name X would link', [OPENING, `Otto.AI holds the treasury. ${CLOSING}`]],
  ])('rejects a thread with %s', (_label, thread) => {
    expect(() => parseBriefOutput(out({ md: MD, thread }), pub)).toThrow(/BRIEF_THREAD/);
  });

  it('accepts chainward.ai links, numbers and short addresses', () => {
    const thread = [
      OPENING,
      'It holds $1.2M across 4.5k transfers (e.g. 0x1234…cdef), up 3.5% since Jan. 5.',
      'Decoded at https://chainward.ai/decodes/x. Run your own: chainward.ai/request-brief',
    ];
    expect(parseBriefOutput(out({ md: MD, thread }), pub).thread).toEqual(thread);
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
