import { http } from 'wagmi';
import { base, mainnet } from 'wagmi/chains';
import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import { metaMaskWallet, coinbaseWallet, walletConnectWallet } from '@rainbow-me/rainbowkit/wallets';

// RainbowKit requires a non-empty projectId. Use 'placeholder' during build
// when the env var isn't available — WalletConnect won't work without a real ID
// but MetaMask/Coinbase Wallet will work fine.
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'placeholder';

/** The wallets, chains and transports every wagmi config in the app shares. */
export const walletConnectors = connectorsForWallets(
  [
    {
      groupName: 'Popular',
      wallets: [metaMaskWallet, coinbaseWallet, walletConnectWallet],
    },
  ],
  { appName: 'ChainWard', projectId },
);

export const walletChains = [base, mainnet] as const;

export const walletTransports = {
  [base.id]: http(),
  [mainnet.id]: http(),
};
