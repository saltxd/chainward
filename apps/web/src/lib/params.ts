// Route params reach server-side fetches to the internal API. Route handlers get
// them URL-decoded, so an unchecked "..%2F" walks the upstream path. Validate
// before building any upstream URL.

export const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/** Same rule as the API's observatory slug check. */
export const AGENT_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,59}$/i;

export function isAddress(value: string): boolean {
  return ADDRESS_RE.test(value);
}

export function isAgentSlug(value: string): boolean {
  return AGENT_SLUG_RE.test(value);
}

/** Near-zero addresses (precompiles, 0x…0001 test checks): real reports, but noise on the front page. */
export function isPlaceholderAddress(value: string): boolean {
  return /^0x0{30,}[0-9a-f]{0,10}$/i.test(value);
}
