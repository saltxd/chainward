// scripts/auto-decode/lib/validators.ts

import type { Target } from '@chainward/decode';

export type { Target };

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const HANDLE_RE = /^@[A-Za-z0-9_-]+$/;

// An ACP agent's name is set by whoever registers the agent. The pipeline uses
// it only if it is a plain label: letters, digits, space, `.`, `_`, `-`, at most
// 40 characters (security audit 2026-11-05, B-U07-1). That rules out newlines,
// quotes, backticks, `$(`, `<@id>` mentions and look-alike characters.
const REGISTRY_NAME_RE = /^[A-Za-z0-9 ._-]{1,40}$/;
// A tripwire for plain-word instructions that still fit the pattern above. It
// is not the boundary: the name reaches the model only as untrusted data, and
// the run has no tool that could do harm with it.
const PROMPT_LIKE_RE =
  /\b(?:ignore|disregard|forget|override|bypass|jailbreak|instructions?|prompt)\b|\byou\s+(?:are|must|should|will)\b/i;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*-on-chain$/;
const MAX_SLUG_LENGTH = 80;

export function isAddress(input: string): boolean {
  return ADDRESS_RE.test(input);
}

export function isAgentHandle(input: string): boolean {
  return HANDLE_RE.test(input);
}

export function parseTarget(input: string): Target {
  if (isAddress(input)) return { kind: "address", value: input };
  if (isAgentHandle(input)) return { kind: "handle", value: input.slice(1) };
  throw new Error(`invalid target: ${input} (expected 0x... or @handle)`);
}

/** The registry name, trimmed, if it is a plain label; throws otherwise. */
export function parseRegistryName(raw: string): string {
  const name = raw.trim();
  const words = name.replace(/[._-]+/g, " ");
  if (!REGISTRY_NAME_RE.test(name) || !/[A-Za-z0-9]/.test(name) || PROMPT_LIKE_RE.test(words)) {
    throw new Error(
      `registry name refused (letters, digits, space, . _ - only; 1-40 characters; no instruction-like words): ` +
        JSON.stringify(raw.slice(0, 60)),
    );
  }
  return name;
}

/** The name to slug/title a decode by. Prefers the resolver's agent name; when that's
 * null (address not in the ACP registry) falls back to a SHORT address-derived label
 * (`agent-<first 8 hex>`) so the slug is never the raw 40-char address. */
export function displayName(name: string | null | undefined, address: string): string {
  if (name) return name;
  return `agent-${address.slice(2, 10).toLowerCase()}`;
}

export function slugify(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  return `${cleaned}-on-chain`;
}

/** A slug is lowercase words joined by `-`, ending in `-on-chain`; throws otherwise. */
export function assertSlug(slug: string): string {
  if (slug.length > MAX_SLUG_LENGTH || !SLUG_RE.test(slug)) {
    throw new Error(`invalid slug: ${JSON.stringify(slug.slice(0, 100))}`);
  }
  return slug;
}

export interface DecodeRunInputs {
  /** The agent's wallet, as the registry gives it (checked to be an address). */
  address: string;
  /** Display name: the checked registry name, or `agent-<8 hex>` when it has none. */
  name: string;
  slug: string;
}

/** Checks what the registry returned before any of it is used. Throws to refuse the run. */
export function decodeRunInputs(resolved: { address: string; name: string | null }): DecodeRunInputs {
  if (!isAddress(resolved.address)) {
    throw new Error(`registry returned an invalid wallet address: ${JSON.stringify(resolved.address.slice(0, 60))}`);
  }
  const raw = resolved.name?.trim();
  const name = raw ? parseRegistryName(raw) : displayName(null, resolved.address);
  return { address: resolved.address, name, slug: assertSlug(slugify(name)) };
}
