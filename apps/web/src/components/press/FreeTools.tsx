import Link from 'next/link';

// The two cheaper ways in, shown beside the Intel Brief under decodes and reports.
export function FreeTools() {
  return (
    <aside className="free-tools" aria-label="Free tools">
      <span className="press-label">Free tools</span>
      <div className="free-tools-row">
        <p>
          Screening wallets from your own code? The wallet screening API is free for 1,000 lookups a month.{' '}
          <Link href="/wallet-api" className="press-link">
            Get a free key →
          </Link>
        </p>
        <p>
          Paying rewards or an airdrop to a list of wallets? Send us the list first; the first 500 wallets of your first list are free.{' '}
          <Link href="/screen" className="press-link">
            Screen a list →
          </Link>
        </p>
      </div>
      <style>{`
        .free-tools {
          border: 1px solid var(--rule-strong);
          padding: 20px 24px;
          margin-top: 18px;
        }
        .free-tools-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 12px 28px;
          margin-top: 10px;
        }
        .free-tools-row p {
          margin: 0;
          font-size: 16px;
          line-height: 1.5;
        }
      `}</style>
    </aside>
  );
}
