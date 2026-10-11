'use client';

import { useRef, useState } from 'react';
import { useWriteContract, useAccount, useChainId, useSwitchChain } from 'wagmi';
import { parseUnits } from 'viem';
import { base } from 'wagmi/chains';
import { walletErrorMessage } from '@/lib/paymentConfirm';

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;

const erc20Abi = [{
  name: 'transfer',
  type: 'function',
  stateMutability: 'nonpayable',
  inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
  outputs: [{ name: '', type: 'bool' }],
}] as const;

type Step = 'idle' | 'switching-chain' | 'confirming';

interface PayButtonProps {
  /** Amount in whole USDC (e.g. 10). */
  amountUsdc: number;
  /** Treasury address that receives the USDC, sourced at runtime (not NEXT_PUBLIC). */
  treasuryAddress: string | null | undefined;
  /**
   * The wallet returned a transaction hash: the money has been sent. Hand it to
   * usePaymentConfirmation().start, which saves it before confirming. The page
   * swaps this button out for the payment status from here on.
   */
  onSent: (txHash: string) => void;
  /** Disable the button (e.g. while the order form is incomplete). */
  disabled?: boolean;
}

/**
 * Sends one USDC transfer from the connected wallet. That transfer is the only
 * thing in the checkout that moves money; confirming it is the caller's job.
 */
export function PayButton({ amountUsdc, treasuryAddress, onSent, disabled }: PayButtonProps) {
  const [step, setStep] = useState<Step>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // A second click while the wallet prompt is open must not open a second transfer.
  const inFlight = useRef(false);

  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  async function handlePay() {
    if (inFlight.current) return;
    if (!isConnected) {
      setErrorMsg('Connect your wallet first.');
      return;
    }
    if (!treasuryAddress) {
      setErrorMsg('Payments are not set up yet. Please check back shortly.');
      return;
    }

    inFlight.current = true;
    setErrorMsg(null);
    try {
      if (chainId !== base.id) {
        setStep('switching-chain');
        await switchChainAsync({ chainId: base.id });
      }

      setStep('confirming');
      const hash = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [treasuryAddress as `0x${string}`, parseUnits(amountUsdc.toString(), 6)],
        chainId: base.id,
      });
      onSent(hash);
    } catch (err) {
      setErrorMsg(walletErrorMessage(err));
    } finally {
      inFlight.current = false;
      setStep('idle');
    }
  }

  const busy = step !== 'idle';
  const label =
    step === 'switching-chain' ? 'Switching to Base…' : step === 'confirming' ? 'Confirm in your wallet…' : `Pay ${amountUsdc} USDC`;

  return (
    <div className="brf-paybtn">
      <button className="press-btn press-btn--full" type="button" onClick={handlePay} disabled={disabled || busy} aria-busy={busy}>
        {busy && <span className="brf-spinner" aria-hidden="true" />}
        {label}
      </button>
      {errorMsg && <div className="brf-error">{errorMsg}</div>}
    </div>
  );
}
