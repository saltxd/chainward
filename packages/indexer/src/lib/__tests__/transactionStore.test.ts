import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb, type Database } from '@chainward/db';
import { insertTransactionIfNew, type TransactionInsert } from '../transactionStore.js';

const TEST_DB_URL = process.env.TEST_DB_URL;

const WALLET = '0x1111111111111111111111111111111111111111';
const OTHER_WALLET = '0x3333333333333333333333333333333333333333';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const SPAM_TOKEN = '0x4444444444444444444444444444444444444444';
const GAS = {
  gasUsed: 21_000,
  gasPriceGwei: '0.005000000',
  gasCostNative: '0.000000105000000000',
  gasCostUsd: '0.000300',
};
const NO_GAS = { gasUsed: null, gasPriceGwei: null, gasCostNative: null, gasCostUsd: null };

let n = 0;
/** A fresh transaction hash per test, so tests do not see each other's rows. */
const newTxHash = () => `0x${(++n).toString(16).padStart(8, '0')}${Date.now().toString(16).padStart(56, '0')}`;

const leg = (txHash: string, over: Partial<TransactionInsert> = {}): TransactionInsert => ({
  timestamp: new Date('2026-11-09T12:00:00.000Z'),
  chain: 'base',
  txHash,
  blockNumber: 55_000_000,
  walletAddress: WALLET,
  direction: 'out',
  counterparty: '0x2222222222222222222222222222222222222222',
  tokenAddress: null,
  tokenSymbol: 'ETH',
  tokenDecimals: 18,
  amountRaw: '250000000000000000',
  amountUsd: '800.000000',
  ...GAS,
  txType: 'transfer',
  status: 'confirmed',
  rawData: null,
  ...over,
});

const tokenLeg = (txHash: string, over: Partial<TransactionInsert> = {}) =>
  leg(txHash, {
    tokenAddress: USDC,
    tokenSymbol: 'USDC',
    tokenDecimals: 6,
    amountRaw: '12500000',
    amountUsd: '12.500000',
    txType: 'erc20_transfer',
    ...over,
  });

// Needs a real Postgres: the behaviour under test is SQL. Skipped unless TEST_DB_URL is
// set (CI sets it; locally, any throwaway Postgres 15+ works).
describe.skipIf(!TEST_DB_URL)('insertTransactionIfNew', () => {
  let db: Database;

  const gasRows = async (txHash: string, wallet = WALLET) => {
    const rows = await db.execute(sql`
      SELECT token_symbol, direction, gas_used, gas_price_gwei, gas_cost_native, gas_cost_usd
      FROM transactions
      WHERE tx_hash = ${txHash} AND wallet_address = ${wallet}
      ORDER BY ingested_at, token_symbol
    `);
    return rows as unknown as Array<{
      token_symbol: string;
      direction: string;
      gas_used: string | null;
      gas_price_gwei: string | null;
      gas_cost_native: string | null;
      gas_cost_usd: string | null;
    }>;
  };

  beforeAll(async () => {
    db = createDb(TEST_DB_URL!);
    // The production table is a TimescaleDB hypertable built by the migrations. This is
    // the same shape on plain Postgres, with the unique constraint from migration 0006.
    await db.transaction(async (trx) => {
      // CREATE TABLE IF NOT EXISTS prints a notice when the table is there already.
      await trx.execute(sql`SET LOCAL client_min_messages = warning`);
      await trx.execute(sql`
      CREATE TABLE IF NOT EXISTS transactions (
        timestamp timestamptz NOT NULL,
        chain text NOT NULL,
        tx_hash text NOT NULL,
        block_number bigint NOT NULL,
        wallet_address text NOT NULL,
        direction text NOT NULL,
        counterparty text,
        token_address text,
        token_symbol text,
        token_decimals smallint,
        amount_raw numeric(78, 0),
        amount_usd numeric(20, 6),
        gas_used bigint,
        gas_price_gwei numeric(20, 9),
        gas_cost_native numeric(30, 18),
        gas_cost_usd numeric(20, 6),
        tx_type text,
        method_id text,
        method_name text,
        contract_address text,
        protocol_name text,
        status text NOT NULL DEFAULT 'confirmed',
        is_agent_interaction boolean DEFAULT false,
        counterparty_agent_id bigint,
        raw_data jsonb,
        ingested_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT transactions_ingest_unique UNIQUE NULLS NOT DISTINCT (
          timestamp, chain, tx_hash, block_number, wallet_address, direction, status,
          counterparty, token_address, amount_raw, contract_address, method_id
        )
      )
    `);
    });
  });

  afterAll(async () => {
    if (db) await db.$client.end();
  });

  it('stores the first outbound leg of a transaction with its gas', async () => {
    const txHash = newTxHash();

    expect(await insertTransactionIfNew(db, leg(txHash))).toBe(true);

    const rows = await gasRows(txHash);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      gas_used: '21000',
      gas_cost_native: '0.000000105000000000',
      gas_cost_usd: '0.000300',
    });
  });

  it('counts the gas of a transaction once when the wallet sent ETH and a token in it', async () => {
    const txHash = newTxHash();

    expect(await insertTransactionIfNew(db, leg(txHash))).toBe(true);
    expect(await insertTransactionIfNew(db, tokenLeg(txHash))).toBe(true);

    const rows = await gasRows(txHash);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.gas_cost_native !== null)).toHaveLength(1);
    const second = rows.find((r) => r.token_symbol === 'USDC');
    expect(second).toMatchObject({
      gas_used: null,
      gas_price_gwei: null,
      gas_cost_native: null,
      gas_cost_usd: null,
    });
  });

  it('gives the gas to the outbound leg when an inbound leg of the same transaction came first', async () => {
    const txHash = newTxHash();

    await insertTransactionIfNew(db, tokenLeg(txHash, { direction: 'in', ...NO_GAS }));
    await insertTransactionIfNew(db, leg(txHash));

    const rows = await gasRows(txHash);
    expect(rows.find((r) => r.direction === 'out')?.gas_cost_native).toBe('0.000000105000000000');
    expect(rows.find((r) => r.direction === 'in')?.gas_cost_native).toBeNull();
  });

  it('keeps the gas on each wallet when two tracked wallets sent in the same transaction', async () => {
    const txHash = newTxHash();

    await insertTransactionIfNew(db, leg(txHash));
    await insertTransactionIfNew(db, leg(txHash, { walletAddress: OTHER_WALLET }));

    expect((await gasRows(txHash))[0]?.gas_cost_native).toBe('0.000000105000000000');
    expect((await gasRows(txHash, OTHER_WALLET))[0]?.gas_cost_native).toBe('0.000000105000000000');
  });

  it('keeps the gas on a later leg when the first outbound leg was stored without any', async () => {
    const txHash = newTxHash();

    await insertTransactionIfNew(db, tokenLeg(txHash, NO_GAS));
    await insertTransactionIfNew(db, leg(txHash));

    const rows = await gasRows(txHash);
    expect(rows.find((r) => r.token_symbol === 'ETH')).toMatchObject({
      gas_used: '21000',
      gas_cost_native: '0.000000105000000000',
      gas_cost_usd: '0.000300',
    });
  });

  // The first leg can be stored while the ETH price is unavailable: gas in ETH, no USD.
  // Every gas total sums the USD column, so a later leg has to keep the USD figure.
  it('keeps the USD gas on a later leg when the first leg has the gas without a USD price', async () => {
    const txHash = newTxHash();

    await insertTransactionIfNew(db, leg(txHash, { gasCostUsd: null }));
    await insertTransactionIfNew(db, tokenLeg(txHash));

    const rows = await gasRows(txHash);
    expect(rows.filter((r) => r.gas_cost_usd !== null)).toHaveLength(1);
    expect(rows.filter((r) => r.gas_cost_native !== null)).toHaveLength(1);
    expect(rows.find((r) => r.token_symbol === 'USDC')).toMatchObject({
      gas_used: null,
      gas_cost_native: null,
      gas_cost_usd: '0.000300',
    });
  });

  // Gas totals leave spam-token rows out. If a spam leg held the only copy of the gas,
  // the transaction's gas would vanish from every total.
  it('keeps the gas on a real leg when the leg stored before it is a spam token', async () => {
    const txHash = newTxHash();

    await insertTransactionIfNew(db, tokenLeg(txHash, { tokenAddress: SPAM_TOKEN, tokenSymbol: 'ÚSDС' }));
    await insertTransactionIfNew(db, leg(txHash));

    const rows = await gasRows(txHash);
    expect(rows.find((r) => r.token_symbol === 'ETH')?.gas_cost_usd).toBe('0.000300');
  });

  it('does not store the same leg twice', async () => {
    const txHash = newTxHash();

    expect(await insertTransactionIfNew(db, leg(txHash))).toBe(true);
    expect(await insertTransactionIfNew(db, leg(txHash))).toBe(false);

    expect(await gasRows(txHash)).toHaveLength(1);
  });
});
