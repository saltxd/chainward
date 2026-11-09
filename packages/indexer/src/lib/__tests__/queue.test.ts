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
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : [];
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

  it('no indexer source builds a BullMQ Queue except through createQueue', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => !file.endsWith(join('lib', 'queue.ts')))
      .filter((file) => /new Queue\s*(<[^>]*>)?\s*\(/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});
