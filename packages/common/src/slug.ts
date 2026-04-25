/**
 * Generate a URL-safe slug for an agent.
 * Used for chainward.ai/base/<slug> routes.
 *
 * Rules:
 *  - lowercase
 *  - strip diacritics (NFKD normalize)
 *  - keep only [a-z0-9], collapse other chars to a single dash
 *  - trim leading/trailing dashes, collapse runs
 *  - fall back to `agent-<first-8-of-wallet>` when name yields empty slug
 *  - cap at 60 chars
 */
export function agentSlug(name: string | null | undefined, walletAddress: string): string {
  const fromName = (name ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  if (fromName.length > 0) return fromName;

  const cleaned = walletAddress.replace(/^0x/i, '').toLowerCase().slice(0, 8);
  return `agent-${cleaned}`;
}
