'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { api, ApiError, type PaidFileMeta, type PaidFileLookup } from '@/lib/api';
import { track } from '@/lib/track';
import { Masthead, PressDateline, Colophon } from '@/components/press';
import { PayButton } from '@/components/payment/pay-button';
import { PaymentStatus } from '@/components/payment/PaymentStatus';
import { ClaimByHash } from '@/components/payment/ClaimByHash';
import { usePaymentConfirmation } from '@/components/payment/usePaymentConfirmation';
import { browserStorage, paymentKey, readDownload, saveDownload } from '@/lib/paymentStore';
import { WithdrawnNotice } from './WithdrawnNotice';

// Where a withdrawn dataset's page points instead: the decode it came from.
const WITHDRAWN_DECODE: Record<string, string> = {
  'x402-sellers-base': '/decodes/x402-on-base-two-weeks-later',
};

// Buy the full dataset behind a decode: pay the price in USDC on Base from any
// wallet, the API verifies the transfer and hands back a 24h download link.
// No account needed. x402 clients can pay GET /api/paid/<slug>/file instead.
//
// Once the wallet returns a hash it is saved in this browser and confirmed in
// the background until the claim succeeds; a reload resumes it. Anyone who
// paid some other way pastes the hash into the claim box.

function formatBytes(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} KB`;
  return `${n} B`;
}

export default function PaidFilePage() {
  const { slug } = useParams<{ slug: string }>();
  const [file, setFile] = useState<PaidFileMeta | null>(null);
  const [treasury, setTreasury] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [lookupAddr, setLookupAddr] = useState('');
  const [lookup, setLookup] = useState<PaidFileLookup | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  const confirmation = usePaymentConfirmation({
    storageKey: slug ? paymentKey('dataset', slug) : null,
    product: 'dataset',
    confirm: async (txHash) => (await api.claimPaidFile(slug, txHash)).data.downloadUrl,
    onConfirmed: (url) => {
      setDownloadUrl(url);
      saveDownload(browserStorage(), slug, url);
      track('paid_file_bought', { slug, price: file?.priceUsdc ?? 0 });
    },
  });

  // A link claimed earlier in this browser is good for 24h; the API won't issue a second.
  useEffect(() => {
    const saved = readDownload(browserStorage(), slug);
    if (saved) setDownloadUrl(saved);
  }, [slug]);

  useEffect(() => {
    api
      .getPaidFile(slug)
      .then((res) => {
        setFile(res.data);
        setTreasury(res.treasuryAddress);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Could not load this file'));
  }, [slug]);

  const priceLabel = file ? `${file.priceUsdc} USDC` : '…';

  return (
    <>
      <PressDateline />
      <div className="press-wrap">
        <Masthead />

        <section className="brf-lead">
          <span className="press-label">Dataset · the full file behind a decode</span>
          <h1 className="brf-title press-display">{file?.title ?? (loadError ? 'Not found' : 'Loading…')}</h1>
          {file && <p className="brf-lede">{file.description}</p>}
          {loadError && <p className="brf-error">{loadError}</p>}
        </section>

        {file?.withdrawn && (
          <WithdrawnNotice reason={file.withdrawn.reason} decodeHref={WITHDRAWN_DECODE[file.slug] ?? '/decodes'} />
        )}

        {file && !file.withdrawn && (
          <div className="brf-grid">
            <aside className="brf-offer">
              <div className="brf-offer-head">
                <span className="press-label">The file</span>
                <span className="brf-offer-price mono">{priceLabel}</span>
              </div>
              <p className="brf-offer-terms mono">
                {file.filename} · {formatBytes(file.sizeBytes)} · one-time · USDC on Base
              </p>
              <ul className="brf-offer-list">
                <li>Pay from any wallet; no account, no sign-in.</li>
                <li>Download link valid for 24 hours after payment.</li>
                <li>
                  Agents: pay per request over x402 (a way for one program to pay another in USDC,
                  per request) at{' '}
                  <code className="mono">GET /api/paid/{file.slug}/file</code>.
                </li>
              </ul>
              <p className="brf-offer-fine">
                Addresses, not people. The file describes on-chain flows and is
                not a judgment of anyone&apos;s intent. See the{' '}
                <Link href="/decodes" className="press-link">decodes</Link> for method.
              </p>
            </aside>

            <div className="brf-action">
              <form
                className="brf-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setLookupError(null);
                  setLookup(null);
                  try {
                    const res = await api.lookupPaidFile(file.slug, lookupAddr.trim());
                    setLookup(res.data);
                    track('paid_file_lookup', { slug: file.slug, found: res.data.found });
                  } catch (err) {
                    setLookupError(err instanceof ApiError ? err.message : 'Lookup failed');
                  }
                }}
              >
                <div className="brf-step">Free: check one wallet against this list</div>
                <label>
                  <span>Wallet address</span>
                  <input
                    value={lookupAddr}
                    onChange={(e) => setLookupAddr(e.target.value)}
                    placeholder="0x…"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <button className="press-btn press-btn--full" type="submit" disabled={!/^0x[a-fA-F0-9]{40}$/.test(lookupAddr.trim())}>
                  Check this wallet
                </button>
                {lookupError && <div className="brf-error">{lookupError}</div>}
                {lookup && (
                  <div className="brf-summary">
                    {lookup.found ? (
                      <>
                        {lookup.matches.map((m) => (
                          <div key={m.chain}>
                            <span>{m.chain}</span>
                            <code>tier {m.tier}</code>
                          </div>
                        ))}
                        <p className="brf-offer-fine">
                          The row behind the tier is in the full file, or one wallet at a time over x402 at{' '}
                          <code className="mono">GET /api/paid/{file.slug}/check?address=</code>
                        </p>
                      </>
                    ) : (
                      <div>
                        <span>result</span>
                        <code>not in this list</code>
                      </div>
                    )}
                  </div>
                )}
              </form>

              {!treasury && (
                <div className="brf-notice">
                  Payments are paused right now. Please check back shortly, or email hello@chainward.ai.
                </div>
              )}

              {!downloadUrl && confirmation.phase === 'idle' && (
                <div className="brf-form">
                  <div className="brf-step">Step 1 · connect a wallet on Base</div>
                  {!isConnected ? (
                    <button className="press-btn press-btn--full" type="button" onClick={() => openConnectModal?.()}>
                      Connect wallet
                    </button>
                  ) : (
                    <p className="brf-offer-fine">Wallet connected.</p>
                  )}
                  <div className="brf-step">Step 2 · pay {priceLabel}</div>
                  <PayButton
                    amountUsdc={file.priceUsdc}
                    treasuryAddress={treasury}
                    disabled={!treasury || !isConnected}
                    onSent={confirmation.start}
                  />
                </div>
              )}

              {!downloadUrl && (
                <PaymentStatus
                  phase={confirmation.phase}
                  txHash={confirmation.txHash}
                  message={confirmation.message}
                  onCheckAgain={confirmation.checkAgain}
                  onStartOver={confirmation.startOver}
                />
              )}

              {!downloadUrl && (confirmation.phase === 'idle' || confirmation.phase === 'failed') && (
                <ClaimByHash
                  summary="Already paid? Paste your transaction hash"
                  hint={
                    <>
                      Paid from another wallet or app, or lost this page after paying? Paste the transaction hash and
                      we&apos;ll check it on Base. It counts if it sent at least {priceLabel} on Base to{' '}
                      {treasury ? <span className="brf-hash">{treasury}</span> : 'the ChainWard treasury'}.
                    </>
                  }
                  onSubmit={confirmation.start}
                />
              )}

              {downloadUrl && (
                <div className="brf-form">
                  <div className="brf-step">Paid · your download is ready</div>
                  <a className="press-btn press-btn--full" href={downloadUrl} download={file.filename}>
                    Download {file.filename}
                  </a>
                  <p className="brf-offer-fine">
                    This link works for 24 hours. Save the file somewhere safe.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        <Colophon />
      </div>
    </>
  );
}
