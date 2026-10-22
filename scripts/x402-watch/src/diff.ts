/**
 * Today's run against the last one, per endpoint and per buyer ("unit": the standard
 * buyer, and one per offer). An event only when a unit's outcome class changes:
 *
 * - breaks: it now fails (or answers no 402), and did not fail this way before;
 * - recovers: it failed, and now passes (or the failing offer is gone);
 * - changes: anything else that moved, like a price over the $1 cap.
 *
 * The first run for an endpoint only records a baseline: the free first check already
 * told the seller what fails.
 */
import { isBroken, verdictOf, type EndpointCheck, type Outcome } from './classify.js';

export interface UnitState {
  outcome: Outcome;
  detail: string;
  /** When this outcome was first seen. */
  since: string;
  /** The last run that saw it. */
  lastSeen: string;
}

export interface EndpointState {
  url: string;
  method: string;
  /** UTC day of the last request, so an endpoint is requested at most once a day. */
  lastProbedDay: string;
  units: Record<string, UnitState>;
}

export type EventKind = 'breaks' | 'recovers' | 'changes';

export interface WatchEvent {
  kind: EventKind;
  endpointKey: string;
  unitKey: string;
  prev: UnitState | null;
  /** null when the offer is no longer in the 402. */
  cur: { outcome: Outcome; detail: string } | null;
  at: string;
}

export const endpointKey = (method: string, url: string) => `${method.toUpperCase()} ${url}`;

export function transition(prev: Outcome, cur: Outcome): EventKind {
  if (isBroken(cur)) return 'breaks';
  if (isBroken(prev) && verdictOf(cur) === 'passes') return 'recovers';
  return 'changes';
}

/** Units the run could not see today because the 402 itself was unreadable or missing. */
function offersUnseen(cur: EndpointCheck): boolean {
  const std = cur.units.find((u) => u.key === 'standard');
  return !std || verdictOf(std.outcome) === 'down' || std.outcome === 'FAIL_NO_X402_CHALLENGE' || std.outcome === 'FAIL_V2_BODY_ONLY_NO_HEADER' || std.replay?.stage === 'parse';
}

export function diffEndpoint(prev: EndpointState | undefined, cur: EndpointCheck): { events: WatchEvent[]; next: EndpointState } {
  const at = cur.probe.sentAt;
  const key = endpointKey(cur.method, cur.url);
  const next: EndpointState = { url: cur.url, method: cur.method, lastProbedDay: at.slice(0, 10), units: {} };
  const events: WatchEvent[] = [];
  for (const u of cur.units) {
    const p = prev?.units[u.key];
    if (!p) {
      next.units[u.key] = { outcome: u.outcome, detail: u.detail, since: at, lastSeen: at };
      // A new offer that fails is news; everything else on a first sight is a baseline.
      if (prev && u.kind === 'offer' && isBroken(u.outcome)) {
        events.push({ kind: 'breaks', endpointKey: key, unitKey: u.key, prev: null, cur: { outcome: u.outcome, detail: u.detail }, at });
      }
      continue;
    }
    // Same class, or both passing (a valid payment, and one whose token domain the RPC couldn't read today).
    if (p.outcome === u.outcome || (verdictOf(p.outcome) === 'passes' && verdictOf(u.outcome) === 'passes')) {
      next.units[u.key] = { ...p, outcome: u.outcome, detail: u.detail, lastSeen: at };
      continue;
    }
    next.units[u.key] = { outcome: u.outcome, detail: u.detail, since: at, lastSeen: at };
    events.push({ kind: transition(p.outcome, u.outcome), endpointKey: key, unitKey: u.key, prev: p, cur: { outcome: u.outcome, detail: u.detail }, at });
  }
  if (prev) {
    const unseen = offersUnseen(cur);
    for (const [uk, p] of Object.entries(prev.units)) {
      if (next.units[uk]) continue;
      if (unseen) {
        // Not observable today: keep what we knew, so tomorrow compares against it.
        next.units[uk] = p;
        continue;
      }
      // The offer left the 402. Its failure is gone; a passing offer leaving is the seller's choice.
      if (isBroken(p.outcome)) events.push({ kind: 'recovers', endpointKey: key, unitKey: uk, prev: p, cur: null, at });
    }
  }
  return { events, next };
}
