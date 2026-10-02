import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { Agent, fetch } from 'undici';
import { logger } from './logger.js';

// ─── Background ───────────────────────────────────────────────────────────────
//
// Alert delivery POSTs to URLs that users type in (generic webhook, Discord
// webhook). Those requests leave from inside the cluster, so every one of them
// has to be kept off cluster, LAN and tailnet addresses.
//
// Checking the URL once up front isn't enough: a resolve-then-fetch pair does
// two DNS lookups, and a hostile resolver can answer the second one with
// 10.x (rebinding), or return [public, private] and let the socket pick.
// So the address check lives in the connector itself — `guardedLookup` is the
// only resolver the delivery Agent uses, every address it returns is checked,
// and the socket connects to exactly what was checked. Redirects are refused
// outright, since a 30x would hand the destination back to the remote server.
//
// This uses undici's own `fetch`, not the global one: Node's built-in fetch
// rejects a dispatcher from a different undici major ("invalid onError
// method"), and local dev runs a newer Node than the node:22 image.

/** A destination we refuse to deliver to. Not worth retrying. */
export class BlockedDestinationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlockedDestinationError';
  }
}

const BLOCKED_ADDRESSES = new BlockList();

// IPv4. net.BlockList also matches the IPv4-mapped IPv6 forms of these
// (::ffff:10.0.0.1 and ::ffff:a00:1), so they need no separate entries.
BLOCKED_ADDRESSES.addSubnet('0.0.0.0', 8, 'ipv4'); // "this network"
BLOCKED_ADDRESSES.addSubnet('10.0.0.0', 8, 'ipv4');
// CGNAT (RFC 6598) — Tailscale hands every tailnet node an address here, so
// without this line a webhook could reach the homelab through the node's
// tailscale interface exactly as easily as through 192.168.
BLOCKED_ADDRESSES.addSubnet('100.64.0.0', 10, 'ipv4');
BLOCKED_ADDRESSES.addSubnet('127.0.0.0', 8, 'ipv4');
BLOCKED_ADDRESSES.addSubnet('169.254.0.0', 16, 'ipv4'); // link-local, cloud metadata
BLOCKED_ADDRESSES.addSubnet('172.16.0.0', 12, 'ipv4');
BLOCKED_ADDRESSES.addSubnet('192.0.0.0', 24, 'ipv4'); // IETF protocol assignments
BLOCKED_ADDRESSES.addSubnet('192.168.0.0', 16, 'ipv4');
BLOCKED_ADDRESSES.addSubnet('198.18.0.0', 15, 'ipv4'); // benchmarking
BLOCKED_ADDRESSES.addSubnet('224.0.0.0', 3, 'ipv4'); // multicast + reserved + broadcast

// IPv6
BLOCKED_ADDRESSES.addSubnet('::', 96, 'ipv6'); // unspecified, loopback, deprecated IPv4-compatible
BLOCKED_ADDRESSES.addSubnet('64:ff9b::', 96, 'ipv6'); // NAT64 — embeds an IPv4 address we can't vouch for
BLOCKED_ADDRESSES.addSubnet('fc00::', 7, 'ipv6'); // unique local
BLOCKED_ADDRESSES.addSubnet('fe80::', 10, 'ipv6'); // link-local
BLOCKED_ADDRESSES.addSubnet('fec0::', 10, 'ipv6'); // deprecated site-local
BLOCKED_ADDRESSES.addSubnet('ff00::', 8, 'ipv6'); // multicast

/** Internal-only DNS suffixes: mDNS, k8s service names, the homelab zone. */
const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.svc', '.cluster.local', '.nox'];

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return true; // not an IP at all — refuse rather than guess
  return BLOCKED_ADDRESSES.check(address, family === 6 ? 'ipv6' : 'ipv4');
}

/** Hostname rules, applied before any DNS lookup. Accepts URL.hostname form. */
export function isBlockedHostname(rawHostname: string): boolean {
  const hostname = rawHostname.toLowerCase().replace(/\.+$/, '');
  const literal = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  if (isIP(literal)) return isBlockedAddress(literal);

  if (hostname === '' || hostname === 'localhost') return true;
  // Single-label names only resolve via search domains — i.e. in-cluster
  // service names like `redis` or `chainward-api`.
  if (!hostname.includes('.')) return true;
  return BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

/**
 * Static checks on a delivery URL: HTTPS only, and a hostname that isn't
 * internal or a private IP literal. Resolved addresses are checked at connect
 * time by `guardedLookup`; this catches what never reaches a resolver.
 */
export function validateDeliveryUrl(urlStr: string): void {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    throw new BlockedDestinationError('Webhook URL is not a valid URL');
  }

  if (url.protocol !== 'https:') {
    throw new BlockedDestinationError('Webhook URL must use HTTPS');
  }

  if (isBlockedHostname(url.hostname)) {
    throw new BlockedDestinationError('Webhook URL cannot point to a local, internal or private address');
  }
}

/**
 * `net.connect` lookup hook: resolve every address for the host and refuse the
 * connection if ANY of them is private/reserved, so neither rebinding nor a
 * mixed public+private answer can steer the socket inward.
 */
export const guardedLookup: LookupFunction = (hostname, options, callback) => {
  if (isBlockedHostname(hostname)) {
    callback(new BlockedDestinationError('Webhook host is local or internal'), '', 0);
    return;
  }

  dnsLookup(
    hostname,
    { all: true, family: options.family, hints: options.hints },
    (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => {
      if (err) {
        callback(err, '', 0);
        return;
      }

      const blocked = addresses.find((a) => isBlockedAddress(a.address));
      if (blocked || addresses.length === 0) {
        logger.warn(
          { host: hostname, address: blocked?.address ?? null },
          'Delivery blocked: host resolves to a private or reserved address',
        );
        // The address stays in our logs, not the error — this message ends up
        // in alert_events.delivery_error, which the user can read.
        callback(new BlockedDestinationError('Webhook host resolves to a private or reserved address'), '', 0);
        return;
      }

      if (options.all) {
        callback(null, addresses);
      } else {
        callback(null, addresses[0]!.address, addresses[0]!.family);
      }
    },
  );
};

/** The only dispatcher user-supplied delivery URLs are fetched through. */
const deliveryDispatcher = new Agent({
  connect: { lookup: guardedLookup, timeout: 10_000 },
});

export interface DeliveryRequest {
  method: 'POST';
  headers: Record<string, string>;
  body: string;
}

/**
 * One delivery attempt to a user-supplied (or Telegram) URL. Validates the
 * URL, connects only to checked public addresses, refuses redirects, and
 * throws on a non-2xx response.
 */
export async function deliveryFetch(url: string, request: DeliveryRequest): Promise<void> {
  validateDeliveryUrl(url);

  const response = await fetch(url, {
    ...request,
    dispatcher: deliveryDispatcher,
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });

  // Release the connection without reading a body we don't use (and that a
  // hostile endpoint could make arbitrarily large).
  await response.body?.cancel().catch(() => undefined);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
}

/**
 * Loggable form of a delivery URL. Telegram (`/bot<token>/…`) and Discord
 * (`/webhooks/<id>/<token>`) carry credentials in the path, and a user's own
 * webhook may too — so log the host only, plus Telegram's API method with the
 * token redacted.
 */
export function describeUrlForLog(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    if (url.hostname === 'api.telegram.org') {
      return url.host + url.pathname.replace(/\/bot[^/]*/, '/bot<redacted>');
    }
    return url.host;
  } catch {
    return '<invalid url>';
  }
}
