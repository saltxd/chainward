import { beforeEach, describe, expect, it, vi } from 'vitest';

// The label set as the API reads it: public, live labels only, looked up per request
// (no background work in the API process). A database error answers no labels; a
// private label, a tip, a removed or expired label never reaches a public answer.

const db = vi.hoisted(() => ({ rows: [] as unknown[], fail: false, inserted: [] as unknown[], conflict: null as unknown }));
vi.mock('../lib/db.js', () => {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'from']) q[m] = () => q;
  q.where = () => (db.fail ? Promise.reject(new Error('relation "wallet_labels" does not exist')) : Promise.resolve(db.rows));
  q.insert = () => ({
    values: (v: unknown) => {
      db.inserted.push(v);
      return { onConflictDoUpdate: async (c: unknown) => void (db.conflict = c) };
    },
  });
  return { getDb: () => q };
});

import { labelsFor, publicLabelsFor, recordSerialLauncher, rowToLabel } from '../lib/labels.js';

const A = `0x${'a'.repeat(40)}`;
const B = `0x${'b'.repeat(40)}`;
const NOW = new Date('2026-10-21T00:00:00Z');

function row(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    chain: 'base',
    address: A,
    kind: 'run_together',
    strength: 'strong',
    visibility: 'public',
    groupKey: 'ring-48',
    groupSize: 48,
    sentence: 'One of 48 wallets that appear to be run together in Set and Earn, from our decode.',
    sourceType: 'dataset',
    sourceRef: 'set-and-earn-week-one',
    sourceUrl: 'https://chainward.ai/decodes/set-and-earn-week-one',
    evidenceUrl: null,
    note: null,
    asOf: '2026-10-01',
    expiresAt: null,
    removedAt: null,
    removedReason: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

beforeEach(() => {
  db.rows = [];
  db.fail = false;
  db.inserted = [];
  db.conflict = null;
});

describe('rowToLabel', () => {
  it('reads a public label', () => {
    expect(rowToLabel(row(), NOW)).toMatchObject({ address: A, kind: 'run_together', strength: 'strong', visibility: 'public', group_size: 48, as_of: '2026-10-01' });
  });

  it.each([
    ['a private label', { visibility: 'private' }],
    ['a label from a tip', { sourceType: 'tip' }],
    ['a removed label', { removedAt: new Date('2026-10-02') }],
    ['an expired label', { expiresAt: new Date('2026-10-20') }],
    ['an unknown kind', { kind: 'scammer' }],
    ['an unknown strength', { strength: 'medium' }],
  ])('drops %s', (_case, over) => {
    expect(rowToLabel(row(over), NOW)).toBeNull();
  });
});

describe('publicLabelsFor', () => {
  it('answers the public labels by address, and never a private one even if the query returned it', async () => {
    db.rows = [row(), row({ address: B, visibility: 'private', sourceType: 'tip' })];
    const m = await publicLabelsFor('base', [A.toUpperCase().replace('0X', '0x'), B]);
    expect(m.get(A)).toHaveLength(1);
    expect(m.has(B)).toBe(false);
  });

  it('answers no labels when the table cannot be read', async () => {
    db.fail = true;
    expect((await publicLabelsFor('base', [A])).size).toBe(0);
    expect(await labelsFor(A, 'base')).toEqual([]);
  });

  it('asks nothing for no addresses', async () => {
    db.fail = true;
    expect((await publicLabelsFor('base', [])).size).toBe(0);
  });
});

describe('recordSerialLauncher', () => {
  const LAUNCHED = '2026-10-20T12:00:00.000Z';
  const check = (over: Record<string, unknown> = {}) => ({
    token: `0x${'7'.repeat(40)}`,
    flags: ['creator_serial_launcher'],
    launch: { tx: `0x${'1'.repeat(64)}`, token_admin: A, time: LAUNCHED },
    creator: { address: A, clanker_launches_24h: 97 },
    ...over,
  });

  it('labels the launch wallet of a serial launch, public, for 30 days from the launch', async () => {
    await recordSerialLauncher(check() as never, NOW);
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0]).toMatchObject({
      chain: 'base',
      address: A,
      kind: 'serial_launcher',
      strength: 'strong',
      visibility: 'public',
      sourceType: 'detector',
      sourceRef: 'rugcheck',
      sentence: 'Launched 97 tokens through Clanker in one day (seen 2026-10-20).',
      evidenceUrl: `https://basescan.org/tx/0x${'1'.repeat(64)}`,
      asOf: '2026-10-20',
      expiresAt: new Date('2026-11-19T12:00:00Z'),
    });
  });

  // Checking an old token must not make a fresh 30-day label out of old activity.
  it('writes nothing for a launch more than 30 days old', async () => {
    await recordSerialLauncher(check({ launch: { tx: `0x${'1'.repeat(64)}`, token_admin: A, time: '2026-09-01T00:00:00Z' } }) as never, NOW);
    expect(db.inserted).toHaveLength(0);
  });

  // A launch service sending launches for others would get its whole volume counted.
  it('writes nothing for a launch made for another admin, or with no admin read', async () => {
    await recordSerialLauncher(check({ launch: { tx: `0x${'1'.repeat(64)}`, token_admin: B, time: LAUNCHED } }) as never, NOW);
    await recordSerialLauncher(check({ launch: { tx: `0x${'1'.repeat(64)}`, token_admin: null, time: LAUNCHED } }) as never, NOW);
    expect(db.inserted).toHaveLength(0);
  });

  // A correction stays made: a re-detection refreshes the sentence and dates, never removed_at.
  it('updates a label it already wrote without undoing a removal', async () => {
    await recordSerialLauncher(check() as never, NOW);
    const set = Object.keys((db.conflict as { set: Record<string, unknown> }).set);
    expect(set).toEqual(expect.arrayContaining(['sentence', 'asOf', 'expiresAt']));
    expect(set.some((k) => /removed/i.test(k))).toBe(false);
  });

  it('writes nothing without the serial launcher flag', async () => {
    await recordSerialLauncher(check({ flags: ['new_creator'] }) as never, NOW);
    expect(db.inserted).toHaveLength(0);
  });
});
