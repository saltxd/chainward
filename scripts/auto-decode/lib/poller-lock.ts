// scripts/auto-decode/lib/poller-lock.ts
//
// One brief poller at a time. A chain-facts read takes minutes and cron starts a
// poller every few minutes; overlapping pollers would each pace their own public
// RPC requests and multiply the request rate.
//
// The lock is an OS lock (flock, exclusive, non-blocking) on a lock file. Node has
// no flock, so a small python3 helper takes it and holds it for as long as its
// stdin stays open: it exits, and the OS frees the lock, when the poller releases
// it, exits, crashes or is killed. There is no pid in the file to go stale or be
// reused, and the file's contents are never read. If python3 is missing the poll
// fails (it does not run unlocked).
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const HELPER = [
  'import fcntl, sys',
  'f = open(sys.argv[1], "a")',
  'try:',
  '    fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)',
  'except OSError:',
  '    print("busy", flush=True)',
  '    sys.exit(0)',
  'print("held", flush=True)',
  'sys.stdin.read()',
].join('\n');

export interface PollerLock {
  /** Frees the lock and waits for the helper to exit. */
  release: () => Promise<void>;
  /** Kills the helper without a release (tests: what a crash does). */
  kill: () => void;
}

/** The lock, or null when another poller holds it. Throws if the helper cannot run. */
export function acquirePollerLock(path: string): Promise<PollerLock | null> {
  return new Promise((resolve, reject) => {
    try {
      mkdirSync(dirname(path), { recursive: true });
    } catch (err) {
      reject(new Error(`poller lock: cannot create ${dirname(path)}: ${err instanceof Error ? err.message : String(err)}`));
      return;
    }
    const child: ChildProcess = spawn('python3', ['-I', '-c', HELPER, path], { stdio: ['pipe', 'pipe', 'pipe'] });
    let answer = '';
    let errText = '';
    child.stderr!.setEncoding('utf8');
    child.stderr!.on('data', (chunk: string) => {
      errText += chunk;
    });
    let settled = false;
    const exited = new Promise<void>((done) => child.once('close', () => done()));
    const finish = (result: PollerLock | null): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    child.once('error', (err) => {
      if (!settled) {
        settled = true;
        reject(new Error(`poller lock: cannot run python3: ${err.message}`));
      }
    });
    child.stdout!.setEncoding('utf8');
    child.stdout!.on('data', (chunk: string) => {
      answer += chunk;
      if (answer.includes('held')) {
        finish({
          release: async () => {
            child.stdin!.end();
            await exited;
          },
          kill: () => {
            child.kill('SIGKILL');
          },
        });
      } else if (answer.includes('busy')) {
        child.stdin!.end();
        finish(null);
      }
    });
    // The helper ended without saying "held" or "busy": it failed (a path it cannot open, no python3 module), which is not another poller.
    child.once('close', () => {
      if (settled) return;
      settled = true;
      const last = errText.trim().split('\n').pop() ?? '';
      reject(new Error(`poller lock: helper failed: ${last.slice(0, 200) || 'no answer'}`));
    });
  });
}
