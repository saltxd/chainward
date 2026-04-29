// scripts/auto-decode/lib/validators.ts

export type Target =
  | { kind: "address"; value: string }
  | { kind: "handle"; value: string };

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const HANDLE_RE = /^@[A-Za-z0-9_-]+$/;

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

export function slugify(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  return `${cleaned}-on-chain`;
}
