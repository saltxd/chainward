// scripts/auto-decode/lib/brief-run.ts
//
// Turns a queued paid-brief order into the prompt for its Claude run. Pure, so it
// is unit-tested; scripts/fulfill-briefs.ts owns the I/O.
//
// The order's target and contact come from a buyer. The API checks them when the
// order is created; this checks them again, because an order stored before that
// check existed (or edited in the database) must never reach the model. They go
// into the prompt only as JSON inside the untrusted block at the end, which the
// instructions (scripts/auto-decode-prompts/brief.md) call data, not instructions.
// The free-text notes are never passed at all.

import {
  isBriefContactMethod,
  parseBriefContact,
  parseBriefTarget,
  type BriefContactMethod,
  type BriefTargetKind,
} from '@chainward/common/brief-input';
import { clipOutsideDeep, clipText, type ChainFacts } from './chain-facts.js';
import { untrustedBlock } from './claude-run.js';

/** A queued order as GET /api/brief/ops/queue returns it: the fields the runner reads. */
export interface QueuedBriefOrder {
  id: string;
  target: string;
  targetKind: string;
  contact: string;
  contactMethod: string;
  notes?: string | null;
}

export interface BriefRunInput {
  orderId: string;
  target: string;
  targetKind: BriefTargetKind;
  /** The validated contact. A handle is given without its leading `@`. */
  contact: string;
  contactMethod: BriefContactMethod;
  /** `public` is an X thread from @chainwardai tagging the buyer; `private` is in-app only. */
  delivery: 'public' | 'private';
}

// The template used to be filled in with String.replace on these. Order text
// now goes only into the untrusted block, so a template that still has one is
// out of date with this runner.
const LEGACY_PLACEHOLDERS = ['<TARGET>', '<HANDLE>', '<DELIVERY>'];

export function parseQueuedOrder(order: QueuedBriefOrder): BriefRunInput {
  // The refused text is never echoed: it would land in logs and the ops channel.
  const refuse = (field: string): never => {
    throw new Error(`order ${String(order.id).slice(0, 8)} failed input validation: ${field}`);
  };

  const contactMethod = isBriefContactMethod(order.contactMethod) ? order.contactMethod : refuse('contactMethod');
  const target = typeof order.target === 'string' ? parseBriefTarget(order.target) : null;
  if (!target || target.kind !== order.targetKind) return refuse('target');
  const contact = typeof order.contact === 'string' ? parseBriefContact(order.contact, contactMethod) : null;
  if (!contact) return refuse('contact');

  return {
    orderId: order.id,
    target: target.value,
    targetKind: target.kind,
    contact: contact.replace(/^@/, ''),
    contactMethod,
    delivery: contactMethod === 'x' ? 'public' : 'private',
  };
}

/**
 * The pack as the model sees it: outsider text cut to 64 characters again (the
 * builder already did; a pack from anywhere else gets the same treatment). Only
 * `value`s and the target's name hold outsider text; the rest is ours.
 */
function capPack(pack: ChainFacts): ChainFacts {
  return {
    ...pack,
    target: { ...pack.target, ...(pack.target.name ? { name: clipText(pack.target.name) } : {}) },
    facts: pack.facts.map((f) => ({ ...f, value: clipOutsideDeep(f.value) })),
  };
}

/**
 * The brief instructions, unchanged, followed by the order data as an untrusted
 * block and, when a pack is given, the chain facts as a second one.
 */
export function buildBriefPrompt(template: string, input: BriefRunInput, pack?: ChainFacts): string {
  for (const placeholder of LEGACY_PLACEHOLDERS) {
    if (template.includes(placeholder)) {
      throw new Error(`brief template still has the ${placeholder} placeholder; order data goes only in the untrusted block`);
    }
  }
  const order = untrustedBlock('untrusted_order_data', {
    target: input.target,
    target_kind: input.targetKind,
    contact: input.contact,
    contact_method: input.contactMethod,
    delivery: input.delivery,
  });
  const blocks = pack ? `${order}\n\n${untrustedBlock('untrusted_chain_facts', capPack(pack) as unknown as Record<string, unknown>)}` : order;
  return `${template}${template.endsWith('\n') ? '' : '\n'}\n${blocks}\n`;
}
