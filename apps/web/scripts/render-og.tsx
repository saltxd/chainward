/**
 * Renders the static share cards with the same components and fonts as the live
 * /api/.../og routes, so a static PNG and its route never drift apart.
 *
 *   pnpm --filter @chainward/web og:render default          public/chainward-og-card.png
 *   pnpm --filter @chainward/web og:render decodes [slug…]  public/decodes/<slug>/og.png
 *                                                            (no slugs: every decode that already has one)
 *   pnpm --filter @chainward/web og:render all              both of the above
 *   pnpm --filter @chainward/web og:render preview <dir>    sample report, decode and default cards into <dir>
 *
 * Runs from apps/web (the pnpm filter does that): fonts and decodes resolve from process.cwd().
 */
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ReactElement } from 'react';
import type { RiskReport } from '../src/lib/api';
import { getDecodeBySlug } from '../src/lib/decodes';
import { DecodeCard, DefaultCard, OG_SIZE, ReportCard } from '../src/lib/og/cards';
import { decodeCard, reportCard } from '../src/lib/og/model';
import { cardResponse } from '../src/lib/og/render';

const PUBLIC_DIR = join(process.cwd(), 'public');

async function renderTo(path: string, element: ReactElement, size: { width: number; height: number }): Promise<void> {
  const res = await cardResponse(element, size);
  const png = Buffer.from(await res.arrayBuffer());
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, png);
  console.log(`[og] wrote ${path.replace(`${process.cwd()}/`, '')} (${Math.round(png.length / 1024)} KB)`);
}

function staticDecodeSlugs(): string[] {
  const dir = join(PUBLIC_DIR, 'decodes');
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'og.png')))
    .map((d) => d.name)
    .sort();
}

async function renderDefault(): Promise<void> {
  await renderTo(join(PUBLIC_DIR, 'chainward-og-card.png'), <DefaultCard />, OG_SIZE.default);
}

async function renderDecodes(slugs: string[]): Promise<void> {
  const list = slugs.length > 0 ? slugs : staticDecodeSlugs();
  for (const slug of list) {
    const decode = getDecodeBySlug(slug);
    if (!decode) throw new Error(`no published decode with slug "${slug}"`);
    await renderTo(join(PUBLIC_DIR, 'decodes', slug, 'og.png'), <DecodeCard card={decodeCard(decode.meta)} />, OG_SIZE.wide);
  }
}

function sampleReport(verdict: RiskReport['verdict'], over: Partial<RiskReport> = {}, window: Record<string, unknown> = {}): RiskReport {
  return {
    address: '0x4baadba26c3c0bdef9e8faf173925d463aa53bb2',
    chain: 'base',
    verdict,
    band: 'low-signal',
    flags: [],
    not_assessed: [],
    freshness: { as_of_block: 1, generated_at: new Date().toISOString(), ttl_state: 'fresh' },
    coverage: {
      checks: [],
      window: {
        transfers_scanned: 242,
        transfers_truncated: false,
        transfers_30d: 242,
        unique_counterparties_30d: 10,
        latest_transfer_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
        sent_tx_count: 117,
        wallet_type: 'eoa',
        survival: 'active',
        ...window,
      },
    },
    classifier_version: 'preview',
    view_count: 0,
    disclaimer: '',
    ...over,
  } as RiskReport;
}

async function renderPreview(dir: string): Promise<void> {
  const address = '0x4baadba26c3c0bdef9e8faf173925d463aa53bb2';
  const samples: Record<string, RiskReport | null> = {
    pay: sampleReport({ label: 'pay', text: 'Pay', reason: 'Active.', limits: '' }),
    hold: sampleReport(
      { label: 'hold', text: 'Hold', reason: 'Stranded USDC.', limits: '' },
      {
        flags: [
          {
            id: 'stranded_value',
            severity: 'high',
            title: 'USDC balance held in a dormant wallet',
            evidence: 'Holds 5451.386272 USDC while classified dormant.',
            source: '',
          },
        ],
      },
      { transfers_30d: 0, unique_counterparties_30d: 0, latest_transfer_at: null },
    ),
    inactive: sampleReport(
      { label: 'unknown', text: 'Unknown', reason: 'No transfers.', limits: '' },
      {},
      { transfers_30d: 0, unique_counterparties_30d: 0, latest_transfer_at: null, sent_tx_count: 43 },
    ),
    'no-track-record': sampleReport(
      { label: 'unknown', text: 'Unknown', reason: 'No transfers.', limits: '' },
      {},
      { transfers_30d: 0, unique_counterparties_30d: 0, latest_transfer_at: null, sent_tx_count: 0 },
    ),
    ask: null,
  };
  for (const [name, report] of Object.entries(samples)) {
    await renderTo(join(dir, `report-${name}.png`), <ReportCard card={reportCard(report, address, 'Base')} />, OG_SIZE.wide);
  }
  const [first] = staticDecodeSlugs();
  const decode = first ? getDecodeBySlug(first) : null;
  if (decode) await renderTo(join(dir, 'decode.png'), <DecodeCard card={decodeCard(decode.meta)} />, OG_SIZE.wide);
  await renderTo(join(dir, 'default.png'), <DefaultCard />, OG_SIZE.default);
}

const [command, ...rest] = process.argv.slice(2);
switch (command) {
  case 'default':
    await renderDefault();
    break;
  case 'decodes':
    await renderDecodes(rest);
    break;
  case 'all':
    await renderDefault();
    await renderDecodes([]);
    break;
  case 'preview':
    if (!rest[0]) throw new Error('usage: og:render preview <dir>');
    await renderPreview(rest[0]);
    break;
  default:
    console.error('usage: og:render default | decodes [slug…] | all | preview <dir>');
    process.exit(2);
}
