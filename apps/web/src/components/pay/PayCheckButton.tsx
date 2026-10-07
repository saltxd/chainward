'use client';

/**
 * "Pay with wallet" for a paid check (USDC on Base over x402). What ships with
 * the page is this button and a reducer; the wallet stack (wagmi, RainbowKit,
 * viem) and the payment client load only after the first click.
 */
import dynamic from 'next/dynamic';
import { useReducer, type Dispatch, type ReactNode } from 'react';
import { INITIAL, payReducer, type PayEvent, type PayState } from './payState';

export interface PayCheckProps {
  /** The paid URL on api.chainward.ai (lib/paidChecks builds them). */
  resource: string;
  /** What is being bought, e.g. "Seller check for 0x6839…1a2b". */
  label: string;
  /** As shown to the reader, e.g. "$0.10". The client never signs for more. */
  price: string;
}

export interface PayFlowProps extends PayCheckProps {
  state: PayState;
  dispatch: Dispatch<PayEvent>;
}

const PayFlow = dynamic<PayFlowProps>(() => import('./PayFlow'), {
  ssr: false,
  loading: () => (
    <p className="pay-status" role="status">
      Loading wallet…
    </p>
  ),
});

function Panel({ label, ...props }: PayFlowProps & { label: string }) {
  return (
    <div className="pay-panel" role="region" aria-label={label} aria-live="polite">
      <PayFlow label={label} {...props} />
    </div>
  );
}

/** One button; the panel expands below it. */
export function PayCheckButton(props: PayCheckProps) {
  const [state, dispatch] = useReducer(payReducer, INITIAL);
  const open = state.step !== 'idle';
  return (
    <div className="pay">
      {!open && (
        <button
          type="button"
          className="press-btn press-btn--ghost pay-open"
          aria-expanded="false"
          data-resource={props.resource}
          onClick={() => dispatch({ type: 'open' })}
        >
          Run the {props.price} check with your wallet
        </button>
      )}
      {open && <Panel {...props} state={state} dispatch={dispatch} />}
    </div>
  );
}

/** A table row with a compact button cell; the panel opens in a full-width row below. */
export function PayCheckRow({ colSpan, children, ...props }: PayCheckProps & { colSpan: number; children: ReactNode }) {
  const [state, dispatch] = useReducer(payReducer, INITIAL);
  const open = state.step !== 'idle';
  return (
    <>
      <tr>
        {children}
        <td className="pay-cell">
          <button
            type="button"
            className="pay-open pay-open--compact"
            aria-expanded={open}
            aria-label={`${props.label}: run the ${props.price} check with your wallet`}
            data-resource={props.resource}
            disabled={open}
            onClick={() => dispatch({ type: 'open' })}
          >
            {props.price} check
          </button>
        </td>
      </tr>
      {open && (
        <tr className="pay-row">
          <td colSpan={colSpan}>
            <Panel {...props} state={state} dispatch={dispatch} />
          </td>
        </tr>
      )}
    </>
  );
}
