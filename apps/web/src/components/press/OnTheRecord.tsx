/**
 * Outside proof on the homepage: who uses or cites the work, and where the paid
 * checks are listed. Every line links to something a reader can check; nothing
 * here implies an endorsement we can't show (no logos, no "as seen on").
 */
const ITEMS: { lead: string; href: string; rest: string }[] = [
  {
    lead: 'DefiLlama',
    href: 'https://github.com/DefiLlama/dimension-adapters/pull/9906',
    rest: " counts Bankr's fees with the on-chain adapter we wrote.",
  },
  {
    lead: 'SmartFlow Observatory',
    href: 'https://smartflowproai.substack.com/p/the-spread-by-seller-stack',
    rest: ' cited our count of x402 settlements on Base in Weekly #15.',
  },
  {
    lead: 'PayAPI Market',
    href: 'https://payapi.market/api/chainward-pay-hold-or-unknown-for-any-address',
    rest: ' verified our paid check with a settled payment.',
  },
  {
    lead: 'x402scan',
    href: 'https://www.x402scan.com/recipient/0xf7ee65130fb2b3bb42cc5cbfed085d7d482667cd',
    rest: ' lists every payment our checks have taken.',
  },
];

export function OnTheRecord() {
  return (
    <div className="otr">
      <span className="press-label otr-label">On the record</span>
      <ul className="otr-list">
        {ITEMS.map((i) => (
          <li key={i.href}>
            <a href={i.href} className="press-link" target="_blank" rel="noopener noreferrer">
              {i.lead}
            </a>
            {i.rest}
          </li>
        ))}
      </ul>
      <style>{`
        .otr { margin-top: 30px; padding-top: 18px; border-top: 1px solid var(--rule); }
        .otr-label { display: block; margin-bottom: 10px; }
        .otr-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
        .otr-list li { font-size: 16px; line-height: 1.5; color: var(--ink-soft); max-width: 46em; }
      `}</style>
    </div>
  );
}
