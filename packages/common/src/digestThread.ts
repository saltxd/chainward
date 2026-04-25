// Renders a weekly digest summary into a Twitter-style thread (numbered tweets,
// each ≤280 chars) + a Discord embed payload.

export interface DigestSummary {
  weekStart: string;
  weekEnd: string;
  ecosystem: { totalRevenue: number; totalJobs: number; activeAgents: number };
  topEarners: Array<{ name: string; slug: string; revenue: number }>;
  movers: Array<{ name: string; slug: string; changePct: number }>;
}

export function renderDigestThread(d: DigestSummary): string[] {
  const tweets: string[] = [];

  const dateRange = `${d.weekStart.slice(0, 10)} → ${d.weekEnd.slice(0, 10)}`;

  // 1: Headline
  tweets.push(
    `📊 Base AI Agents — week of ${dateRange}\n\n` +
    `${d.ecosystem.activeAgents} active agents\n` +
    `${d.ecosystem.totalJobs.toLocaleString()} jobs\n` +
    `$${Math.round(d.ecosystem.totalRevenue).toLocaleString()} revenue\n\n` +
    `Full leaderboard: chainward.ai/base`,
  );

  // 2: Top earners
  if (d.topEarners.length > 0) {
    const lines = d.topEarners.slice(0, 5).map((e, i) =>
      `${i + 1}. ${e.name} — $${Math.round(e.revenue).toLocaleString()}`,
    );
    tweets.push(`💰 Top earners this week:\n\n${lines.join('\n')}`);
  }

  // 3: Movers
  if (d.movers.length > 0) {
    const ups = d.movers.filter((m) => m.changePct > 0).slice(0, 3);
    const downs = d.movers.filter((m) => m.changePct < 0).slice(0, 3);
    const sections: string[] = [];
    if (ups.length) {
      sections.push(`📈 Movers up:\n${ups.map((m) => `${m.name} +${m.changePct.toFixed(0)}%`).join('\n')}`);
    }
    if (downs.length) {
      sections.push(`📉 Movers down:\n${downs.map((m) => `${m.name} ${m.changePct.toFixed(0)}%`).join('\n')}`);
    }
    if (sections.length) tweets.push(sections.join('\n\n'));
  }

  // 4: Tail
  tweets.push(
    `Click any agent name on chainward.ai/base for full breakdown — health score, ` +
    `tx feed, gas analytics. Free + public.\n\n` +
    `🧵 end thread.`,
  );

  return tweets;
}

export function renderDigestDiscord(d: DigestSummary): {
  content: string;
  embeds: Array<Record<string, unknown>>;
} {
  const thread = renderDigestThread(d);
  return {
    content: '**Weekly digest ready — copy this thread to Twitter/Farcaster:**',
    embeds: thread.map((tweet, i) => ({
      title: `Tweet ${i + 1}/${thread.length}`,
      description: tweet,
      color: 0x4ade80,
    })),
  };
}
