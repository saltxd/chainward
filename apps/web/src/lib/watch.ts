/**
 * Free watching: the copy that offers it and the links into the register form.
 * The limit mirrors TIER_LIMITS.free.agentLimit in @chainward/common, which the
 * API enforces; a test keeps the two in step.
 */

export const FREE_WALLET_LIMIT = 3;

export const LOGIN_PITCH = `Sign in to watch up to ${FREE_WALLET_LIMIT} Base wallets: their transactions, balances, and alerts on Discord or a webhook. Free. No email, no password.`;

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** The dashboard register form, with the address filled in when given. */
export function watchWalletHref(address?: string): string {
  return address ? `/agents?register=true&address=${address.toLowerCase()}` : '/agents?register=true';
}

/**
 * What the agents page opens with. Lowercase passes the API's address check
 * whatever case was in the link; an invalid address is ignored.
 */
export function registerPrefill(params: { get(name: string): string | null }): {
  open: boolean;
  address: string;
} {
  if (params.get('register') !== 'true') return { open: false, address: '' };
  const address = params.get('address') ?? '';
  return { open: true, address: EVM_ADDRESS_RE.test(address) ? address.toLowerCase() : '' };
}
