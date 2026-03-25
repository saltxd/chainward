'use client';

import { useState } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useChainId, useSwitchChain } from 'wagmi';
import { parseUnits } from 'viem';
import { base } from 'wagmi/chains';
import { api } from '@/lib/api';

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
const TREASURY_ADDRESS = process.env.NEXT_PUBLIC_TREASURY_ADDRESS as `0x${string}`;

const erc20Abi = [{
  name: 'transfer',
  type: 'function',
  stateMutability: 'nonpayable',
  inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
  outputs: [{ name: '', type: 'bool' }],
}] as const;

type PlanId = 'operator' | 'community' | 'brief';
type Status = 'idle' | 'switching-chain' | 'confirming' | 'pending' | 'verifying' | 'success' | 'error';

const STATUS_LABELS: Record<Status, string> = {
  idle: 'Pay with USDC',
  'switching-chain': 'Switching to Base...',
  confirming: 'Confirm in wallet...',
  pending: 'Waiting for confirmation...',
  verifying: 'Verifying payment...',
  success: 'Payment confirmed!',
  error: 'Payment failed',
};

interface PayButtonProps {
  planId: PlanId;
  amountUsdc: number;
  onSuccess?: () => void;
}

export function PayButton({ planId, amountUsdc, onSuccess }: PayButtonProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();

  const { isLoading: isWaiting } = useWaitForTransactionReceipt({
    hash: txHash,
    query: {
      enabled: !!txHash,
    },
  });

  async function handlePay() {
    if (!isConnected) {
      setErrorMsg('Connect your wallet first');
      setStatus('error');
      return;
    }

    if (!TREASURY_ADDRESS) {
      setErrorMsg('Treasury address not configured');
      setStatus('error');
      return;
    }

    setErrorMsg(null);
    setStatus('idle');

    try {
      if (chainId !== base.id) {
        setStatus('switching-chain');
        await switchChainAsync({ chainId: base.id });
      }

      setStatus('confirming');
      const amount = parseUnits(amountUsdc.toString(), 6);

      const hash = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [TREASURY_ADDRESS, amount],
        chainId: base.id,
      });

      setTxHash(hash);
      setStatus('pending');

      // Poll for receipt — wagmi hook handles this but we need to await it
      const { createPublicClient, http } = await import('viem');
      const client = createPublicClient({ chain: base, transport: http() });
      await client.waitForTransactionReceipt({ hash, confirmations: 1 });

      setStatus('verifying');
      await api.verifyPayment({ txHash: hash, plan: planId });

      setStatus('success');
      onSuccess?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transaction failed';
      // User rejected in wallet
      if (msg.includes('User rejected') || msg.includes('user rejected')) {
        setErrorMsg('Transaction cancelled');
      } else {
        setErrorMsg(msg.length > 120 ? msg.slice(0, 120) + '...' : msg);
      }
      setStatus('error');
      setTxHash(undefined);
    }
  }

  const isProcessing = status !== 'idle' && status !== 'success' && status !== 'error';
  const isComplete = status === 'success';

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handlePay}
        disabled={isProcessing || isComplete || isWaiting}
        className={
          'flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold transition-all disabled:cursor-not-allowed ' +
          (isComplete
            ? 'bg-[#4ade80] text-[#050508]'
            : status === 'error'
              ? 'border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20'
              : 'bg-[#4ade80] text-[#050508] hover:bg-[#22c55e] hover:shadow-[0_0_20px_rgba(74,222,128,0.15)] disabled:opacity-60')
        }
      >
        {isProcessing && (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {isComplete && (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
        {STATUS_LABELS[status]}
        {status === 'idle' && ` — ${amountUsdc} USDC`}
      </button>
      {errorMsg && (
        <p className="text-center text-xs text-red-400">{errorMsg}</p>
      )}
      {txHash && status === 'success' && (
        <a
          href={`https://basescan.org/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-center text-xs text-[#4ade80] hover:underline"
        >
          View on BaseScan
        </a>
      )}
    </div>
  );
}
