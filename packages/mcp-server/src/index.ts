#!/usr/bin/env node
import { createServer } from './server.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'node:crypto';
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';

const TRANSPORT = (process.env.CHAINWARD_MCP_TRANSPORT ?? 'stdio').toLowerCase();
const PORT = Number(process.env.PORT ?? 3300);
const BASE_URL = process.env.CHAINWARD_API_URL ?? 'https://api.chainward.ai';
const API_KEY = process.env.CHAINWARD_API_KEY;

async function runStdio() {
  const server = createServer({ baseUrl: BASE_URL, apiKey: API_KEY });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`chainward-mcp: ready (stdio) — api=${BASE_URL}\n`);
}

async function runHttp() {
  const server = createServer({ baseUrl: BASE_URL, apiKey: API_KEY });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });
  await server.connect(transport);

  const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }
    if (req.url !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }
    try {
      let body: unknown;
      if (req.method === 'POST') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const raw = Buffer.concat(chunks).toString('utf-8');
        body = raw.length ? JSON.parse(raw) : undefined;
      }
      await transport.handleRequest(req, res, body);
    } catch (err) {
      process.stderr.write(`chainward-mcp: request error: ${(err as Error).message}\n`);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'internal' }));
      }
    }
  });

  httpServer.listen(PORT, () => {
    process.stderr.write(`chainward-mcp: ready (http) — listening on :${PORT}, api=${BASE_URL}\n`);
  });
}

const runner = TRANSPORT === 'http' ? runHttp : runStdio;
runner().catch((err) => {
  process.stderr.write(`chainward-mcp: fatal: ${(err as Error).message}\n`);
  process.exit(1);
});
