// Discord webhook bodies for the Intel Brief order pings (routes/brief.ts). Pure so
// they can be tested. Contact, notes and a handle target are typed by the buyer:
// mentions are off, and each of those sits in one inline-code span it can't close.

export interface DiscordPayload {
  content: string;
  allowed_mentions: { parse: never[] };
}

export interface BriefOrderForNotify {
  id: string;
  amountUsdc: number;
  targetKind: string;
  target: string;
  contact: string;
  contactMethod: string;
  walletAddress: string;
  notes: string | null;
  txHash: string | null;
}

/** A buyer-typed value as one Discord inline-code span: no backtick or line break can end it early. */
export function inlineCode(value: string, max = 300): string {
  const flat = value.replace(/`/g, "'").replace(/[\r\n]+/g, ' ').trim();
  const cut = flat.length > max ? `${flat.slice(0, max)}…` : flat;
  return `\`${cut || ' '}\``;
}

function payload(lines: Array<string | null>): DiscordPayload {
  return { content: lines.filter(Boolean).join('\n'), allowed_mentions: { parse: [] } };
}

export function paidOrderPayload(order: BriefOrderForNotify): DiscordPayload {
  const usdc = (Number(order.amountUsdc) / 1e6).toFixed(2);
  const targetLine =
    order.targetKind === 'address'
      ? `${inlineCode(order.target)} ([basescan](https://basescan.org/address/${encodeURIComponent(order.target)}))`
      : `${inlineCode(order.target)} (handle)`;
  return payload([
    `💸 **New paid Intel Brief — ${usdc} USDC**`,
    `**Target:** ${targetLine}`,
    `**Deliver to:** ${inlineCode(order.contact)} _(${order.contactMethod})_`,
    `**Buyer:** ${inlineCode(order.walletAddress)}`,
    order.notes ? `**Notes:** ${inlineCode(order.notes, 1000)}` : null,
    `**Order:** ${inlineCode(order.id)}`,
    order.txHash ? `**Tx:** https://basescan.org/tx/${encodeURIComponent(order.txHash)}` : null,
  ]);
}

export function privateDeliveredPayload(order: Pick<BriefOrderForNotify, 'id' | 'contact' | 'contactMethod' | 'target'>): DiscordPayload {
  return payload([
    `📬 **Private brief delivered in-app** — order ${inlineCode(order.id.slice(0, 8))}`,
    `**Ping:** ${inlineCode(order.contact)} _(${order.contactMethod})_ → "Your ChainWard brief is ready: sign in at chainward.ai/request-brief with the wallet you paid from."`,
    `**Target:** ${inlineCode(order.target)}`,
  ]);
}
