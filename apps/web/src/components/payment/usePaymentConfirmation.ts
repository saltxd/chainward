'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { classifyClaimError, confirmWithRetry, type ConfirmPhase, type PaymentProduct } from '@/lib/paymentConfirm';
import { browserStorage, clearPendingPayment, readPendingPayment, savePendingPayment } from '@/lib/paymentStore';

interface ConfirmState {
  phase: ConfirmPhase;
  txHash: string | null;
  message: string | null;
}

const IDLE: ConfirmState = { phase: 'idle', txHash: null, message: null };

export interface PaymentConfirmation extends ConfirmState {
  /** A hash from the wallet or the paste box: saved first, then confirmed in the background. */
  start: (txHash: string) => void;
  /** Re-verify the current hash (after the window ran out, or a sign-in). */
  checkAgain: () => void;
  /** Forget a hash the API gave a final no to. Does nothing while a payment is still pending. */
  startOver: () => void;
}

/**
 * One product's payment, from the moment the wallet hands back a hash until our
 * API confirms it. The hash is written to localStorage before anything else and
 * removed only on success, so a refresh or a closed tab resumes on the next
 * visit. Retries only re-verify; nothing here can send money.
 */
export function usePaymentConfirmation<T>(opts: {
  /** From paymentKey(); null while there is nothing to pay for yet. */
  storageKey: string | null;
  product: PaymentProduct;
  confirm: (txHash: string) => Promise<T>;
  onConfirmed?: (value: T, txHash: string) => void;
}): PaymentConfirmation {
  const { storageKey, product } = opts;
  const [state, setState] = useState<ConfirmState>(IDLE);

  // Latest callbacks without restarting a running confirmation on every render.
  const confirmRef = useRef(opts.confirm);
  const onConfirmedRef = useRef(opts.onConfirmed);
  useEffect(() => {
    confirmRef.current = opts.confirm;
    onConfirmedRef.current = opts.onConfirmed;
  });

  const runRef = useRef<AbortController | null>(null);
  // Hashes the API has accepted. A yes is final: a later no for the same hash
  // (a second tab, a StrictMode double run) must not overwrite it.
  const confirmedRef = useRef<Set<string>>(new Set());

  const run = useCallback(
    (txHash: string) => {
      runRef.current?.abort();
      const ctrl = new AbortController();
      runRef.current = ctrl;
      setState({ phase: 'waiting', txHash, message: null });

      void confirmWithRetry({
        confirm: () => confirmRef.current(txHash),
        classify: (err) => classifyClaimError(err, product),
        signal: ctrl.signal,
      }).then((result) => {
        const storage = browserStorage();
        if (result.status === 'confirmed') {
          // Applied even when this run was cancelled (unmount, StrictMode): the
          // API has recorded the claim, so dropping its answer would lose it.
          if (confirmedRef.current.has(txHash)) return;
          confirmedRef.current.add(txHash);
          if (runRef.current && runRef.current !== ctrl) runRef.current.abort();
          if (storageKey) clearPendingPayment(storage, storageKey);
          setState({ phase: 'confirmed', txHash, message: null });
          onConfirmedRef.current?.(result.value, txHash);
          return;
        }
        if (ctrl.signal.aborted || confirmedRef.current.has(txHash)) return;
        switch (result.status) {
          case 'failed': {
            if (storageKey) {
              const sentAt = readPendingPayment(storage, storageKey)?.sentAt ?? Date.now();
              savePendingPayment(storage, storageKey, { txHash, sentAt, failed: result.message });
            }
            setState({ phase: 'failed', txHash, message: result.message });
            return;
          }
          case 'signin':
            // The hash stays stored as pending: signing in again resumes it.
            setState({ phase: 'signin', txHash, message: result.message });
            return;
          case 'timeout':
            setState({ phase: 'timeout', txHash, message: null });
            return;
          case 'aborted':
            return;
        }
      });
    },
    [storageKey, product],
  );

  // On load (and when the product changes): resume a stored payment.
  useEffect(() => {
    const saved = storageKey ? readPendingPayment(browserStorage(), storageKey) : null;
    if (!saved) setState(IDLE);
    else if (saved.failed) setState({ phase: 'failed', txHash: saved.txHash, message: saved.failed });
    else run(saved.txHash);
    return () => {
      runRef.current?.abort();
      runRef.current = null;
    };
  }, [storageKey, run]);

  const start = useCallback(
    (txHash: string) => {
      if (storageKey) savePendingPayment(browserStorage(), storageKey, { txHash, sentAt: Date.now() });
      run(txHash);
    },
    [storageKey, run],
  );

  const { phase, txHash } = state;

  const checkAgain = useCallback(() => {
    if (!txHash) return;
    if (storageKey) {
      const storage = browserStorage();
      const sentAt = readPendingPayment(storage, storageKey)?.sentAt ?? Date.now();
      savePendingPayment(storage, storageKey, { txHash, sentAt });
    }
    run(txHash);
  }, [txHash, storageKey, run]);

  const startOver = useCallback(() => {
    if (phase !== 'failed') return;
    runRef.current?.abort();
    if (storageKey) clearPendingPayment(browserStorage(), storageKey);
    setState(IDLE);
  }, [phase, storageKey]);

  return { ...state, start, checkAgain, startOver };
}
