// Paid Intel Brief order fields that reach a Claude run.
//
// The buyer's target and contact are handed to the model that writes the brief
// (scripts/fulfill-briefs.ts), so they are held to strict shapes instead of free
// text: an EVM address or an agent handle, and an email address or a handle in
// the shape the chosen platform allows. Nothing that passes can carry spaces,
// newlines, quotes, backticks, `$(`, angle brackets or non-ASCII look-alikes.
//
// The API checks them when an order is created and the fulfillment runner checks
// them again before every run, so an order stored before this check existed (or
// edited in the database) never reaches the model unchecked.

export const BRIEF_CONTACT_METHODS = ['email', 'telegram', 'x', 'discord', 'other'] as const;
export type BriefContactMethod = (typeof BRIEF_CONTACT_METHODS)[number];

export type BriefTargetKind = 'address' | 'handle';

export interface BriefTarget {
  kind: BriefTargetKind;
  /** Lowercase address, or the handle without its leading `@`. */
  value: string;
}

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
/** An agent handle as the auto-decode resolver takes it: letters, digits, `_` and `-`. */
const AGENT_HANDLE_RE = /^@?([A-Za-z0-9_-]{1,40})$/;
const EMAIL_RE = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63})*\.[A-Za-z]{2,24}$/;
const MAX_EMAIL_LENGTH = 254;

const CONTACT_HANDLE_RE: Record<Exclude<BriefContactMethod, 'email'>, RegExp> = {
  telegram: /^@?[A-Za-z0-9_]{5,32}$/,
  x: /^@?[A-Za-z0-9_]{1,15}$/,
  discord: /^@?[A-Za-z0-9_.]{2,32}$/,
  other: /^@?[A-Za-z0-9_.-]{2,40}$/,
};

export function isBriefContactMethod(value: unknown): value is BriefContactMethod {
  return typeof value === 'string' && (BRIEF_CONTACT_METHODS as readonly string[]).includes(value);
}

/** The thing to investigate: a Base address or an agent handle. Null for anything else. */
export function parseBriefTarget(raw: string): BriefTarget | null {
  const s = raw.trim();
  if (EVM_ADDRESS_RE.test(s)) return { kind: 'address', value: s.toLowerCase() };
  // A mistyped address must not slip through as a handle the model goes looking for.
  if (/^0x/i.test(s)) return null;
  const handle = AGENT_HANDLE_RE.exec(s)?.[1];
  return handle ? { kind: 'handle', value: handle } : null;
}

function isEmail(s: string): boolean {
  return s.length <= MAX_EMAIL_LENGTH && EMAIL_RE.test(s);
}

/** Where the brief goes, in the shape `method` allows (trimmed). Null for anything else. */
export function parseBriefContact(raw: string, method: BriefContactMethod): string | null {
  const s = raw.trim();
  if (method === 'email') return isEmail(s) ? s : null;
  if (method === 'other' && isEmail(s)) return s;
  return CONTACT_HANDLE_RE[method].test(s) ? s : null;
}
