import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';

// api.chainward.ai/mcp: the MCP server over Streamable HTTP, so agent
// marketplaces (Dolphin probes an ERC-8004 agent's MCP endpoint before listing
// it) and MCP clients can connect by URL instead of installing the npm package.
const HEADERS = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };

async function rpc(body: unknown): Promise<{ status: number; json: any }> {
  const app = createApp({ corsOrigins: ['https://chainward.ai'], x402Check: null });
  const res = await app.request('/mcp', { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });
  const text = await res.text();
  // A stream answer carries the JSON-RPC message on a "data:" line.
  const payload = text.startsWith('{') ? text : (text.split('\n').find((l) => l.startsWith('data: ')) ?? 'data: null').slice(6);
  return { status: res.status, json: JSON.parse(payload) };
}

describe('POST /mcp', () => {
  it('answers initialize as the chainward MCP server', async () => {
    const { status, json } = await rpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'probe', version: '0' } },
    });
    expect(status).toBe(200);
    expect(json.result.serverInfo.name).toBe('chainward');
    expect(json.result.capabilities.tools).toBeDefined();
  });

  it('lists its tools without a session, as a marketplace probe does', async () => {
    const { status, json } = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    expect(status).toBe(200);
    const names = json.result.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(expect.arrayContaining(['check_counterparty', 'lookup_agent']));
  });
});
