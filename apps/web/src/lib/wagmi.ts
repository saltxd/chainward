import { http, createConfig } from 'wagmi';
import { base, mainnet } from 'wagmi/chains';
import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  metaMaskWallet,
  coinbaseWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets';

// RainbowKit requires a non-empty projectId. Use 'placeholder' during build
// when the env var isn't available — WalletConnect won't work without a real ID
// but MetaMask/Coinbase Wallet will work fine.
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'placeholder';

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Popular',
      wallets: [metaMaskWallet, coinbaseWallet, walletConnectWallet],
    },
  ],
  { appName: 'ChainWard', projectId },
);

export const wagmiConfig = createConfig({
  connectors,
  chains: [base, mainnet],
  transports: {
    [base.id]: http(),
    [mainnet.id]: http(),
  },
  ssr: true,
});
