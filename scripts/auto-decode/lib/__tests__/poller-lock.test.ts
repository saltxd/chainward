// scripts/auto-decode/lib/__tests__/poller-lock.test.ts
//
// The lock is an OS lock (flock) held by a helper process for as long as the
// poller lives. It needs python3, which the ops host and macOS both have.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { acquirePollerLock, type PollerLock } from '../poller-lock';

const dirs: string[] = [];
const held: PollerLock[] = [];
const lockPath = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'cw-lock-'));
  dirs.push(dir);
  return join(dir, 'poller.lock');
};
const take = async (path: string): Promise<PollerLock | null> => {
  const lock = await acquirePollerLock(path);
  if (lock) held.push(lock);
  return lock;
};
afterEach(async () => {
  for (const l of held.splice(0)) await l.release();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('acquirePollerLock', () => {
  it('lets one holder in at a time, and again after a release', async () => {
    const path = lockPath();
    const first = await take(path);
    expect(first).not.toBeNull();
    expect(await take(path)).toBeNull();
    await first!.release();
    const again = await take(path);
    expect(again).not.toBeNull();
  });

  it('two pollers racing for it: exactly one wins', async () => {
    const path = lockPath();
    const results = await Promise.all([take(path), take(path), take(path), take(path)]);
    expect(results.filter((r) => r !== null)).toHaveLength(1);
  });

  it('is freed by the OS when the holder dies, with no pid file to go stale', async () => {
    const path = lockPath();
    const first = await take(path);
    expect(first).not.toBeNull();
    first!.kill(); // the holder is killed without a release
    await new Promise((r) => setTimeout(r, 300));
    expect(await take(path)).not.toBeNull();
  });

  it('is not fooled by a leftover file: junk, a live pid or an empty file do not hold it', async () => {
    for (const junk of ['not a pid', String(process.pid), '']) {
      const path = lockPath();
      writeFileSync(path, junk);
      const lock = await take(path);
      expect(lock).not.toBeNull();
      await lock!.release();
    }
  });
});

describe('acquirePollerLock: a missing directory is not contention', () => {
  it('creates the lock directory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cw-lock-'));
    dirs.push(dir);
    const lock = await take(join(dir, 'a', 'b', 'poller.lock'));
    expect(lock).not.toBeNull();
  });

  it('reports a path it cannot use as an error, not as another poller', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cw-lock-'));
    dirs.push(dir);
    const file = join(dir, 'plain-file');
    writeFileSync(file, 'x');
    await expect(acquirePollerLock(join(file, 'poller.lock'))).rejects.toThrow(/poller lock/);
  });
});

