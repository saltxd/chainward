import { CHAINS } from '@/lib/chains';
import type { ConfirmPhase } from '@/lib/paymentConfirm';

interface PaymentStatusProps {
  phase: ConfirmPhase;
  txHash: string | null;
  message: string | null;
  onCheckAgain: () => void;
  onStartOver: () => void;
  /** Brief orders only: sign in again after the session lapsed mid-wait. */
  onSignIn?: () => void;
}

/**
 * A payment the wallet has sent, while (or after) our API confirms it. Always
 * shows the transaction hash and a BaseScan link, so a buyer who paid never
 * ends up with nothing on screen. There is no pay button here: the only way
 * back to one is "Start over", offered only after a final answer.
 */
export function PaymentStatus({ phase, txHash, message, onCheckAgain, onStartOver, onSignIn }: PaymentStatusProps) {
  if (phase === 'idle' || phase === 'confirmed' || !txHash) return null;

  return (
    <div className="brf-paystate" role="status" aria-live="polite">
      {phase === 'waiting' && (
        <>
          <div className="brf-step">
            <span className="brf-spinner" aria-hidden="true" />
            Payment sent · waiting for Base
          </div>
          <p className="brf-paystate-copy">
            Your payment was sent. We&apos;re waiting for Base to confirm it; this can take a minute or two. You can
            leave this page and come back.
          </p>
        </>
      )}

      {phase === 'timeout' && (
        <>
          <div className="brf-step">Still waiting for Base</div>
          <p className="brf-paystate-copy">
            Base hasn&apos;t confirmed this payment after 10 minutes. Nothing is lost: the transaction is saved in this
            browser, and we check it again whenever you come back. Open it on BaseScan. If it says Success, press Check
            again. If it&apos;s stuck, email hello@chainward.ai with the transaction hash.
          </p>
        </>
      )}

      {phase === 'failed' && (
        <>
          <div className="brf-step">We couldn&apos;t use this transaction</div>
          {message && <div className="brf-error">{message}</div>}
        </>
      )}

      {phase === 'signin' && (
        <>
          <div className="brf-step">Sign in to finish</div>
          {message && <p className="brf-paystate-copy">{message}</p>}
        </>
      )}

      <div className="brf-paystate-tx">
        <span>Transaction</span>
        <code className="brf-hash">{txHash}</code>
        <a className="press-link" href={CHAINS.base.explorerTxUrl(txHash)} target="_blank" rel="noopener noreferrer">
          View on BaseScan →
        </a>
      </div>

      {phase === 'timeout' && (
        <button className="press-btn press-btn--full" type="button" onClick={onCheckAgain}>
          Check again
        </button>
      )}

      {phase === 'signin' && onSignIn && (
        <button className="press-btn press-btn--full" type="button" onClick={onSignIn}>
          Sign in again
        </button>
      )}

      {phase === 'failed' && (
        <>
          <button className="press-btn press-btn--ghost press-btn--full" type="button" onClick={onCheckAgain}>
            Check again
          </button>
          <button className="brf-link-btn" type="button" onClick={onStartOver}>
            Start over
          </button>
          <p className="brf-hint">Start over clears this transaction from this page. It does not move any money.</p>
        </>
      )}
    </div>
  );
}
