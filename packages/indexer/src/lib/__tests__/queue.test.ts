import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUEUE_DEFAULT_JOB_OPTIONS, queueOptions } from '../queue.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.(c|m)?tsx?$/.test(path) && !/\.test\.(c|m)?tsx?$/.test(path) ? [path] : [];
  });
}

describe('indexer queues keep a bounded number of finished jobs', () => {
  // Redis runs with maxmemory 200 MB and noeviction: once full, every queue
  // write fails and indexing and alerts stop for every customer. A queue made
  // without defaultJobOptions keeps every completed and failed job forever.
  it('caps completed and failed jobs by count', () => {
    const { removeOnComplete, removeOnFail } = QUEUE_DEFAULT_JOB_OPTIONS;
    expect(removeOnComplete).toEqual({ count: 100 });
    expect(removeOnFail).toEqual({ count: 50 });
  });

  it('passes the caps to every queue it builds', () => {
    const connection = {} as never;
    const opts = queueOptions(connection);
    expect(opts.connection).toBe(connection);
    expect(opts.defaultJobOptions).toBe(QUEUE_DEFAULT_JOB_OPTIONS);
  });

  // Anything outside lib/queue.ts that could build a Queue without the caps:
  // a `new Queue(` (also `new bullmq.Queue(`), a value import of Queue (also
  // aliased, `Queue as Q`), or a namespace import of bullmq. `type Queue` is fine.
  function bypasses(source: string): string[] {
    const found: string[] = [];
    if (/new\s+(?:\w+\.)?Queue\s*(<[^>]*>)?\s*\(/.test(source)) found.push('new Queue');
    for (const m of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]bullmq['"]/g)) {
      const names = (m[1] ?? '').split(',').map((n) => n.trim());
      if (names.some((n) => /^Queue\b/.test(n))) found.push('value import of Queue');
    }
    if (/import\s*\*\s*as\s+\w+\s+from\s*['"]bullmq['"]/.test(source)) found.push('namespace import of bullmq');
    return found;
  }

  it('the bypass check flags every way around createQueue it knows', () => {
    expect(bypasses("const q = new Queue('x', { connection });")).toContain('new Queue');
    expect(bypasses("const q = new  Queue<Data>('x', { connection });")).toContain('new Queue');
    expect(bypasses("const q = new bullmq.Queue('x', { connection });")).toContain('new Queue');
    expect(bypasses("import { Worker, Queue as Q } from 'bullmq';")).toContain('value import of Queue');
    expect(bypasses("import * as bullmq from 'bullmq';")).toContain('namespace import of bullmq');
    expect(bypasses("import { Worker, type Queue, type Job } from 'bullmq';\nimport { createQueue } from '../lib/queue.js';")).toEqual([]);
  });

  it('no indexer source builds a BullMQ Queue except through createQueue', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => !file.endsWith(join('lib', 'queue.ts')))
      .map((file) => ({ file: relative(SRC, file), found: bypasses(readFileSync(file, 'utf8')) }))
      .filter(({ found }) => found.length > 0);
    expect(offenders).toEqual([]);
  });
});
