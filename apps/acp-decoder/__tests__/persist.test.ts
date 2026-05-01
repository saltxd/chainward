import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { persistAccepted, persistDelivered, persistRejected } from '../src/persist.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DB_URL = process.env.TEST_DB_URL ?? 'postgres://test:test@localhost:5433/chainward_test';
let sql: ReturnType<typeof postgres>;

beforeAll(async () => {
  sql = postgres(TEST_DB_URL);
  // Apply migration 0014
  await sql.unsafe(
    readFileSync(
      join(__dirname, '../../../packages/db/src/migrations/0014_decodes_table.sql'),
      'utf8',
    ),
  );
});

afterAll(async () => { if (sql) await sql.end(); });

describe('persist', () => {
  it('persistAccepted is idempotent on job_id collision', async () => {
    const db = drizzle(sql);
    await persistAccepted(db, { jobId: 'idem-1', buyerWallet: '0xb', targetInput: '@x', targetWallet: '0xt', feeUsdc: 25 });
    await persistAccepted(db, { jobId: 'idem-1', buyerWallet: '0xb', targetInput: '@x', targetWallet: '0xt', feeUsdc: 25 });
    const rows = await sql`SELECT count(*) FROM decodes WHERE job_id='idem-1'`;
    expect(parseInt(rows[0]!.count as string)).toBe(1);
  });

  it('persistDelivered updates status and result', async () => {
    const db = drizzle(sql);
    await persistAccepted(db, { jobId: 'd-1', buyerWallet: '0xb', targetInput: '@y', targetWallet: '0xt2', feeUsdc: 25 });
    await persistDelivered(db, { jobId: 'd-1', result: { foo: 'bar' } });
    const rows = await sql`SELECT status, result FROM decodes WHERE job_id='d-1'`;
    expect(rows[0]!.status).toBe('delivered');
    expect(rows[0]!.result).toEqual({ foo: 'bar' });
  });

  it('persistRejected sets status=rejected with reason', async () => {
    const db = drizzle(sql);
    await persistRejected(db, { jobId: 'r-1', buyerWallet: '0xb', targetInput: '@z', targetWallet: '0xt3', rejectReason: 'invalid_address' });
    const rows = await sql`SELECT status, reject_reason FROM decodes WHERE job_id='r-1'`;
    expect(rows[0]!.status).toBe('rejected');
    expect(rows[0]!.reject_reason).toBe('invalid_address');
  });
});
