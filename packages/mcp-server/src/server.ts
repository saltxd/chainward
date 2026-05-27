import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  ChainWardClient,
  ChainWardApiError,
  type AgentEconomics,
  type AgentProfile,
  type DecodeRef,
  type LookupResult,
} from './client.js';

const walletSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Wallet must be a 0x-prefixed 40-hex-character address');

function asTextContent(payload: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function asError(err: unknown) {
  if (err instanceof ChainWardApiError) {
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: `ChainWard API error (${err.status}): ${err.message}`,
        },
      ],
    };
  }
  return {
    isError: true,
    content: [
      {
        type: 'text' as const,
        text: `Unexpected error: ${(err as Error)?.message ?? String(err)}`,
      },
    ],
  };
}

export interface CreateServerOptions {
  baseUrl?: string;
  apiKey?: string;
}

export function createServer(opts: CreateServerOptions = {}): McpServer {
  const client = new ChainWardClient(opts);

  const server = new McpServer({
    name: 'chainward',
    version: '0.1.0',
  });

  // ── Tool 1: lookup_agent ────────────────────────────────────────────────────
  server.tool(
    'lookup_agent',
    'Look up an Ethereum address on Base to see if ChainWard labels it as a known AI agent. Returns the label (name, framework), any ACP profile data, and pointers to published Decodes that mention this address. Use this BEFORE the user transacts with an unfamiliar address or token deployer.',
    { wallet: walletSchema },
    async ({ wallet }) => {
      try {
        const data = await client.get<LookupResult>(`/api/observatory/lookup/${wallet}`);
        return asTextContent(data);
      } catch (err) {
        return asError(err);
      }
    },
  );

  // ── Tool 2: get_agent_profile ───────────────────────────────────────────────
  server.tool(
    'get_agent_profile',
    'Fetch a full profile for a labeled agent on Base: identity, 24h/7d transaction stats, 7-day balance history (hourly buckets), 30-day gas history (daily), the most recent 20 transactions, and any related published Decodes. Returns 404 if ChainWard does not label this address. Heavier than lookup_agent — use when the user wants detail.',
    { wallet: walletSchema },
    async ({ wallet }) => {
      try {
        const data = await client.get<AgentProfile>(`/api/public/agents/${wallet}`);
        return asTextContent(data);
      } catch (err) {
        return asError(err);
      }
    },
  );

  // ── Tool 3: get_agent_economics ─────────────────────────────────────────────
  server.tool(
    'get_agent_economics',
    'Fetch ACP-derived economics for an agent: lifetime revenue, agentic gross dollar product (aGDP), job count, success rate, unique buyer count, 30-day on-chain gas cost, profit, and gas efficiency. Use when the user asks about agent revenue, profitability, or whether on-chain activity justifies a market cap.',
    { wallet: walletSchema },
    async ({ wallet }) => {
      try {
        const data = await client.get<AgentEconomics>(`/api/observatory/economics/${wallet}`);
        return asTextContent(data);
      } catch (err) {
        return asError(err);
      }
    },
  );

  // ── Tool 4: get_observatory_overview ────────────────────────────────────────
  server.tool(
    'get_observatory_overview',
    'Ecosystem-wide stats: total tracked agents, 24h transaction volume across all agents, gas burned, active-agent count, total portfolio value. Use when the user asks broad questions like "how active is the AI agent economy on Base?".',
    {},
    async () => {
      try {
        const data = await client.get<unknown>('/api/observatory');
        return asTextContent(data);
      } catch (err) {
        return asError(err);
      }
    },
  );

  // ── Tool 5: get_top_agents ──────────────────────────────────────────────────
  server.tool(
    'get_top_agents',
    'Ranked leaderboard of agents on Base by transaction volume / revenue / activity. Use when the user asks "who are the top agents?" or "show me the most active agents".',
    {},
    async () => {
      try {
        const data = await client.get<unknown>('/api/observatory/leaderboard');
        return asTextContent(data);
      } catch (err) {
        return asError(err);
      }
    },
  );

  // ── Tool 6: get_activity_feed ───────────────────────────────────────────────
  server.tool(
    'get_activity_feed',
    'Recent labeled-agent activity across the ecosystem. Use when the user asks "what is happening right now?" or wants a live feed.',
    {},
    async () => {
      try {
        const data = await client.get<unknown>('/api/observatory/feed');
        return asTextContent(data);
      } catch (err) {
        return asError(err);
      }
    },
  );

  // ── Tool 7: list_decodes ────────────────────────────────────────────────────
  server.tool(
    'list_decodes',
    'List every published ChainWard Decode (investigative article on agent on-chain behavior), newest first. Each entry includes title, subtitle, date, URL, and the addresses that decode mentions.',
    {},
    async () => {
      try {
        const data = await client.get<DecodeRef[]>('/api/public/decodes');
        return asTextContent(data);
      } catch (err) {
        return asError(err);
      }
    },
  );

  // ── Tool 8: find_decodes_for_address ────────────────────────────────────────
  server.tool(
    'find_decodes_for_address',
    'Find every published ChainWard Decode that references a given Ethereum address. Returns an array (possibly empty) of decode metadata + URL. Use when the user asks "has ChainWard written about 0x...?".',
    { wallet: walletSchema },
    async ({ wallet }) => {
      try {
        const data = await client.get<DecodeRef[]>(`/api/public/decodes/lookup/${wallet}`);
        return asTextContent(data);
      } catch (err) {
        return asError(err);
      }
    },
  );

  return server;
}
