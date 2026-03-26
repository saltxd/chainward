import { lookup } from 'node:dns/promises';

/** Known-safe webhook domains (skip DNS resolution check) */
const ALLOWED_WEBHOOK_HOSTS = new Set([
  'api.telegram.org',
  'discord.com',
  'discordapp.com',
]);

/** Private/reserved IPv4 ranges */
const PRIVATE_RANGES = [
  { start: '10.0.0.0', end: '10.255.255.255' },
  { start: '172.16.0.0', end: '172.31.255.255' },
  { start: '192.168.0.0', end: '192.168.255.255' },
  { start: '127.0.0.0', end: '127.255.255.255' },
  { start: '169.254.0.0', end: '169.254.255.255' },
  { start: '0.0.0.0', end: '0.255.255.255' },
];

function ipToNum(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function isPrivateIp(ip: string): boolean {
  // Normalize IPv4-mapped IPv6 (e.g., ::ffff:127.0.0.1 → 127.0.0.1)
  if (ip.startsWith('::ffff:')) {
    ip = ip.slice(7);
  }
  // IPv6 loopback and private ranges
  if (ip === '::1' || ip === '::' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) {
    return true;
  }
  // Check IPv4 private ranges
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
    const num = ipToNum(ip);
    return PRIVATE_RANGES.some((r) => num >= ipToNum(r.start) && num <= ipToNum(r.end));
  }
  return false;
}

/**
 * Validate a webhook URL is safe to make outbound requests to.
 * Rejects private IPs, non-HTTPS, localhost, and internal hostnames.
 * Returns null if valid, or an error message string if invalid.
 */
export function validateWebhookUrl(urlStr: string): string | null {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    return 'Invalid URL';
  }

  if (url.protocol !== 'https:') {
    return 'Webhook URL must use HTTPS';
  }

  const hostname = url.hostname.toLowerCase();

  // Block localhost variants and IPv6 brackets with private IPs
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
    return 'Webhook URL cannot point to localhost';
  }

  // Block bracketed IPv6 private addresses (e.g., [::ffff:127.0.0.1])
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    const inner = hostname.slice(1, -1);
    if (isPrivateIp(inner)) {
      return 'Webhook URL cannot point to private IP addresses';
    }
  }

  // Block hostnames without dots (likely internal K8s service names)
  if (!hostname.includes('.')) {
    return 'Webhook URL must use a public domain';
  }

  // Block common internal TLDs
  if (hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.svc') || hostname.endsWith('.cluster')) {
    return 'Webhook URL cannot point to internal services';
  }

  // Check if it's a raw IP
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    if (isPrivateIp(hostname)) {
      return 'Webhook URL cannot point to private IP addresses';
    }
  }

  return null;
}

/**
 * Resolve DNS and verify the webhook URL doesn't resolve to a private IP.
 * Call this at delivery time to prevent DNS rebinding attacks.
 */
export async function validateWebhookUrlResolved(urlStr: string): Promise<string | null> {
  const staticError = validateWebhookUrl(urlStr);
  if (staticError) return staticError;

  const url = new URL(urlStr);
  const hostname = url.hostname;

  // Skip DNS check for known-safe hosts
  if (ALLOWED_WEBHOOK_HOSTS.has(hostname)) return null;

  // Skip DNS check for raw IPs (already validated above)
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return null;

  try {
    const result = await lookup(hostname);
    if (isPrivateIp(result.address)) {
      return 'Webhook URL resolves to a private IP address';
    }
  } catch {
    return 'Webhook URL hostname could not be resolved';
  }

  return null;
}
