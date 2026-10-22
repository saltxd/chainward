#!/usr/bin/env node
/**
 * x402-watch: a stock x402 buyer tries each paid endpoint once a day, never paying.
 *
 *   tsx src/cli.ts check <host-or-url>... [--method POST] [--body '{"q":1}'] [--force] [--home DIR]
 *   tsx src/cli.ts daily [--only SUBSCRIBER_ID] [--dry-run] [--home DIR]
 *
 * Reports are files under the home directory (default ~/.x402-watch). Nothing is sent.
 */
import { Store, defaultHome } from './store.js';
import { runCheck, runDaily } from './watch.js';

const HELP = `x402-watch: a stock x402 buyer (@x402/fetch and @x402/evm 2.27.0, default settings)
tries each paid endpoint once a day, without paying, and writes a report when one breaks
or recovers. Reports are files; nothing is sent.

  check <host-or-url>...   one-off report: a host (reads /.well-known/x402, then
                           /openapi.json), a discovery document URL, or endpoint URLs
      --method M           method for endpoint URLs (default GET)
      --body JSON          sample request body for POST endpoints (default {})
      --force              send a second request today (only when the seller asks)
  daily                    run the watch list in <home>/watchlist.json and write a
                           change report per subscriber under <home>/alerts/<day>/
      --only ID            one subscriber
      --dry-run            write reports under <home>/runs/<day>/dry-run/, keep the state
  --home DIR               state directory (default $X402_WATCH_HOME or ~/.x402-watch)
`;

interface Args {
  cmd: string | undefined;
  positional: string[];
  flags: Record<string, string | true>;
}

function parse(argv: string[]): Args {
  const flags: Record<string, string | true> = {};
  const positional: string[] = [];
  const valued = new Set(['method', 'body', 'home', 'only']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=', 2) as [string, string | undefined];
      if (v !== undefined) flags[k] = v;
      else if (valued.has(k)) flags[k] = argv[++i] ?? '';
      else flags[k] = true;
    } else positional.push(a);
  }
  return { cmd: positional.shift(), positional, flags };
}

async function main(): Promise<number> {
  const { cmd, positional, flags } = parse(process.argv.slice(2));
  const log = (line: string) => process.stderr.write(`${new Date().toISOString().slice(11, 19)} ${line}\n`);
  const store = new Store(typeof flags.home === 'string' && flags.home ? flags.home : defaultHome());
  if (cmd === 'check') {
    if (!positional.length) {
      process.stderr.write('check needs a host or URL\n');
      return 2;
    }
    const r = await runCheck(positional, {
      store,
      log,
      force: flags.force === true,
      ...(typeof flags.method === 'string' ? { method: flags.method } : {}),
      ...(typeof flags.body === 'string' ? { body: flags.body } : {}),
    });
    process.stdout.write(r.report);
    process.stdout.write(`\nreport: ${r.reportPath}\ndata:   ${r.jsonPath}\nrequests: ${r.requests.sent} sent, ${r.requests.reused} reused from earlier today\n`);
    return 0;
  }
  if (cmd === 'daily') {
    const r = await runDaily({ store, log, ...(typeof flags.only === 'string' ? { only: flags.only } : {}), dryRun: flags['dry-run'] === true });
    if (r.status === 'locked') {
      process.stdout.write('another daily run holds the lock; nothing done\n');
      return 0;
    }
    if (r.status === 'empty') {
      process.stdout.write('no active subscribers in the watch list\n');
      return 0;
    }
    const kinds = (k: string) => r.events.filter((e) => e.kind === k).length;
    process.stdout.write(
      `${r.day}: ${r.endpoints} endpoints, ${r.requests.sent} requests sent, ${r.requests.reused} reused; ` +
        `${kinds('breaks')} broke, ${kinds('recovers')} recovered, ${kinds('changes')} changed\n`,
    );
    for (const p of r.reports) process.stdout.write(`report ${p.subscriber}: ${p.path}\n`);
    if (r.notReported.length) process.stdout.write(`${r.notReported.length} change(s) with no break or recovery, recorded in ${r.summaryPath}\n`);
    return 0;
  }
  process.stdout.write(HELP);
  return cmd === undefined || cmd === 'help' || flags.help === true ? 0 : 2;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    process.stderr.write(`x402-watch: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  },
);
