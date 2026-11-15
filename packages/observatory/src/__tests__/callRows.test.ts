import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type IORedis from 'ioredis';
import { createDb, type Database } from '@chainward/db';
import { ObservatoryService } from '../observatoryService.js';

// A contract call a wallet sent (an approval, a claim, a reverted call) is
// stored as a row with no token and a zero amount. It moved nothing: it is not
// a "latest transfer" on the public wire or the MCP feed, and it does not make
// an unnamed wallet one that "moved money" in the roster.

const TEST_DB_URL = process.env.TEST_DB_URL;

const NAMED = '0x1111111111111111111111111111111111111111';
const CLAIMER = '0x2222222222222222222222222222222222222222';
const CALLS_ONLY = '0x3333333333333333333333333333333333333333';
const UNNAMED_MOVER = '0x4444444444444444444444444444444444444444';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const REWARD = '0x5555555555555555555555555555555555555555';

const noCache = { get: async () => null, setex: async () => 'OK' } as unknown as IORedis;

const hash = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

// Needs a real Postgres (the behaviour under test is SQL). Each run gets its own
// database, so it cannot collide with other suites sharing TEST_DB_URL.
describe.skipIf(!TEST_DB_URL)('observatory feed and roster leave contract call rows out', () => {
  const dbName = `obs_call_rows_${Date.now()}_${process.pid}`;
  let admin: Database;
  let db: Database;
  let service: ObservatoryService;

  const row = (over: Record<string, unknown>) => ({
    direction: 'out',
    token_address: null,
    token_symbol: 'ETH',
    amount_raw: '0',
    amount_usd: '0.000000',
    gas_cost_usd: '0.000400',
    tx_type: 'approval',
    status: 'confirmed',
    ...over,
  });

  beforeAll(async () => {
    admin = createDb(TEST_DB_URL!);
    await admin.execute(sql.raw(`CREATE DATABASE "${dbName}"`));
    const url = new URL(TEST_DB_URL!);
    url.pathname = `/${dbName}`;
    db = createDb(url.toString());
    service = new ObservatoryService(db, noCache);

    await db.execute(sql`
      CREATE TABLE agent_registry (
        id serial PRIMARY KEY,
        wallet_address text NOT NULL,
        registry_source text,
        agent_name text,
        slug text,
        is_observatory boolean NOT NULL,
        is_public boolean NOT NULL
      )
    `);
    await db.execute(sql`
      CREATE TABLE transactions (
        timestamp timestamptz NOT NULL,
        wallet_address text NOT NULL,
        tx_hash text NOT NULL,
        direction text NOT NULL,
        token_address text,
        token_symbol text,
        amount_raw numeric(78, 0),
        amount_usd numeric(20, 6),
        gas_cost_usd numeric(20, 6),
        tx_type text,
        status text NOT NULL
      )
    `);
    await db.execute(sql`
      INSERT INTO agent_registry (wallet_address, registry_source, agent_name, slug, is_observatory, is_public) VALUES
        (${NAMED}, 'virtuals', 'Named Trader', 'named-trader', true, true),
        (${CLAIMER}, 'virtuals', 'Claimer', 'claimer', true, true),
        (${CALLS_ONLY}, 'erc8004', NULL, 'agent-3333aaaa', true, true),
        (${UNNAMED_MOVER}, 'erc8004', NULL, 'agent-4444bbbb', true, true)
    `);

    const rows = [
      // NAMED: an approval, then the USDC it sent.
      { timestamp: minutesAgo(10), wallet_address: NAMED, tx_hash: hash(1), ...row({}) },
      {
        timestamp: minutesAgo(9), wallet_address: NAMED, tx_hash: hash(2),
        ...row({ token_address: USDC, token_symbol: 'USDC', amount_raw: '12500000', amount_usd: '12.500000', tx_type: 'transfer' }),
      },
      // CLAIMER: a claim. The call row holds the gas; the reward token has no price.
      { timestamp: minutesAgo(8), wallet_address: CLAIMER, tx_hash: hash(3), ...row({ tx_type: 'contract_call' }) },
      {
        timestamp: minutesAgo(8), wallet_address: CLAIMER, tx_hash: hash(3),
        ...row({ direction: 'in', token_address: REWARD, token_symbol: 'RWD', amount_raw: '1000', amount_usd: null, gas_cost_usd: null, tx_type: 'contract_call' }),
      },
      // CALLS_ONLY: unnamed, only approvals and a reverted call.
      { timestamp: minutesAgo(7), wallet_address: CALLS_ONLY, tx_hash: hash(4), ...row({}) },
      { timestamp: minutesAgo(6), wallet_address: CALLS_ONLY, tx_hash: hash(5), ...row({ tx_type: 'contract_call', status: 'failed' }) },
      // UNNAMED_MOVER: unnamed, moved ETH.
      {
        timestamp: minutesAgo(5), wallet_address: UNNAMED_MOVER, tx_hash: hash(6),
        ...row({ amount_raw: '250000000000000000', amount_usd: '800.000000', tx_type: 'transfer' }),
      },
    ];
    for (const r of rows) {
      await db.execute(sql`
        INSERT INTO transactions (timestamp, wallet_address, tx_hash, direction, token_address, token_symbol,
          amount_raw, amount_usd, gas_cost_usd, tx_type, status)
        VALUES (${r.timestamp.toISOString()}, ${r.wallet_address}, ${r.tx_hash}, ${r.direction}, ${r.token_address},
          ${r.token_symbol}, ${r.amount_raw}, ${r.amount_usd}, ${r.gas_cost_usd}, ${r.tx_type}, ${r.status})
      `);
    }
  });

  afterAll(async () => {
    if (db) await db.$client.end();
    if (admin) {
      await admin.execute(sql.raw(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`));
      await admin.$client.end();
    }
  });

  it('does not count an unnamed wallet that only sent contract calls as one that moved money', async () => {
    const roster = await service['getRoster']();
    expect(roster.wallets).toEqual([NAMED, CLAIMER, UNNAMED_MOVER]);
  });

  it('shows no contract call row as a latest transfer', async () => {
    const feed = await service.getFeed();
    expect(feed.map((f) => [f.walletAddress, f.txHash, f.tokenSymbol])).toEqual([
      [UNNAMED_MOVER, hash(6), 'ETH'],
      [CLAIMER, hash(3), 'RWD'], // the token that came in, not "OUT ETH $0"
      [NAMED, hash(2), 'USDC'],
    ]);
  });
});
