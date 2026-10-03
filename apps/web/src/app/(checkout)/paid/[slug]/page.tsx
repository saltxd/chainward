'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { api, ApiError, type PaidFileMeta } from '@/lib/api';
import { track } from '@/lib/track';
import { Masthead, PressDateline, Colophon } from '@/components/press';
import { PayButton } from '@/components/payment/pay-button';

// Buy the full dataset behind a decode: pay the price in USDC on Base from any
// wallet, the API verifies the transfer and hands back a 24h download link.
// No account needed. x402 clients can pay GET /api/paid/<slug>/file instead.

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
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

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

        {file && (
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
                  Agents: pay per request over x402 at{' '}
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
              {!treasury && <div className="brf-notice">Payments are being configured — please check back shortly.</div>}

              {!downloadUrl && (
                <div className="brf-form">
                  <div className="brf-step">Step 1 — connect a wallet on Base</div>
                  {!isConnected ? (
                    <button className="press-btn press-btn--full" type="button" onClick={() => openConnectModal?.()}>
                      Connect wallet
                    </button>
                  ) : (
                    <p className="brf-offer-fine">Wallet connected.</p>
                  )}
                  <div className="brf-step">Step 2 — pay {priceLabel}</div>
                  <PayButton
                    amountUsdc={file.priceUsdc}
                    treasuryAddress={treasury}
                    disabled={!treasury || !isConnected}
                    verify={async (txHash) => {
                      const res = await api.claimPaidFile(file.slug, txHash);
                      setDownloadUrl(res.data.downloadUrl);
                    }}
                    onSuccess={() => track('paid_file_bought', { slug: file.slug, price: file.priceUsdc })}
                  />
                </div>
              )}

              {downloadUrl && (
                <div className="brf-form">
                  <div className="brf-step">Paid — your download is ready</div>
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
