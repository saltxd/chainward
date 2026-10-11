'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useAccount, useSignMessage } from 'wagmi';
import { siweSignIn, useSession } from '@/lib/auth-client';
import { api, ApiError, type BriefConfig, type BriefOrder } from '@/lib/api';
import ReactMarkdown from 'react-markdown';
import { contactMethodFor, orderDeliveryState, type BriefDelivery } from '@/lib/brief';
import { track } from '@/lib/track';
import { Masthead, PressDateline, Colophon, NodeClaim } from '@/components/press';
import { PayButton } from '@/components/payment/pay-button';
import { PaymentStatus } from '@/components/payment/PaymentStatus';
import { ClaimByHash } from '@/components/payment/ClaimByHash';
import { usePaymentConfirmation } from '@/components/payment/usePaymentConfirmation';
import { browserStorage, clearPendingPayment, listPendingPayments, paymentKey, type PendingPayment } from '@/lib/paymentStore';
import { CHAINS } from '@/lib/chains';
import { useToast } from '@/components/ui/toast';
import { PendingOrderPayment } from './PendingOrderPayment';

// A real Intel Brief delivered as a public @chainwardai thread (2026-06-16).
const SAMPLE_BRIEF_URL = 'https://x.com/chainwardai/status/2066738827100622921';

const WHAT_YOU_GET: ReactNode[] = [
  <>
    The full investigation of one wallet, read from{' '}
    <NodeClaim live="our own Base node" neutral="the chain" />
  </>,
  'Where the money goes: who funds the wallet and who it pays',
  'Each public claim checked against what the chain shows',
  'Every finding linked to the transactions behind it',
  'Delivered privately within 48 hours, or as a public @chainwardai thread if you prefer',
];

function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function shortHash(h: string): string {
  return `${h.slice(0, 10)}…${h.slice(-6)}`;
}

export default function RequestBriefPage() {
  const { address, chainId, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { openConnectModal } = useConnectModal();
  const { data: session, refetch: refetchSession } = useSession();
  const { toast } = useToast();

  const [config, setConfig] = useState<BriefConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState('');

  const [form, setForm] = useState<{
    target: string;
    contact: string;
    delivery: BriefDelivery;
    notes: string;
  }>({ target: '', contact: '', delivery: 'private', notes: '' });

  const [order, setOrder] = useState<BriefOrder | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [paid, setPaid] = useState(false);

  const [myOrders, setMyOrders] = useState<BriefOrder[]>([]);
  // Payments this browser saw a wallet send for brief orders, not yet confirmed.
  const [storedPayments, setStoredPayments] = useState<Array<{ id: string; payment: PendingPayment }>>([]);

  const user = session?.user ?? null;
  // Price is ALWAYS runtime config, never hardcoded. Null until loaded.
  const priceUsdc = config?.priceUsdc ?? null;
  const priceLabel = priceUsdc != null ? `${priceUsdc} USDC` : 'Priced in USDC on Base';

  // Load treasury + price config at runtime (not from a baked NEXT_PUBLIC var).
  useEffect(() => {
    api
      .getBriefConfig()
      .then(setConfig)
      .catch((err) => setConfigError(err instanceof Error ? err.message : 'Could not load pricing'));
  }, []);

  useEffect(() => {
    setStoredPayments(listPendingPayments(browserStorage(), 'brief'));
  }, []);

  const loadMyOrders = useCallback(() => {
    if (!user) return;
    api
      .getMyBriefOrders()
      .then((res) => {
        setMyOrders(res.orders);
        // A stored payment for an order that is already paid has nothing left to confirm.
        const storage = browserStorage();
        for (const { id } of listPendingPayments(storage, 'brief')) {
          const o = res.orders.find((x) => x.id === id);
          if (o && o.status !== 'pending') clearPendingPayment(storage, paymentKey('brief', id));
        }
        setStoredPayments(listPendingPayments(storage, 'brief'));
      })
      .catch(() => {/* non-fatal */});
  }, [user]);

  useEffect(() => {
    loadMyOrders();
  }, [loadMyOrders]);

  async function handleSignIn(): Promise<boolean> {
    if (!address || !chainId) return false;
    setSignError('');
    setSigning(true);
    try {
      await siweSignIn(address, chainId, signMessageAsync);
      await refetchSession();
      track('brief_signin_ok');
      return true;
    } catch (err) {
      setSignError(err instanceof Error ? err.message : 'Sign in failed');
      return false;
    } finally {
      setSigning(false);
    }
  }

  // The form comes first; wallet connect + sign-in happen on submit, so a buyer
  // sees exactly what they're ordering before we ask for a wallet.
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.target.trim() || !form.contact.trim()) return;
    if (!isConnected) {
      track('brief_connect_click');
      openConnectModal?.();
      return;
    }
    if (!user && !(await handleSignIn())) return;
    await handleCreateOrder();
  }

  /** Sign in again mid-payment (session lapsed, or came back later). */
  async function signInToFinish(): Promise<boolean> {
    if (!isConnected) {
      openConnectModal?.();
      return false;
    }
    return handleSignIn();
  }

  function handleOrderPaid(updated: BriefOrder) {
    setOrder(updated);
    setPaid(true);
    track('brief_paid', {
      price: updated.amountUsdc / 1e6,
      delivery: updated.contactMethod === 'x' ? 'public' : 'private',
    });
    toast('Payment confirmed. Your brief is queued.', 'success');
    loadMyOrders();
  }

  // The order on screen: its payment is saved per order and confirmed in the
  // background until the API accepts it, surviving a refresh (the order then
  // resumes under "Your requests").
  const activeOrderId = order?.id ?? null;
  const confirmation = usePaymentConfirmation({
    storageKey: activeOrderId ? paymentKey('brief', activeOrderId) : null,
    product: 'brief',
    confirm: async (txHash) => {
      if (!activeOrderId) throw new ApiError('Order not found', 'ORDER_NOT_FOUND');
      return (await api.payBriefOrder(activeOrderId, txHash)).order;
    },
    onConfirmed: handleOrderPaid,
  });

  async function handleCreateOrder() {
    setCreateError('');
    setCreating(true);
    try {
      const contact = form.contact.trim();
      const res = await api.createBriefOrder({
        target: form.target.trim(),
        contact,
        contactMethod: contactMethodFor(form.delivery, contact),
        notes: form.notes.trim() || undefined,
      });
      setOrder(res.order);
      track('brief_order_created', { delivery: form.delivery, price: priceUsdc ?? 0 });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Could not create order';
      setCreateError(msg);
    } finally {
      setCreating(false);
    }
  }

  const paymentsUnavailable = config !== null && !config.available;
  const waitingPayments = storedPayments.filter(({ payment }) => !payment.failed);

  return (
    <>
      <PressDateline />
      <div className="press-wrap">
        <Masthead />

        <section className="brf-lead">
          <span className="press-label">Intel Brief · one wallet, fully decoded</span>
          <h1 className="brf-title press-display">Have one wallet fully investigated.</h1>
          <p className="brf-lede">
            Send us any Base agent or wallet. We trace where its money comes from
            and where it goes, check its public claims against the chain, and write
            it up in plain language. You get the brief privately within 48 hours,
            or as a public thread if you prefer.
          </p>
        </section>

        <div className="brf-grid">
          {/* The offer, as a case-file artifact */}
          <aside className="brf-offer">
            <div className="brf-offer-head">
              <span className="press-label">The brief</span>
              <span className="brf-offer-price mono">{priceLabel}</span>
            </div>
            <p className="brf-offer-terms mono">One-time payment · USDC on Base · delivered within 48 hours</p>
            <ul className="brf-offer-list">
              {WHAT_YOU_GET.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
            <p className="brf-offer-fine">
              Same method as our public{' '}
              <Link href="/decodes" className="press-link">decodes</Link>. Your
              request stays private.
            </p>
            <a
              href={SAMPLE_BRIEF_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="press-link brf-offer-sample"
            >
              See a delivered brief →
            </a>
          </aside>

          {/* The action */}
          <div className="brf-action">
            {configError && <div className="brf-error">Error: {configError}</div>}
            {paymentsUnavailable && (
              <div className="brf-notice">
                Ordering is paused right now. Please check back shortly, or email
                hello@chainward.ai.
              </div>
            )}

            {/* 1: request form (wallet + sign-in happen on submit) */}
            {!order && (
              <form className="brf-form" onSubmit={handleSubmit}>
                <div className="brf-step">Step 1: which wallet should we look into?</div>
                <label>
                  <span>Its address or handle</span>
                  <input
                    value={form.target}
                    onChange={(e) => setForm({ ...form, target: e.target.value })}
                    placeholder="0x… Base address  or  @agent-handle"
                    required
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <fieldset className="brf-delivery">
                  <legend>Delivery</legend>
                  <label>
                    <input
                      type="radio"
                      name="delivery"
                      value="private"
                      checked={form.delivery === 'private'}
                      onChange={() => setForm({ ...form, delivery: 'private' })}
                    />
                    <span>
                      Private: to your Telegram or email
                      <small>Nothing about your request is published.</small>
                    </span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="delivery"
                      value="public"
                      checked={form.delivery === 'public'}
                      onChange={() => setForm({ ...form, delivery: 'public' })}
                    />
                    <span>
                      Public: an @chainwardai thread on X that tags you
                      <small>The brief becomes part of the public record.</small>
                    </span>
                  </label>
                </fieldset>
                <label>
                  <span>
                    {form.delivery === 'public'
                      ? 'Your X handle (we post the brief as a public @chainwardai thread tagging you)'
                      : 'Your Telegram handle or email (we send the brief there, privately)'}
                  </span>
                  <input
                    value={form.contact}
                    onChange={(e) => setForm({ ...form, contact: e.target.value })}
                    placeholder={form.delivery === 'public' ? '@you' : '@you  or  you@example.com'}
                    required
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <label>
                  <span>Anything specific? (optional)</span>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="e.g. check their token burn claims; follow the money leaving the treasury"
                    rows={3}
                  />
                </label>
                {signError && <div className="brf-error">Error: {signError}</div>}
                {createError && <div className="brf-error">Error: {createError}</div>}
                <button
                  className="press-btn press-btn--full"
                  type="submit"
                  disabled={creating || signing || paymentsUnavailable}
                >
                  {signing
                    ? 'Signing…'
                    : creating
                      ? 'Creating order…'
                      : !isConnected
                        ? 'Connect wallet to continue →'
                        : !user
                          ? 'Sign in & continue →'
                          : `Continue to payment${priceUsdc != null ? ` (${priceUsdc} USDC)` : ''} →`}
                </button>
                <p className="brf-hint">
                  {!user
                    ? 'You pay in USDC on Base from your own wallet. Signing in costs nothing: one signature in your wallet, no fee.'
                    : <>Signed in as <span className="mono">{address && shortAddr(address)}</span>.</>}
                </p>
              </form>
            )}

            {/* A payment from an earlier visit, waiting for the buyer to sign in. */}
            {!user && !order && waitingPayments.length > 0 && (
              <div className="brf-notice brf-resume">
                <p>
                  A payment from this browser is still waiting to be confirmed. Sign in with the wallet you paid from
                  and we&apos;ll finish confirming it.
                </p>
                {waitingPayments.map(({ id, payment }) => (
                  <a
                    key={id}
                    className="press-link"
                    href={CHAINS.base.explorerTxUrl(payment.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {shortHash(payment.txHash)} on BaseScan →
                  </a>
                ))}
                <button className="press-btn press-btn--full" type="button" onClick={signInToFinish} disabled={signing}>
                  {signing ? 'Signing…' : isConnected ? 'Sign in to finish' : 'Connect wallet to finish'}
                </button>
              </div>
            )}

            {/* 2: pay */}
            {order && !paid && (
              <div className="brf-pay">
                <div className="brf-step">
                  Step 2: pay {order.amountUsdc / 1e6} USDC to confirm
                </div>
                <div className="brf-summary">
                  <div>
                    <span>Target</span>
                    <code>{order.targetKind === 'address' ? shortAddr(order.target) : order.target}</code>
                  </div>
                  <div>
                    <span>Deliver via</span>
                    <code>{order.contactMethod}: {order.contact}</code>
                  </div>
                  <div>
                    <span>Order</span>
                    <code>{order.id.slice(0, 8)}</code>
                  </div>
                </div>
                {confirmation.phase === 'idle' && (
                  <PayButton
                    amountUsdc={order.amountUsdc / 1e6}
                    treasuryAddress={config?.treasuryAddress}
                    disabled={paymentsUnavailable}
                    onSent={confirmation.start}
                  />
                )}
                <PaymentStatus
                  phase={confirmation.phase}
                  txHash={confirmation.txHash}
                  message={confirmation.message}
                  onCheckAgain={confirmation.checkAgain}
                  onStartOver={confirmation.startOver}
                  onSignIn={async () => {
                    if (await signInToFinish()) confirmation.checkAgain();
                  }}
                />
                {(confirmation.phase === 'idle' || confirmation.phase === 'failed') && (
                  <ClaimByHash
                    summary="Already paid? Paste your transaction hash"
                    hint={`Sent the payment but lost track of it? Paste the transaction hash. It must send ${order.amountUsdc / 1e6} USDC on Base to ChainWard from the wallet you're signed in with.`}
                    onSubmit={confirmation.start}
                  />
                )}
                {/* No way back to the form while a sent payment is still being confirmed. */}
                {confirmation.phase === 'idle' && (
                  <button className="brf-link-btn" onClick={() => setOrder(null)} type="button">
                    ← change details
                  </button>
                )}
              </div>
            )}

            {/* 3: done */}
            {order && paid && (
              <div className="brf-done">
                <div className="brf-done-check" aria-hidden>✓</div>
                <h3 className="press-display">Brief ordered</h3>
                <p>
                  We&apos;re investigating{' '}
                  <strong>{order.targetKind === 'address' ? shortAddr(order.target) : order.target}</strong>.{' '}
                  {order.contactMethod === 'x' ? (
                    <>
                      The brief posts as a public @chainwardai thread tagging{' '}
                      <strong>{order.contact}</strong> within 48 hours, and the written version
                      appears on this page under <em>Your requests</em>.
                    </>
                  ) : (
                    <>
                      Your written brief appears on this page under <em>Your requests</em> within
                      48 hours. Sign in with the same wallet to read it. We&apos;ll also message{' '}
                      <strong>{order.contact}</strong> when it lands.
                    </>
                  )}
                </p>
                <p className="brf-hint">Order {order.id.slice(0, 8)} · bookmark chainward.ai/request-brief.</p>
                <Link href="/decodes" className="press-btn press-btn--ghost">
                  See published decodes →
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Secondary tier: scoped by hand, not a checkout */}
        <section className="brf-bespoke" aria-label="Commissioned investigation">
          <div className="brf-bespoke-head">
            <span className="press-label--ox brf-bespoke-mark">Commissioned investigation</span>
            <span className="brf-bespoke-price mono">Price on request</span>
          </div>
          <h2 className="brf-bespoke-title press-display">
            More than one wallet? We&apos;ll look into the whole thing.
          </h2>
          <p className="brf-bespoke-copy">
            For teams, funds and launchpads checking out an agent or a project
            before they commit: we follow the money across all of its wallets,
            check its claims against the chain, and write up the full
            investigation, published or kept private. Tell us what you need and
            we&apos;ll quote a price.
          </p>
          <div className="brf-bespoke-foot">
            <a
              href="https://x.com/chainwardai"
              target="_blank"
              rel="noopener noreferrer"
              className="press-btn press-btn--ghost"
            >
              Message @chainwardai on X →
            </a>
            <span className="brf-bespoke-email">
              or email{' '}
              <a className="press-link" href="mailto:hello@chainward.ai">
                hello@chainward.ai
              </a>
            </span>
            <Link href="/decodes" className="press-link">
              Read the published investigations
            </Link>
          </div>
        </section>

        {/* My requests */}
        {user && myOrders.length > 0 && (
          <div className="brf-orders">
            <div className="brf-orders-head press-label">Your requests</div>
            {myOrders.map((o) => {
              const state = orderDeliveryState(o);
              return (
                <div key={o.id} className="brf-order">
                  <div className="brf-order-row">
                    <code className="mono">{o.targetKind === 'address' ? shortAddr(o.target) : o.target}</code>
                    {state.link ? (
                      <a
                        className={`brf-status brf-status-${state.key}`}
                        href={state.link}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {state.label} →
                      </a>
                    ) : (
                      <span className={`brf-status brf-status-${state.key}`}>{state.label}</span>
                    )}
                    <span className="brf-order-date mono">{new Date(o.createdAt).toLocaleDateString()}</span>
                  </div>
                  {state.key === 'ready' && o.briefMarkdown ? (
                    <details className="brf-order-brief">
                      <summary className="press-link">Read your brief →</summary>
                      <div className="brf-order-brief-body press-measure">
                        <ReactMarkdown>{o.briefMarkdown}</ReactMarkdown>
                      </div>
                    </details>
                  ) : (
                    state.hint && (
                      <p className="brf-order-hint">
                        {state.hint}
                        {state.link && (
                          <>
                            {' '}
                            <a className="press-link" href={state.link} target="_blank" rel="noopener noreferrer">
                              Read the thread →
                            </a>
                          </>
                        )}
                      </p>
                    )
                  )}
                  {o.status === 'pending' && o.id !== order?.id && (
                    <PendingOrderPayment
                      orderId={o.id}
                      amountUsdc={o.amountUsdc / 1e6}
                      onPaid={handleOrderPaid}
                      onSignIn={signInToFinish}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        <Colophon />
      </div>

    </>
  );
}
