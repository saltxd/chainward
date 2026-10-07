'use client';

/**
 * The wallet half of PayCheckButton, loaded on first click. Connect (RainbowKit),
 * confirm (price and terms), sign one EIP-3009 authorization, show the result.
 */
import '@rainbow-me/rainbowkit/styles.css';
import { useEffect, useRef } from 'react';
import { createConfig, WagmiProvider, useAccount, useSignTypedData, useSwitchChain } from 'wagmi';
import { base } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, darkTheme, lightTheme, useConnectModal } from '@rainbow-me/rainbowkit';
import { walletChains, walletConnectors, walletTransports } from '@/lib/walletConnectors';
import { checkKind, priceAtomic } from '@/lib/paidChecks';
import { payForCheck } from '@/lib/x402Pay';
import { outcomeEvent } from './payState';
import { CheckResult } from './CheckResult';
import type { PayFlowProps } from './PayCheckButton';

// Client-only (not ssr): wagmi reconnects a remembered wallet during the first
// render, so the flow never mistakes "still reconnecting" for "no wallet".
const payConfig = createConfig({ connectors: walletConnectors, chains: walletChains, transports: walletTransports });
const queryClient = new QueryClient();

const theme = {
  lightMode: lightTheme({ accentColor: '#7a2016', accentColorForeground: '#ece6da', borderRadius: 'none', fontStack: 'system' }),
  darkMode: darkTheme({ accentColor: '#d77a63', accentColorForeground: '#15130f', borderRadius: 'none', fontStack: 'system' }),
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function Flow({ state, dispatch, resource, label, price }: PayFlowProps) {
  const { address, status, chainId } = useAccount();
  const { openConnectModal, connectModalOpen } = useConnectModal();
  const { switchChainAsync } = useSwitchChain();
  const { signTypedDataAsync } = useSignTypedData();
  const settled = status === 'connected' || status === 'disconnected';

  useEffect(() => {
    if (state.step === 'loading' && settled) dispatch({ type: 'loaded', account: status === 'connected' ? (address ?? null) : null });
  }, [state.step, settled, status, address, dispatch]);

  // Follow the wallet (the reducer ignores this outside connect and confirm).
  useEffect(() => {
    if (!settled) return;
    dispatch(status === 'connected' && address ? { type: 'connected', account: address } : { type: 'disconnected' });
  }, [settled, status, address, state.step, dispatch]);

  // Entering the connect step opens the modal once; the step keeps a button to reopen it.
  const asked = useRef(false);
  useEffect(() => {
    if (state.step !== 'connect') {
      asked.current = false;
      return;
    }
    if (!asked.current && openConnectModal) {
      asked.current = true;
      openConnectModal();
    }
  }, [state.step, openConnectModal]);

  async function pay() {
    if (state.step !== 'ready' || !address || address !== state.account) return;
    dispatch({ type: 'pay' });
    try {
      const outcome = await payForCheck(resource, {
        maxAtomic: priceAtomic(price),
        signer: {
          address,
          signTypedData: async (typedData) => {
            if (chainId !== base.id) await switchChainAsync({ chainId: base.id });
            return signTypedDataAsync({ account: address, ...typedData });
          },
        },
      });
      dispatch(outcomeEvent(outcome));
    } catch (err) {
      // Thrown only before the signed request is sent (outcomes cover the rest).
      const message = err instanceof Error ? (err.message.split('\n')[0] ?? '').slice(0, 200) : 'Payment failed.';
      dispatch({ type: 'failed', message, charged: false });
    }
  }

  const close = (
    <button type="button" className="press-btn press-btn--ghost" onClick={() => dispatch({ type: 'close' })}>
      Close
    </button>
  );

  switch (state.step) {
    case 'idle':
      return null;
    case 'loading':
      return (
        <p className="pay-status" role="status">
          Loading wallet…
        </p>
      );
    case 'connect':
      return (
        <>
          <p className="pay-status">Connect a wallet to pay for the {label.toLowerCase()}.</p>
          <div className="pay-actions">
            <button type="button" className="press-btn" disabled={connectModalOpen || !openConnectModal} onClick={() => openConnectModal?.()}>
              Connect wallet
            </button>
            {close}
          </div>
        </>
      );
    case 'ready':
    case 'paying': {
      const paying = state.step === 'paying';
      return (
        <>
          <p className="pay-terms">
            <strong>{price}</strong> in USDC on Base, gas paid by the facilitator, not charged if the check fails.
          </p>
          <p className="pay-sub">
            Paying from <span className="mono">{short(state.account)}</span>. Your wallet asks you to sign one transfer
            authorization.
          </p>
          <div className="pay-actions">
            <button type="button" className="press-btn" disabled={paying} onClick={pay}>
              {paying ? 'Sign in your wallet…' : `Pay ${price} and run the check`}
            </button>
            {!paying && close}
          </div>
          {paying && (
            <p className="pay-status" role="status">
              After you sign, the check runs. It can take up to a minute.
            </p>
          )}
        </>
      );
    }
    case 'done':
      return (
        <>
          <p className="press-label">{label}</p>
          <CheckResult kind={checkKind(resource)} data={state.data} />
          <div className="pay-actions">
            {state.transaction && (
              <a
                className="press-link"
                href={`https://basescan.org/tx/${state.transaction}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Paid: {short(state.transaction)}
              </a>
            )}
            {close}
          </div>
        </>
      );
    case 'error':
      return (
        <>
          <p className="pay-error" role="alert">
            {state.message}
          </p>
          {state.charged === 'unknown' ? (
            <p className="pay-sub">If USDC left your wallet, write to hello@chainward.ai with the transaction.</p>
          ) : (
            !/charged/i.test(state.message) && <p className="pay-sub">Nothing was charged.</p>
          )}
          <div className="pay-actions">
            <button type="button" className="press-btn" onClick={() => dispatch({ type: 'retry' })}>
              Try again
            </button>
            {close}
          </div>
        </>
      );
  }
}

export default function PayFlow(props: PayFlowProps) {
  return (
    <WagmiProvider config={payConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={theme} initialChain={base} modalSize="compact">
          <Flow {...props} />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
