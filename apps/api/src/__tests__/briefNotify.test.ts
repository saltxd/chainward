import { describe, expect, it } from 'vitest';
import { inlineCode, paidOrderPayload, privateDeliveredPayload } from '../lib/briefNotify.js';

// The brief order pings post buyer-typed contact, notes and handle to the ops
// Discord. Mentions are off, and every buyer-typed value sits in one inline-code
// span it can't close, so nothing a buyer types pings the channel or renders.
const order = {
  id: '00000000-0000-0000-0000-0000000000aa',
  amountUsdc: 5_000_000,
  targetKind: 'handle',
  target: '@everyone `bold`',
  contact: '<@123456789> hi `x`',
  contactMethod: 'discord',
  walletAddress: '0x1111111111111111111111111111111111111111',
  notes: 'line one\n@here **line two**',
  txHash: `0x${'ab'.repeat(32)}`,
};

/** The content with every inline-code span removed: what Discord renders as markdown. */
const outsideCode = (content: string) => content.replace(/`[^`\n]*`/g, '');

describe('inlineCode', () => {
  it('keeps a value inside one code span: no backticks or line breaks of its own', () => {
    const s = inlineCode('a`b\nc');
    expect(s.startsWith('`') && s.endsWith('`')).toBe(true);
    expect(s.slice(1, -1)).not.toMatch(/[`\r\n]/);
  });

  it('cuts long values', () => {
    expect(inlineCode('x'.repeat(5000)).length).toBeLessThan(1000);
  });
});

describe('brief Discord payloads', () => {
  it('posts a paid order with mentions off and buyer text in code spans', () => {
    const p = paidOrderPayload(order);
    expect(p.allowed_mentions).toEqual({ parse: [] });
    expect(p.content).toContain(order.id);
    const rendered = outsideCode(p.content);
    expect(rendered).not.toMatch(/@everyone|@here|<@123456789>|\*\*line two\*\*/);
    expect(p.content.length).toBeLessThanOrEqual(2000);
  });

  it('posts a private delivery with mentions off and buyer text in code spans', () => {
    const p = privateDeliveredPayload(order);
    expect(p.allowed_mentions).toEqual({ parse: [] });
    expect(outsideCode(p.content)).not.toMatch(/@everyone|<@123456789>/);
  });

  it('stays under the Discord limit with the longest notes a buyer can send', () => {
    const p = paidOrderPayload({ ...order, notes: 'n'.repeat(2000), contact: 'c'.repeat(200), target: 't'.repeat(200) });
    expect(p.content.length).toBeLessThanOrEqual(2000);
  });
});
