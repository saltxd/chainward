'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useAccount, useSignMessage } from 'wagmi';
import { siweSignIn, useSession } from '@/lib/auth-client';
import { api, ApiError, type BriefConfig, type BriefOrder, type BriefContactMethod } from '@/lib/api';
import { Masthead, PressDateline, Colophon } from '@/components/press';
import { PayButton } from '@/components/payment/pay-button';
import { useToast } from '@/components/ui/toast';

const WHAT_YOU_GET = [
  'Full on-chain forensic decode from our own Base node',
  'Fund-flow + counterparty trace (where the money really goes)',
  'Claim-vs-reality check against on-chain evidence',
  'Every flag sourced to the chain',
  'Delivered as a public thread from @chainwardai, tagging you — within 48h',
];

function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
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
    contactMethod: BriefContactMethod;
    notes: string;
  }>({ target: '', contact: '', contactMethod: 'x', notes: '' });

  const [order, setOrder] = useState<BriefOrder | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [paid, setPaid] = useState(false);

  const [myOrders, setMyOrders] = useState<BriefOrder[]>([]);

  const user = session?.user ?? null;
  // Price is ALWAYS runtime config — never hardcoded. Null until loaded.
  const priceUsdc = config?.priceUsdc ?? null;
  const priceLabel = priceUsdc != null ? `${priceUsdc} USDC` : 'Priced in USDC on Base';

  // Load treasury + price config at runtime (not from a baked NEXT_PUBLIC var).
  useEffect(() => {
    api
      .getBriefConfig()
      .then(setConfig)
      .catch((err) => setConfigError(err instanceof Error ? err.message : 'Could not load pricing'));
  }, []);

  const loadMyOrders = useCallback(() => {
    if (!user) return;
    api
      .getMyBriefOrders()
      .then((res) => setMyOrders(res.orders))
      .catch(() => {/* non-fatal */});
  }, [user]);

  useEffect(() => {
    loadMyOrders();
  }, [loadMyOrders]);

  async function handleSignIn() {
    if (!address || !chainId) return;
    setSignError('');
    setSigning(true);
    try {
      await siweSignIn(address, chainId, signMessageAsync);
      await refetchSession();
    } catch (err) {
      setSignError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setSigning(false);
    }
  }

  async function handleCreateOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!form.target.trim() || !form.contact.trim()) return;
    setCreateError('');
    setCreating(true);
    try {
      const res = await api.createBriefOrder({
        target: form.target.trim(),
        contact: form.contact.trim(),
        contactMethod: form.contactMethod,
        notes: form.notes.trim() || undefined,
      });
      setOrder(res.order);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Could not create order';
      setCreateError(msg);
    } finally {
      setCreating(false);
    }
  }

  const paymentsUnavailable = config !== null && !config.available;

  return (
    <>
      <PressDateline />
      <div className="press-wrap">
        <Masthead />

        <section className="brf-lead">
          <span className="press-label">Intel Brief · commissioned decode</span>
          <h1 className="brf-title press-display">Order a forensic decode.</h1>
          <p className="brf-lede">
            Point us at any Base agent or wallet. We run the full on-chain
            investigation and file a written brief — delivered as a public thread
            within 48 hours.
          </p>
        </section>

        <div className="brf-grid">
          {/* The offer — a case-file artifact */}
          <aside className="brf-offer">
            <div className="brf-offer-head">
              <span className="press-label">The commission</span>
              <span className="brf-offer-price mono">{priceLabel}</span>
            </div>
            <p className="brf-offer-terms mono">One-time · on Base · delivered within 48h</p>
            <ul className="brf-offer-list">
              {WHAT_YOU_GET.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <p className="brf-offer-fine">
              Same engine behind our public{' '}
              <Link href="/decodes" className="press-link">decodes</Link>. Your
              request stays private.
            </p>
          </aside>

          {/* The action */}
          <div className="brf-action">
            {configError && <div className="brf-error">Error: {configError}</div>}
            {paymentsUnavailable && (
              <div className="brf-notice">
                Payments are being configured — please check back shortly.
              </div>
            )}

            {/* 1 — connect */}
            {!isConnected && (
              <>
                <div className="brf-step">Step 1 — connect your wallet</div>
                <button className="press-btn press-btn--full" onClick={openConnectModal}>
                  Connect wallet →
                </button>
              </>
            )}

            {/* 2 — sign in */}
            {isConnected && !user && (
              <>
                <div className="brf-step">
                  Step 2 — sign in as{' '}
                  <span className="mono" style={{ color: 'var(--oxblood)' }}>
                    {address && shortAddr(address)}
                  </span>
                </div>
                {signError && <div className="brf-error">Error: {signError}</div>}
                <button
                  className="press-btn press-btn--full"
                  onClick={handleSignIn}
                  disabled={signing}
                >
                  {signing ? 'Signing…' : 'Sign in with Ethereum →'}
                </button>
                <p className="brf-hint">One signature, no gas. Proves you own the wallet.</p>
              </>
            )}

            {/* 3 — request form */}
            {user && !order && (
              <form className="brf-form" onSubmit={handleCreateOrder}>
                <div className="brf-step">Step 3 — what should we decode?</div>
                <label>
                  <span>Target — address or handle</span>
                  <input
                    value={form.target}
                    onChange={(e) => setForm({ ...form, target: e.target.value })}
                    placeholder="0x… Base address  or  @agent-handle"
                    required
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <label>
                  <span>Your X handle — we deliver as a public @chainwardai thread tagging you</span>
                  <input
                    value={form.contact}
                    onChange={(e) => setForm({ ...form, contact: e.target.value })}
                    placeholder="@you"
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
                    placeholder="e.g. verify their burn claims; trace the treasury outflows"
                    rows={3}
                  />
                </label>
                {createError && <div className="brf-error">Error: {createError}</div>}
                <button
                  className="press-btn press-btn--full"
                  type="submit"
                  disabled={creating || paymentsUnavailable}
                >
                  {creating
                    ? 'Creating order…'
                    : `Continue to payment${priceUsdc != null ? ` — ${priceUsdc} USDC` : ''} →`}
                </button>
              </form>
            )}

            {/* 4 — pay */}
            {user && order && !paid && (
              <div className="brf-pay">
                <div className="brf-step">
                  Step 4 — pay {order.amountUsdc / 1e6} USDC to confirm
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
                <PayButton
                  amountUsdc={order.amountUsdc / 1e6}
                  treasuryAddress={config?.treasuryAddress}
                  disabled={paymentsUnavailable}
                  verify={async (txHash) => {
                    const res = await api.payBriefOrder(order.id, txHash);
                    setOrder(res.order);
                  }}
                  onSuccess={() => {
                    setPaid(true);
                    toast('Payment confirmed — your brief is queued', 'success');
                    loadMyOrders();
                  }}
                />
                <button className="brf-link-btn" onClick={() => setOrder(null)} type="button">
                  ← change details
                </button>
              </div>
            )}

            {/* 5 — done */}
            {user && order && paid && (
              <div className="brf-done">
                <div className="brf-done-check" aria-hidden>✓</div>
                <h3 className="press-display">Brief ordered</h3>
                <p>
                  We&apos;re decoding{' '}
                  <strong>{order.targetKind === 'address' ? shortAddr(order.target) : order.target}</strong>{' '}
                  and will deliver to <strong>{order.contact}</strong> ({order.contactMethod}) within 48 hours.
                </p>
                <p className="brf-hint">Order {order.id.slice(0, 8)} · keep an eye on your {order.contactMethod}.</p>
                <Link href="/decodes" className="press-btn press-btn--ghost">
                  See published decodes →
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Secondary tier — text, not a checkout */}
        <section className="brf-bespoke">
          <div className="brf-bespoke-mark press-label--ox">Commissioned investigation</div>
          <p className="brf-bespoke-copy">
            Need more than a single wallet? A bespoke deep-dive decode — multi-wallet
            fund-flow reconstruction, a full published investigation — starts at{' '}
            <span className="mono">250 USDC</span>. DM{' '}
            <a href="https://x.com/chainwardai" target="_blank" rel="noopener noreferrer" className="press-link">
              @chainwardai
            </a>{' '}
            on X to scope one.
          </p>
        </section>

        {/* My requests */}
        {user && myOrders.length > 0 && (
          <div className="brf-orders">
            <div className="brf-orders-head press-label">Your requests</div>
            {myOrders.map((o) => (
              <div key={o.id} className="brf-order-row">
                <code className="mono">{o.targetKind === 'address' ? shortAddr(o.target) : o.target}</code>
                <span className={`brf-status brf-status-${o.status}`}>{o.status}</span>
                <span className="brf-order-date mono">{new Date(o.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}

        <Colophon />
      </div>

      <style>{`
        .brf-lead { padding: 40px 0 32px; max-width: 720px; }
        .brf-title { margin: 14px 0 0; font-size: clamp(34px, 5vw, 56px); line-height: 1; letter-spacing: -0.03em; }
        .brf-lede {
          margin: 18px 0 0; font-family: var(--font-text); font-size: 18px;
          line-height: 1.55; color: var(--ink-soft);
        }
        .brf-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: start;
        }
        @media (max-width: 780px) { .brf-grid { grid-template-columns: 1fr; } }

        .brf-offer {
          border: 1px solid var(--rule-strong);
          border-top: 3px double var(--rule-strong);
          background: var(--paper-2);
          padding: 26px 28px;
        }
        .brf-offer-head {
          display: flex; align-items: baseline; justify-content: space-between; gap: 16px;
          padding-bottom: 12px; border-bottom: 1px solid var(--rule); flex-wrap: wrap;
        }
        .brf-offer-price { font-size: 16px; color: var(--ink); letter-spacing: 0.01em; }
        .brf-offer-terms {
          margin: 12px 0 0; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase;
          color: var(--ink-faint);
        }
        .brf-offer-list { list-style: none; margin: 20px 0 0; padding: 0; display: grid; gap: 9px; }
        .brf-offer-list li {
          position: relative; padding-left: 22px; font-family: var(--font-text);
          font-size: 15.5px; line-height: 1.5; color: var(--ink-soft);
        }
        .brf-offer-list li::before { content: '§'; position: absolute; left: 0; color: var(--oxblood); }
        .brf-offer-fine { margin: 20px 0 0; font-family: var(--font-mono), monospace; font-size: 11px; line-height: 1.6; color: var(--ink-faint); }

        .brf-action {
          border: 1px solid var(--rule-strong); background: var(--paper);
          padding: 26px 28px; display: flex; flex-direction: column; gap: 14px;
        }
        .brf-step {
          font-family: var(--font-mono), ui-monospace, monospace; font-size: 11px;
          color: var(--ink-faint); letter-spacing: 0.1em; text-transform: uppercase;
        }
        .brf-form { display: flex; flex-direction: column; gap: 14px; }
        .brf-form label { display: flex; flex-direction: column; gap: 6px; }
        .brf-form label > span {
          font-family: var(--font-mono), ui-monospace, monospace; font-size: 11px;
          color: var(--ink-faint); letter-spacing: 0.06em; text-transform: uppercase; line-height: 1.5;
        }
        .brf-form input, .brf-form textarea {
          background: transparent; border: 0; border-bottom: 2px solid var(--ink); color: var(--ink);
          padding: 8px 2px; font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 14px; min-height: 38px; resize: vertical;
        }
        .brf-form input::placeholder, .brf-form textarea::placeholder { color: var(--rule-strong); }
        .brf-form input:focus, .brf-form textarea:focus { outline: none; border-bottom-color: var(--oxblood); }
        .brf-summary {
          display: flex; flex-direction: column; gap: 8px; padding: 14px;
          border: 1px dashed var(--rule-strong); font-size: 12px; background: var(--paper-2);
        }
        .brf-summary > div { display: flex; justify-content: space-between; gap: 12px; }
        .brf-summary span {
          font-family: var(--font-mono), monospace; font-size: 10px; text-transform: uppercase;
          letter-spacing: 0.08em; color: var(--ink-faint);
        }
        .brf-summary code { font-family: var(--font-mono), monospace; color: var(--ink); }
        .brf-pay { display: flex; flex-direction: column; gap: 14px; }
        .brf-error {
          padding: 10px 14px; background: var(--oxblood-wash); border: 1px solid var(--oxblood);
          color: var(--oxblood); font-family: var(--font-mono), monospace; font-size: 12px;
        }
        .brf-notice {
          padding: 10px 14px; background: rgba(138,90,18,0.08); border: 1px solid var(--sev-medium);
          color: var(--sev-medium); font-family: var(--font-mono), monospace; font-size: 12px;
        }
        .brf-hint { margin: 0; font-family: var(--font-mono), monospace; font-size: 11px; color: var(--ink-faint); line-height: 1.5; }
        .brf-link-btn {
          background: none; border: 0; color: var(--ink-faint); font-size: 12px; cursor: pointer;
          padding: 0; text-align: left; font-family: var(--font-mono), monospace;
        }
        .brf-link-btn:hover { color: var(--oxblood); }
        .brf-done { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
        .brf-done-check {
          width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
          border: 2px solid var(--seal); color: var(--seal); font-size: 20px;
        }
        .brf-done h3 { margin: 6px 0 0; font-size: 24px; }
        .brf-done p { margin: 0; font-family: var(--font-text); font-size: 16px; color: var(--ink-soft); line-height: 1.55; }
        .brf-done strong { color: var(--ink); }

        .brf-bespoke {
          margin-top: 40px; padding: 26px 0; border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule);
        }
        .brf-bespoke-mark { font-family: var(--font-mono), monospace; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; }
        .brf-bespoke-copy {
          margin: 10px 0 0; font-family: var(--font-text); font-size: 18px; line-height: 1.55;
          color: var(--ink); max-width: 720px;
        }

        .brf-orders { margin-top: 40px; border: 1px solid var(--rule-strong); }
        .brf-orders-head { padding: 12px 16px; border-bottom: 1px solid var(--rule); }
        .brf-order-row {
          display: grid; grid-template-columns: 1fr auto auto; gap: 16px; align-items: center;
          padding: 12px 16px; border-bottom: 1px solid var(--rule); font-size: 12.5px;
        }
        .brf-order-row:last-child { border-bottom: none; }
        .brf-order-row code { color: var(--ink); }
        .brf-order-date { color: var(--ink-faint); font-size: 11px; }
        .brf-status {
          font-family: var(--font-mono), monospace; font-size: 10px; text-transform: uppercase;
          letter-spacing: 0.08em; padding: 3px 8px; border: 1px solid var(--rule-strong); color: var(--ink-soft);
        }
        .brf-status-paid { color: var(--seal); border-color: var(--seal); }
        .brf-status-fulfilled { color: var(--sev-low); border-color: var(--sev-low); }
        .brf-status-cancelled { color: var(--oxblood); border-color: var(--oxblood); }
      `}</style>
    </>
  );
}
