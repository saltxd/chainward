const HANDLE_RE = /^[A-Za-z0-9_-]+$/; // mirrors auto-decode validators HANDLE_RE minus the leading @

export interface Candidate {
  name: string;
  walletAddress: string;
  proof: string;
}

export interface HeartbeatData {
  scanned: number;
  topJuice: number;
  candidate: string | null;
}

/** Candidate ping. Primary command = the 0x address (skips ACP name lookup → always valid).
 * @name command added only when name is a single safe token. NO <@id> mention (safety invariant). */
export function renderCandidate(c: Candidate): string {
  const addr = c.walletAddress.toLowerCase();
  const lines = [
    `🔭 **Decode candidate: ${c.name}**`,
    c.proof,
    '',
    'Ship it → send ONE of these to Claude_Dev (DM or @mention):',
    '```',
    `decode ${addr}`,
  ];
  if (HANDLE_RE.test(c.name)) lines.push(`decode @${c.name}`);
  lines.push('```');
  return lines.join('\n');
}

export function renderHeartbeat(d: HeartbeatData): string {
  return `🛰️ scout ran: ${d.scanned} scanned, top juice=${d.topJuice.toFixed(3)}, candidate=${d.candidate ?? 'none'}`;
}

export function renderFailure(stage: string, detail: string): string {
  return `⚠️ **decode-scout FAILED** at ${stage}: ${detail.slice(0, 300)}`;
}

/** POST to a Discord webhook. Returns true on 2xx. allowed_mentions.parse=[] => never pings anyone. */
export async function postDiscord(webhookUrl: string, content: string): Promise<boolean> {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
  });
  return res.ok;
}
