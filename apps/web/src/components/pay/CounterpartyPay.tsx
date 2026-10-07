'use client';

import { useId, useState } from 'react';
import { isAddress } from '@/lib/params';
import { counterpartyCheckUrl, PAID_CHECK_PRICE } from '@/lib/paidChecks';
import { PayCheckButton } from './PayCheckButton';

const price = PAID_CHECK_PRICE.counterparty;

/** The counterparty check for any address the reader types (docs page). */
export function CounterpartyPay({ defaultAddress = '' }: { defaultAddress?: string }) {
  const id = useId();
  const [address, setAddress] = useState(defaultAddress);
  const [chain, setChain] = useState<'base' | 'bsc'>('base');
  // The address is fixed while a payment flow is open, so the panel and the payment agree.
  const [locked, setLocked] = useState(false);
  const trimmed = address.trim();
  const valid = isAddress(trimmed);

  return (
    <div className="pay-form">
      <div className="pay-fields">
        <label className="press-label" htmlFor={`${id}-address`}>
          Address
        </label>
        <input
          id={`${id}-address`}
          className="pay-input mono"
          placeholder="0x…"
          spellCheck={false}
          autoComplete="off"
          value={address}
          readOnly={locked}
          onChange={(e) => setAddress(e.target.value)}
        />
        <select
          className="pay-input pay-select"
          aria-label="Chain"
          value={chain}
          disabled={locked}
          onChange={(e) => setChain(e.target.value === 'bsc' ? 'bsc' : 'base')}
        >
          <option value="base">Base</option>
          <option value="bsc">BNB Chain</option>
        </select>
      </div>
      {valid ? (
        <PayCheckButton
          resource={counterpartyCheckUrl(trimmed, chain)}
          label={`Counterparty check for ${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`}
          price={price}
          onOpenChange={setLocked}
        />
      ) : (
        <div className="pay">
          <button type="button" className="press-btn press-btn--ghost pay-open" disabled>
            Run the {price} check with your wallet
          </button>
        </div>
      )}
    </div>
  );
}
