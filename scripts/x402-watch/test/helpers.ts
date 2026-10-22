import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProbeRecord } from '../src/probe.js';
import type { TokenBook } from '../src/tokens.js';

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));

/**
 * Real 402s from the Oct 21 outreach re-probe, scrubbed: hosts are api.example.com,
 * paths are generic, payTo, descriptions and extensions are replaced or dropped, and a
 * mistyped asset and a timestamp are swapped for made-up ones of the same kind.
 */
export function fixture(name: string): ProbeRecord {
  return JSON.parse(readFileSync(join(FIXTURES, 'probes', `${name}.json`), 'utf8')) as ProbeRecord;
}

export const FIXTURE_NAMES = readdirSync(join(FIXTURES, 'probes'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .sort();

/** Token facts for the fixtures' assets, read from public RPCs on 2026-10-21. */
export function tokens(): TokenBook {
  const book = JSON.parse(readFileSync(join(FIXTURES, 'tokens.json'), 'utf8')) as TokenBook;
  const now = new Date().toISOString();
  for (const f of Object.values(book)) f.checkedAt = now;
  return book;
}

/** A fixture as if it were requested at `at`. */
export function at(rec: ProbeRecord, iso: string): ProbeRecord {
  return { ...rec, sentAt: iso };
}
