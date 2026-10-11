import type { ReactNode } from 'react';
import { OG_FONT } from './fonts';
import { stampLines, type CardTone, type DecodeCardModel, type ReportCardModel } from './model';

/**
 * The share cards, drawn for satori (@vercel/og): the public pages' paper look.
 * Paper ground, ink text, oxblood accents, double hairline rules, mono labels,
 * and the answer as a rubber stamp. Satori lays out with flexbox only, so every
 * element with more than one child sets display: flex.
 */

export const OG_SIZE = {
  /** The site-wide default card (og:image on pages without their own). */
  default: { width: 1200, height: 630 },
  /** Report and decode cards: X's large-image ratio. */
  wide: { width: 1200, height: 675 },
} as const;

const PAPER = '#ece6da';
const INK = '#1b1815';
const INK_SOFT = '#4a4238';
const RULE_STRONG = '#bcb19b';
const OXBLOOD = '#7a2016';

/** Stamp ink per answer: seal green for Pay, amber for Hold, soft ink when there's too little to judge. */
export const TONE_COLOR: Record<CardTone, string> = {
  pay: '#2e5637',
  hold: '#8a5a12',
  unknown: INK_SOFT,
};

function Frame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: PAPER,
        color: INK,
        padding: '46px 64px 40px',
        fontFamily: OG_FONT.text,
      }}
    >
      {children}
    </div>
  );
}

function DoubleRule() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <div style={{ display: 'flex', width: '100%', height: 2, backgroundColor: INK }} />
      <div style={{ display: 'flex', width: '100%', height: 2, backgroundColor: INK, marginTop: 4 }} />
    </div>
  );
}

function Wordmark({ size }: { size: number }) {
  return (
    <div
      style={{
        display: 'flex',
        fontFamily: OG_FONT.display,
        fontWeight: 500,
        fontSize: size,
        letterSpacing: -0.4,
        color: INK,
        lineHeight: 1,
      }}
    >
      <span>ChainWard</span>
      <span style={{ color: OXBLOOD, fontStyle: 'italic' }}>.ai</span>
    </div>
  );
}

function MonoLabel({ children, color = INK_SOFT, size = 19 }: { children: ReactNode; color?: string; size?: number }) {
  return (
    <span
      style={{
        fontFamily: OG_FONT.mono,
        fontWeight: 500,
        fontSize: size,
        letterSpacing: size * 0.16,
        textTransform: 'uppercase',
        color,
      }}
    >
      {children}
    </span>
  );
}

function Masthead({ label }: { label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
      }}
    >
      <DoubleRule />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          marginTop: 22,
        }}
      >
        <Wordmark size={40} />
        <MonoLabel>{label}</MonoLabel>
      </div>
    </div>
  );
}

/** The space between masthead and footer, with the content centred in it. */
function Body({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        flex: 1,
        width: '100%',
        paddingBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function Footer({ left, right, rightSize = 26 }: { left?: string; right: string; rightSize?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <div style={{ display: 'flex', width: '100%', height: 2, backgroundColor: RULE_STRONG }} />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: left ? 'space-between' : 'flex-end',
          width: '100%',
          marginTop: 18,
        }}
      >
        {left && <MonoLabel>{left}</MonoLabel>}
        <span style={{ fontFamily: OG_FONT.mono, fontWeight: 700, fontSize: rightSize, color: INK }}>{right}</span>
      </div>
    </div>
  );
}

/** The answer as a rubber stamp: a heavy border, a thin inner one, a slight tilt. */
function Stamp({
  word,
  color,
  size = 'large',
  rotate = -4,
  sub,
}: {
  word: string;
  color: string;
  size?: 'large' | 'small';
  rotate?: number;
  sub?: string;
}) {
  const small = size === 'small';
  const lines = small ? [word] : stampLines(word);
  const longest = Math.max(...lines.map((l) => l.length));
  // Mono advance is about 0.6em, plus tracking: fit the longest line to the stamp's inner width.
  const fontSize = small ? 40 : Math.min(86, Math.floor(290 / (longest * 0.7)));
  const tracking = Math.round(fontSize * (small ? 0.12 : 0.1));
  return (
    <div
      style={{
        display: 'flex',
        transform: `rotate(${rotate}deg)`,
        border: `${small ? 4 : 5}px solid ${color}`,
        padding: small ? 4 : 5,
        color,
        ...(small ? {} : { width: 360 }),
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          // Fill the fixed-width large stamp. (On the small one, with no width to
          // fill, a zero flex basis makes satori measure the word one letter per line.)
          ...(small ? {} : { flex: 1 }),
          border: `2px solid ${color}`,
          padding: small ? '10px 18px 8px' : '18px 16px 14px',
        }}
      >
        {lines.map((line) => (
          <span
            key={line}
            style={{
              fontFamily: OG_FONT.mono,
              fontWeight: 700,
              fontSize,
              letterSpacing: tracking,
              // Tracking also trails the last letter; pad the front to keep the word centred.
              paddingLeft: tracking,
              lineHeight: 1.08,
              textTransform: 'uppercase',
            }}
          >
            {line}
          </span>
        ))}
        {sub && (
          <span
            style={{
              fontFamily: OG_FONT.mono,
              fontWeight: 500,
              fontSize: 15,
              letterSpacing: 5,
              paddingLeft: 5,
              marginTop: 12,
              textTransform: 'uppercase',
            }}
          >
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}

const HEADLINE = {
  fontFamily: OG_FONT.display,
  fontWeight: 500,
  letterSpacing: -0.6,
} as const;

/** The site-wide card: what ChainWard does, in one breath. */
export function DefaultCard() {
  return (
    <Frame>
      <Masthead label="Base · BNB Chain" />
      <Body>
        <span style={{ ...HEADLINE, fontSize: 68, lineHeight: 1.08 }}>About to pay or hire an AI agent?</span>
        <span style={{ ...HEADLINE, fontSize: 68, lineHeight: 1.08 }}>Paste its address first.</span>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            marginTop: 38,
          }}
        >
          <span style={{ ...HEADLINE, fontStyle: 'italic', fontSize: 48, color: OXBLOOD }}>Pay or Hold, and why. Free.</span>
          <div style={{ display: 'flex', alignItems: 'center', marginRight: 12 }}>
            <Stamp word="Pay" color={TONE_COLOR.pay} size="small" rotate={-6} />
            <div style={{ display: 'flex', marginLeft: 22 }}>
              <Stamp word="Hold" color={TONE_COLOR.hold} size="small" rotate={4} />
            </div>
          </div>
        </div>
      </Body>
      <Footer right="chainward.ai" rightSize={24} />
    </Frame>
  );
}

/** A report's card: the answer stamp, what it means, and the one reason. */
export function ReportCard({ card }: { card: ReportCardModel }) {
  if (card.kind === 'ask') return <AskCard short={card.short} chainName={card.chainName} />;
  return (
    <Frame>
      <Masthead label={`Free check · ${card.chainName}`} />
      <Body>
        <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
          <div style={{ display: 'flex', marginLeft: 6, marginRight: 46 }}>
            <Stamp word={card.word} color={TONE_COLOR[card.tone]} sub="Verdict · on-chain" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <span style={{ fontFamily: OG_FONT.mono, fontWeight: 500, fontSize: 25, color: INK_SOFT }}>
              {`Should you pay ${card.short}?`}
            </span>
            <span style={{ ...HEADLINE, fontSize: 50, lineHeight: 1.1, marginTop: 14, textWrap: 'balance' }}>
              {card.headline}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', marginTop: 44 }}>
          <MonoLabel color={OXBLOOD} size={18}>
            Why
          </MonoLabel>
          <span style={{ fontFamily: OG_FONT.text, fontWeight: 400, fontSize: 33, lineHeight: 1.3, marginTop: 8 }}>
            {card.reason}
          </span>
        </div>
      </Body>
      <Footer left={card.footnote} right="chainward.ai" />
    </Frame>
  );
}

/** No answer to show yet (no report, or one filed before verdicts): ask the question. */
function AskCard({ short, chainName }: { short: string; chainName: string }) {
  return (
    <Frame>
      <Masthead label={`Free check · ${chainName}`} />
      <Body>
        <span style={{ ...HEADLINE, fontSize: 84, lineHeight: 1.05, letterSpacing: -1 }}>Should you pay</span>
        <span style={{ fontFamily: OG_FONT.mono, fontWeight: 500, fontSize: 76, lineHeight: 1.15, letterSpacing: -1 }}>
          {`${short}?`}
        </span>
        <span style={{ ...HEADLINE, fontStyle: 'italic', fontSize: 44, color: OXBLOOD, marginTop: 30 }}>
          Free check: Pay or Hold, and why.
        </span>
      </Body>
      <Footer left="From its on-chain history" right="chainward.ai" />
    </Frame>
  );
}

/** A decode's card: headline, subtitle, date. */
export function DecodeCard({ card }: { card: DecodeCardModel }) {
  return (
    <Frame>
      <Masthead label={`Decode · ${card.dateLabel}`} />
      <Body>
        <span
          style={{
            ...HEADLINE,
            fontSize: card.titleSize,
            lineHeight: 1.08,
            letterSpacing: -card.titleSize / 80,
            textWrap: 'balance',
          }}
        >
          {card.title}
        </span>
        {card.subtitle && (
          <span
            style={{
              fontFamily: OG_FONT.text,
              fontWeight: 400,
              fontSize: 29,
              lineHeight: 1.35,
              color: INK_SOFT,
              marginTop: 26,
              textWrap: 'balance',
            }}
          >
            {card.subtitle}
          </span>
        )}
      </Body>
      <Footer left="Read from the chain" right={card.url} rightSize={22} />
    </Frame>
  );
}
