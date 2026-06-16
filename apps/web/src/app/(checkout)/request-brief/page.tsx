'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useAccount, useSignMessage } from 'wagmi';
import { siweSignIn, useSession } from '@/lib/auth-client';
import { api, ApiError, type BriefConfig, type BriefOrder, type BriefContactMethod } from '@/lib/api';
import { SectionHead, TerminalCard, Button } from '@/components/v2';
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
  const priceUsdc = config?.priceUsdc ?? 1;

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
    <div className="v2-brief">
      <Link href="/" className="v2-brief-brand" aria-label="ChainWard home">
        <span className="v2-brief-dot" aria-hidden />
        <span>
          chainward<span style={{ color: 'var(--phosphor)' }}>.ai</span>
        </span>
      </Link>

      <SectionHead
        tag="// intel.brief"
        title="Order a forensic decode"
        lede="Point us at any Base agent or wallet. We run the full on-chain investigation and deliver a written brief within 48 hours."
      />

      <div className="v2-brief-grid">
        {/* Offer */}
        <TerminalCard title="~/intel-brief" status="one.time">
          <div className="v2-brief-price">
            <span className="v2-brief-price-num">{priceUsdc}</span>
            <span className="v2-brief-price-unit">USDC · one-time · on Base</span>
          </div>
          <ul className="v2-brief-list">
            {WHAT_YOU_GET.map((f) => (
              <li key={f}>
                <span className="v2-brief-tick">›</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <p className="v2-brief-fineprint">
            Same engine behind our public{' '}
            <Link href="/decodes" className="v2-brief-inline-link">decodes</Link>. Your request is private.
          </p>
        </TerminalCard>

        {/* Action */}
        <div className="v2-brief-action">
          {configError && <div className="v2-brief-error">error: {configError}</div>}
          {paymentsUnavailable && (
            <div className="v2-brief-notice">
              Payments are being configured — please check back shortly.
            </div>
          )}

          {/* 1 — connect */}
          {!isConnected && (
            <>
              <div className="v2-brief-step">Step 1 — connect your wallet</div>
              <Button variant="primary" fullWidth onClick={openConnectModal}>
                ./connect-wallet <span>→</span>
              </Button>
            </>
          )}

          {/* 2 — sign in */}
          {isConnected && !user && (
            <>
              <div className="v2-brief-step">
                Step 2 — sign in as <span style={{ color: 'var(--phosphor)' }}>{address && shortAddr(address)}</span>
              </div>
              {signError && <div className="v2-brief-error">error: {signError}</div>}
              <Button variant="primary" fullWidth onClick={handleSignIn} disabled={signing}>
                {signing ? 'signing…' : './sign-in-with-ethereum'} {!signing && <span>→</span>}
              </Button>
              <p className="v2-brief-hint">One signature, no gas. Proves you own the wallet.</p>
            </>
          )}

          {/* 3 — request form */}
          {user && !order && (
            <form className="v2-brief-form" onSubmit={handleCreateOrder}>
              <div className="v2-brief-step">Step 3 — what should we decode?</div>
              <label>
                <span>target — address or handle</span>
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
                <span>your X handle — we deliver as a public @chainwardai thread tagging you</span>
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
                <span>anything specific? (optional)</span>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="e.g. verify their burn claims; trace the treasury outflows"
                  rows={3}
                />
              </label>
              {createError && <div className="v2-brief-error">error: {createError}</div>}
              <Button variant="primary" fullWidth type="submit" disabled={creating || paymentsUnavailable}>
                {creating ? 'creating order…' : `continue to payment — ${priceUsdc} USDC`} {!creating && <span>→</span>}
              </Button>
            </form>
          )}

          {/* 4 — pay */}
          {user && order && !paid && (
            <div className="v2-brief-pay">
              <div className="v2-brief-step">Step 4 — pay {(order.amountUsdc / 1e6)} USDC to confirm</div>
              <div className="v2-brief-summary">
                <div><span>target</span><code>{order.targetKind === 'address' ? shortAddr(order.target) : order.target}</code></div>
                <div><span>deliver via</span><code>{order.contactMethod}: {order.contact}</code></div>
                <div><span>order</span><code>{order.id.slice(0, 8)}</code></div>
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
              <button className="v2-brief-link-btn" onClick={() => setOrder(null)} type="button">
                ← change details
              </button>
            </div>
          )}

          {/* 5 — done */}
          {user && order && paid && (
            <div className="v2-brief-done">
              <div className="v2-brief-done-check" aria-hidden>✓</div>
              <h3>Brief ordered</h3>
              <p>
                We&apos;re decoding{' '}
                <strong>{order.targetKind === 'address' ? shortAddr(order.target) : order.target}</strong>{' '}
                and will deliver to <strong>{order.contact}</strong> ({order.contactMethod}) within 48 hours.
              </p>
              <p className="v2-brief-hint">Order {order.id.slice(0, 8)} · keep an eye on your {order.contactMethod}.</p>
              <Button variant="ghost" href="/decodes">see published decodes →</Button>
            </div>
          )}
        </div>
      </div>

      {/* My requests */}
      {user && myOrders.length > 0 && (
        <div className="v2-brief-orders">
          <div className="v2-brief-orders-head">your requests</div>
          {myOrders.map((o) => (
            <div key={o.id} className="v2-brief-order-row">
              <code>{o.targetKind === 'address' ? shortAddr(o.target) : o.target}</code>
              <span className={`v2-brief-status v2-brief-status-${o.status}`}>{o.status}</span>
              <span className="v2-brief-order-date">{new Date(o.createdAt).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .v2-brief { width: 100%; max-width: 880px; display: flex; flex-direction: column; gap: 28px; }
        .v2-brief-brand {
          display: inline-flex; align-items: center; gap: 10px;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-weight: 600; font-size: 13px; color: var(--fg); text-decoration: none;
        }
        .v2-brief-dot { width: 10px; height: 10px; background: var(--phosphor); box-shadow: 0 0 8px var(--phosphor); }
        .v2-brief-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; }
        @media (max-width: 760px) { .v2-brief-grid { grid-template-columns: 1fr; } }

        .v2-brief-price { display: flex; align-items: baseline; gap: 10px; margin-bottom: 18px; }
        .v2-brief-price-num {
          font-family: var(--font-display), serif; font-size: 44px; font-weight: 500;
          color: var(--fg); letter-spacing: -0.03em; line-height: 1;
        }
        .v2-brief-price-unit { font-size: 12px; color: var(--muted); letter-spacing: 0.04em; }
        .v2-brief-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
        .v2-brief-list li { display: flex; gap: 10px; font-size: 13px; color: var(--fg-dim); line-height: 1.5; }
        .v2-brief-tick { color: var(--phosphor); flex-shrink: 0; }
        .v2-brief-fineprint { margin: 18px 0 0; font-size: 11.5px; color: var(--muted); line-height: 1.6; }
        .v2-brief-inline-link { color: var(--phosphor); text-decoration: none; }
        .v2-brief-inline-link:hover { text-decoration: underline; }

        .v2-brief-action {
          border: 1px solid var(--line-2); background: var(--bg-1);
          padding: 24px; display: flex; flex-direction: column; gap: 14px;
        }
        .v2-brief-step {
          font-family: var(--font-mono), ui-monospace, monospace; font-size: 11px;
          color: var(--muted); letter-spacing: 0.1em; text-transform: uppercase;
        }
        .v2-brief-form { display: flex; flex-direction: column; gap: 14px; }
        .v2-brief-form label { display: flex; flex-direction: column; gap: 6px; }
        .v2-brief-form label > span {
          font-family: var(--font-mono), ui-monospace, monospace; font-size: 11px;
          color: var(--muted); letter-spacing: 0.08em; text-transform: uppercase;
        }
        .v2-brief-form input, .v2-brief-form select, .v2-brief-form textarea {
          background: transparent; border: 1px solid var(--line-2); color: var(--fg);
          padding: 10px 14px; font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 13px; min-height: 42px; border-radius: 0; resize: vertical;
        }
        .v2-brief-form input:focus, .v2-brief-form select:focus, .v2-brief-form textarea:focus {
          outline: none; border-color: var(--phosphor);
        }
        .v2-brief-summary {
          display: flex; flex-direction: column; gap: 8px; padding: 14px;
          border: 1px dashed var(--line-2); font-size: 12px;
        }
        .v2-brief-summary > div { display: flex; justify-content: space-between; gap: 12px; }
        .v2-brief-summary span { color: var(--muted); font-family: var(--font-mono), monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
        .v2-brief-summary code { color: var(--fg); font-family: var(--font-mono), monospace; }
        .v2-brief-pay { display: flex; flex-direction: column; gap: 14px; }
        .v2-brief-error {
          padding: 10px 14px; background: rgba(230,103,103,0.08); border: 1px solid rgba(230,103,103,0.3);
          color: var(--danger); font-family: var(--font-mono), monospace; font-size: 12px;
        }
        .v2-brief-notice {
          padding: 10px 14px; background: rgba(232,160,51,0.08); border: 1px solid rgba(232,160,51,0.3);
          color: var(--amber); font-family: var(--font-mono), monospace; font-size: 12px;
        }
        .v2-brief-hint { margin: 0; font-size: 11px; color: var(--muted); letter-spacing: 0.03em; }
        .v2-brief-link-btn {
          background: none; border: none; color: var(--muted); font-size: 12px;
          cursor: pointer; padding: 0; text-align: left; font-family: var(--font-mono), monospace;
        }
        .v2-brief-link-btn:hover { color: var(--fg); }
        .v2-brief-done { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
        .v2-brief-done-check {
          width: 38px; height: 38px; display: flex; align-items: center; justify-content: center;
          border: 1px solid var(--phosphor); color: var(--phosphor); font-size: 18px;
          box-shadow: 0 0 16px rgba(58,167,109,0.25);
        }
        .v2-brief-done h3 { margin: 6px 0 0; font-size: 18px; color: var(--fg); font-weight: 500; }
        .v2-brief-done p { margin: 0; font-size: 13px; color: var(--fg-dim); line-height: 1.6; }
        .v2-brief-done strong { color: var(--fg); }

        .v2-brief-orders { display: flex; flex-direction: column; gap: 0; border: 1px solid var(--line); }
        .v2-brief-orders-head {
          padding: 12px 16px; border-bottom: 1px solid var(--line);
          font-family: var(--font-mono), monospace; font-size: 11px; color: var(--muted);
          text-transform: uppercase; letter-spacing: 0.1em;
        }
        .v2-brief-order-row {
          display: grid; grid-template-columns: 1fr auto auto; gap: 16px; align-items: center;
          padding: 12px 16px; border-bottom: 1px solid var(--line); font-size: 12.5px;
        }
        .v2-brief-order-row:last-child { border-bottom: none; }
        .v2-brief-order-row code { color: var(--fg); font-family: var(--font-mono), monospace; }
        .v2-brief-order-date { color: var(--muted); font-size: 11px; }
        .v2-brief-status {
          font-family: var(--font-mono), monospace; font-size: 10px; text-transform: uppercase;
          letter-spacing: 0.08em; padding: 3px 8px; border: 1px solid var(--line-2);
        }
        .v2-brief-status-pending { color: var(--muted); }
        .v2-brief-status-paid { color: var(--phosphor); border-color: var(--phosphor-dim); }
        .v2-brief-status-fulfilled { color: var(--cyan); border-color: var(--cyan); }
        .v2-brief-status-cancelled { color: var(--danger); }
      `}</style>
    </div>
  );
}
