import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { quickDecode } from '../src/quick-decode.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'));

// Pinned reference time so activity windows are deterministic (matches quick-decode.test.ts;
// fixtures captured ~2026-04-30). NOTE: a few fixtures' newest transfers fall slightly AFTER
// this instant, so latest_transfer_age_hours can be negative — an artifact of the pinned
// reference, harmless to these assertions (they key off transfer counts + verdicts, not the
// sign of the age). Determinism comes from pinning `now`, not from the age sign.
const NOW = new Date('2026-04-30T12:00:00Z');

interface Golden {
  acp_id: number;
  name: string;
  wallet_type: string;
  survival: 'active' | 'at_risk' | 'dormant' | 'unknown';
  usdc_pattern: 'running' | 'accumulating' | 'graveyard' | 'inactive' | 'unknown';
  eth_wei: string;
  usdc_amount: number;
  transfers_24h: number;
  transfers_7d: number;
  transfers_30d: number;
  unique_counterparties_30d: number;
  transfers_fetched: number;
  // discrepancies asserted by CONTENT ({field, severity}) not just count — wrong-but-same-count
  // would otherwise slip through, and ACP-claim-vs-chain discrepancy correctness is the point.
  discrepancies: Array<{ field: string; severity: string }>;
}

// Human-verified expected outputs — each classification matches the fixture's filename
// semantics and is internally consistent (monotonic windows, sensible verdicts). These are
// NOT blind snapshots: they were reasoned about, not auto-accepted. transfers_fetched=50
// reflects fixtures captured under the OLD single-page fetch; the live path now paginates
// (Task 1 / fetch_meta). Adding a wallet: capture a fixture + add a verified row here.
const EXPECTED: Record<string, Golden> = {
  'axelrod-active': { acp_id: 129, name: 'Axelrod', wallet_type: 'erc1967_proxy', survival: 'active', usdc_pattern: 'running', eth_wei: '0', usdc_amount: 0, transfers_24h: 13, transfers_7d: 47, transfers_30d: 50, unique_counterparties_30d: 10, transfers_fetched: 50, discrepancies: [] },
  'ethy-borderline': { acp_id: 84, name: 'Ethy AI', wallet_type: 'erc1967_proxy', survival: 'at_risk', usdc_pattern: 'running', eth_wei: '0', usdc_amount: 0, transfers_24h: 2, transfers_7d: 4, transfers_30d: 49, unique_counterparties_30d: 13, transfers_fetched: 50, discrepancies: [] },
  'lucien-dormant': { acp_id: 59, name: 'Director Lucien', wallet_type: 'erc1967_proxy', survival: 'dormant', usdc_pattern: 'inactive', eth_wei: '0', usdc_amount: 0, transfers_24h: 0, transfers_7d: 0, transfers_30d: 3, unique_counterparties_30d: 3, transfers_fetched: 50, discrepancies: [{ field: 'isOnline', severity: 'warn' }] },
  'luna-dormant': { acp_id: 74, name: 'Luna', wallet_type: 'erc1967_proxy', survival: 'dormant', usdc_pattern: 'inactive', eth_wei: '0', usdc_amount: 0, transfers_24h: 0, transfers_7d: 0, transfers_30d: 0, unique_counterparties_30d: 0, transfers_fetched: 50, discrepancies: [{ field: 'isOnline', severity: 'warn' }] },
  'otto-active': { acp_id: 788, name: 'Otto AI - Trade Execution Agent', wallet_type: 'erc1967_proxy', survival: 'active', usdc_pattern: 'running', eth_wei: '0', usdc_amount: 0, transfers_24h: 35, transfers_7d: 50, transfers_30d: 50, unique_counterparties_30d: 7, transfers_fetched: 50, discrepancies: [] },
};

describe('Layer A — golden decode assertions (quickDecode struct)', () => {
  it.each(Object.entries(EXPECTED))('%s decodes to the verified struct', async (name, g) => {
    const result = await quickDecode({
      input: name,
      wallet_address: '0x' + '1'.repeat(40),
      job_id: 'golden',
      pipeline_version: 'golden',
      now: NOW,
      fixtures: fx(`${name}.json`),
      replayMode: true,
    });
    const d = result.data;

    // identity / parsing
    expect(d.target.acp_id).toBe(g.acp_id);
    expect(d.target.name).toBe(g.name);
    expect(d.wallet.type).toBe(g.wallet_type);

    // load-bearing verdicts
    expect(d.survival.classification).toBe(g.survival);
    expect(d.usdc_pattern).toBe(g.usdc_pattern);

    // balances (deterministic hex decode)
    expect(d.balances.eth.wei).toBe(g.eth_wei);
    expect(d.balances.usdc.amount).toBe(g.usdc_amount);

    // activity counts
    expect(d.activity.transfers_24h).toBe(g.transfers_24h);
    expect(d.activity.transfers_7d).toBe(g.transfers_7d);
    expect(d.activity.transfers_30d).toBe(g.transfers_30d);
    expect(d.activity.unique_counterparties_30d).toBe(g.unique_counterparties_30d);

    // fetch provenance
    expect(d.fetch_meta.transfers_fetched).toBe(g.transfers_fetched);
    expect(d.fetch_meta.transfers_truncated).toBe(false);

    // discrepancies (ACP claim vs chain reality) — by content, not just count
    expect(d.discrepancies.map((x) => ({ field: x.field, severity: x.severity }))).toEqual(g.discrepancies);

    // invariant: activity windows are monotonic
    expect(d.activity.transfers_24h).toBeLessThanOrEqual(d.activity.transfers_7d);
    expect(d.activity.transfers_7d).toBeLessThanOrEqual(d.activity.transfers_30d);

    // completeness: every load-bearing struct key is present
    for (const k of [
      'target', 'wallet', 'balances', 'activity', 'fetch_meta', 'claims',
      'chain_reality', 'discrepancies', 'survival', 'usdc_pattern', 'peers',
    ] as const) {
      expect(d[k]).toBeDefined();
    }
  });
});
