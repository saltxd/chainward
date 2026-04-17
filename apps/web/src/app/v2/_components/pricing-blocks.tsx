'use client';

import Link from 'next/link';

const plans = [
  {
    id: 'free',
    tag: 'start.here',
    name: 'Free',
    price: '$0',
    unit: 'forever',
    features: ['3 agents', '7-day history', 'All 7 alert types', 'Discord + Telegram', 'No credit card'],
    cta: './get-started',
    href: '/login',
    primary: true,
    disabled: false,
  },
  {
    id: 'operator',
    tag: 'coming.soon',
    name: 'Operator',
    price: '25 USDC',
    unit: 'per month · base',
    features: ['10 agents', '90-day history', 'All alert types', 'Webhook delivery', 'API + CLI access'],
    cta: 'waitlist.pending',
    href: '#',
    primary: false,
    disabled: true,
  },
  {
    id: 'brief',
    tag: 'one.time',
    name: 'Intel Brief',
    price: '99 USDC',
    unit: 'delivered in 48h',
    features: ['Fleet audit', 'Alert strategy setup', 'Gas optimization', 'Written report', '1:1 walkthrough'],
    cta: './request-brief',
    href: '/login',
    primary: false,
    disabled: false,
  },
];

export function PricingBlocks() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 16,
      }}
      className="v2-pricing-grid"
    >
      <style>{`
        @media (max-width: 880px) {
          .v2-pricing-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
      {plans.map((p) => (
        <div
          key={p.id}
          style={{
            border: p.primary
              ? '1px solid var(--phosphor)'
              : '1px solid var(--line-2)',
            padding: '28px 24px',
            background: p.primary
              ? 'linear-gradient(180deg, rgba(92,240,164,0.04), transparent)'
              : 'var(--bg-1)',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 380,
            opacity: p.disabled ? 0.6 : 1,
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: '0.14em',
              color: p.primary ? 'var(--phosphor)' : 'var(--muted)',
              marginBottom: 18,
            }}
          >
            // {p.tag}
          </div>
          <h3
            style={{
              fontSize: 22,
              fontWeight: 500,
              color: 'var(--fg)',
              letterSpacing: '-0.02em',
              marginBottom: 12,
            }}
          >
            {p.name}
          </h3>
          <div style={{ marginBottom: 24 }}>
            <span
              style={{
                fontSize: 36,
                fontWeight: 500,
                color: 'var(--fg)',
                letterSpacing: '-0.03em',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {p.price}
            </span>
            <div
              style={{
                fontSize: 11,
                color: 'var(--muted)',
                marginTop: 4,
                letterSpacing: '0.04em',
              }}
            >
              {p.unit}
            </div>
          </div>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              marginBottom: 28,
              flex: 1,
              fontSize: 13,
              color: 'var(--fg-dim)',
              lineHeight: 2.1,
            }}
          >
            {p.features.map((f) => (
              <li key={f} style={{ display: 'flex', gap: 12 }}>
                <span style={{ color: 'var(--phosphor)', width: 10 }}>›</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          {p.disabled ? (
            <div
              style={{
                padding: '12px 18px',
                border: '1px solid var(--line-2)',
                color: 'var(--muted)',
                fontSize: 12,
                textAlign: 'center',
                fontStyle: 'italic',
              }}
            >
              {p.cta}
            </div>
          ) : (
            <Link
              href={p.href}
              style={{
                padding: '12px 18px',
                background: p.primary ? 'var(--phosphor)' : 'transparent',
                color: p.primary ? 'var(--bg)' : 'var(--fg)',
                border: p.primary ? 'none' : '1px solid var(--line-2)',
                fontSize: 12,
                fontWeight: 600,
                textAlign: 'center',
                transition: 'all 0.15s',
              }}
              className="v2-pricing-cta"
            >
              {p.cta} →
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}
