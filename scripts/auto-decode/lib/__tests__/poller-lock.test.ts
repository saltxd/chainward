// scripts/auto-decode/lib/__tests__/poller-lock.test.ts
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { acquirePollerLock } from '../poller-lock';

const dirs: string[] = [];
const lockPath = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'cw-lock-'));
  dirs.push(dir);
  return join(dir, 'poller.lock');
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('acquirePollerLock', () => {
  it('lets one holder in, refuses a second while the first is alive, and frees on release', () => {
    const path = lockPath();
    const first = acquirePollerLock(path);
    expect(first).not.toBeNull();
    expect(readFileSync(path, 'utf8').trim()).toBe(String(process.pid));
    expect(acquirePollerLock(path)).toBeNull();
    first!.release();
    expect(existsSync(path)).toBe(false);
    const again = acquirePollerLock(path);
    expect(again).not.toBeNull();
    again!.release();
  });

  it('takes over a lock whose process is gone', () => {
    const path = lockPath();
    writeFileSync(path, '2147483646\n'); // no such pid
    const lock = acquirePollerLock(path);
    expect(lock).not.toBeNull();
    expect(readFileSync(path, 'utf8').trim()).toBe(String(process.pid));
    lock!.release();
  });

  it('treats a lock file with junk in it as stale, not as held forever', () => {
    const path = lockPath();
    writeFileSync(path, 'not a pid');
    const lock = acquirePollerLock(path);
    expect(lock).not.toBeNull();
    lock!.release();
  });

  it('does not delete a lock another process took over', () => {
    const path = lockPath();
    const lock = acquirePollerLock(path)!;
    writeFileSync(path, String(process.pid + 1) + '\n');
    lock.release();
    expect(existsSync(path)).toBe(true);
  });
});
