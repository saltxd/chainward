// scripts/auto-decode/lib/poller-lock.ts
//
// One brief poller at a time. A chain-facts read takes minutes and cron starts a
// poller every few minutes; overlapping pollers would each pace their own public
// RPC requests and multiply the request rate. The lock is a file holding the
// holder's pid, created exclusively; a file whose pid is gone (or unreadable) is
// stale and taken over.
import { closeSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

export interface PollerLock {
  release: () => void;
}

function holderAlive(path: string): boolean {
  let pid: number;
  try {
    pid = Number(readFileSync(path, 'utf8').trim());
  } catch {
    return false;
  }
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: the process exists but is not ours.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** The lock, or null when another live poller holds it. */
export function acquirePollerLock(path: string): PollerLock | null {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(path, 'wx');
      closeSync(fd);
      writeFileSync(path, `${process.pid}\n`);
      return {
        release: () => {
          // Never delete a lock somebody else has taken over.
          try {
            if (readFileSync(path, 'utf8').trim() === String(process.pid)) rmSync(path, { force: true });
          } catch {
            /* already gone */
          }
        },
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      if (holderAlive(path)) return null;
      rmSync(path, { force: true }); // stale: its process is gone
    }
  }
  return null;
}
