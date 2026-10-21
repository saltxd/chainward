import { CHAINS, type RiskChainParam } from '@/lib/chains';

/**
 * The checker's words. On Base it takes a wallet or a token (a token gets the rug
 * check); on BNB Chain a wallet only. The rug check page asks for a Base token.
 */
export interface IntakeCopy {
  label: string;
  inputLabel: string;
  hint: string;
  error: string;
  button: string;
  footnote: string;
}

const PASTE = 'Paste the address itself: it starts with 0x, followed by 40 letters and numbers.';

export function intakeCopy(chain: RiskChainParam, variant: 'wallet' | 'token'): IntakeCopy {
  if (variant === 'token') {
    return {
      label: 'Subject: Base token address',
      inputLabel: 'Base token address',
      hint: "The token you're about to buy: its contract address, starting with 0x. Clanker, Virtuals or any Base token.",
      error: "That isn't a Base token address. Paste the token's contract address: it starts with 0x, followed by 40 letters and numbers.",
      button: 'Run the rug check →',
      footnote: 'Free for people · bots and apps pay $0.02 a check over x402.',
    };
  }
  const name = CHAINS[chain].name;
  const tokens = chain === 'base';
  return {
    label: `Subject: ${name} address`,
    inputLabel: tokens ? `${name} address` : `${name} wallet address`,
    hint: tokens
      ? "A wallet you're about to pay or hire, or a token you're about to buy. It starts with 0x."
      : "The wallet address you're about to pay or hire. It starts with 0x.",
    error: `That isn't a ${name}${tokens ? '' : ' wallet'} address. ${PASTE}`,
    button: 'Run the risk check →',
    footnote: 'Free · public · the first check files a public report with its verdict.',
  };
}
