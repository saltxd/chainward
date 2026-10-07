import { createConfig } from 'wagmi';
import { walletChains, walletConnectors, walletTransports } from './walletConnectors';

export const wagmiConfig = createConfig({
  connectors: walletConnectors,
  chains: walletChains,
  transports: walletTransports,
  ssr: true,
});
