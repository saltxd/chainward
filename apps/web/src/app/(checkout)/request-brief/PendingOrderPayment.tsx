'use client';

import { api, type BriefOrder } from '@/lib/api';
import { paymentKey } from '@/lib/paymentStore';
import { PaymentStatus } from '@/components/payment/PaymentStatus';
import { ClaimByHash } from '@/components/payment/ClaimByHash';
import { usePaymentConfirmation } from '@/components/payment/usePaymentConfirmation';

/**
 * Under an unpaid order in "Your requests": resumes a payment this browser saw
 * the wallet send (after a refresh or a closed tab), or takes a pasted hash for
 * one it didn't. Confirming only re-verifies; it never sends money.
 */
export function PendingOrderPayment({
  orderId,
  amountUsdc,
  onPaid,
  onSignIn,
}: {
  orderId: string;
  amountUsdc: number;
  onPaid: (order: BriefOrder) => void;
  onSignIn: () => Promise<boolean>;
}) {
  const confirmation = usePaymentConfirmation({
    storageKey: paymentKey('brief', orderId),
    product: 'brief',
    confirm: async (txHash) => (await api.payBriefOrder(orderId, txHash)).order,
    onConfirmed: (order) => onPaid(order),
  });

  return (
    <div className="brf-order-pay">
      <PaymentStatus
        phase={confirmation.phase}
        txHash={confirmation.txHash}
        message={confirmation.message}
        onCheckAgain={confirmation.checkAgain}
        onStartOver={confirmation.startOver}
        onSignIn={async () => {
          if (await onSignIn()) confirmation.checkAgain();
        }}
      />
      {(confirmation.phase === 'idle' || confirmation.phase === 'failed') && (
        <ClaimByHash
          summary="Already paid for this order? Paste your transaction hash"
          hint={`It must send ${amountUsdc} USDC on Base to ChainWard from the wallet you're signed in with.`}
          onSubmit={confirmation.start}
        />
      )}
    </div>
  );
}
