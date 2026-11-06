import { describe, expect, it, vi } from 'vitest';
import { BASE_SWITCH_BLOCK, baseTimeOfBlock } from '@chainward/common';
import { type RpcLog, mapAlchemyTransfers, mapLogsToTransfers, sentinelWindowFromBlock, TRANSFER_TOPIC, addressTopic } from '../src/data-fetch.js';
import { fetchRpcFixtures, type RpcCall } from '../src/rpc-fixtures.js';

// Base went from 2 s to 200 ms blocks at block 53,556,127 (2026-11-05 18:00:01 UTC).
// Every conversion between Base blocks and time has to follow that schedule.

const DAY = 86_400;
const A = '0x1111111111111111111111111111111111111111';
const B = '0x2222222222222222222222222222222222222222';
const TOKEN = '0x3333333333333333333333333333333333333333';
const hex = (n: number) => '0x' + n.toString(16);
const pad = (a: string) => '0x' + a.toLowerCase().replace(/^0x/, '').padStart(64, '0');

function log(block: number): RpcLog {
  return { address: TOKEN, topics: [TRANSFER_TOPIC, pad(A), pad(B)], blockNumber: hex(block), transactionHash: '0xtx', logIndex: '0x0' };
}

describe('mapLogsToTransfers on Base', () => {
  const HEAD = 60_000_000;
  const headTs = 1_800_000_000;

  it('dates a log 432,000 blocks back as 1 day old', () => {
    const { items } = mapLogsToTransfers([log(HEAD - 432_000)], HEAD, headTs, 2000);
    expect(new Date(items[0]!.timestamp).getTime()).toBe((headTs - DAY) * 1000);
  });

  it('dates a log across the switch by both rates', () => {
    const head = BASE_SWITCH_BLOCK + 18_000; // 1 h after the switch
    const { items } = mapLogsToTransfers([log(BASE_SWITCH_BLOCK - 1_000)], head, headTs, 2000);
    expect(new Date(items[0]!.timestamp).getTime()).toBe((headTs - 3_600 - 2_000) * 1000);
  });

  it('still takes the measured rate a caller passes (BSC)', () => {
    const { items } = mapLogsToTransfers([log(150)], 200, 1_000_000, 2000, 0.45);
    expect(new Date(items[0]!.timestamp).getTime()).toBe(Math.round(1_000_000 - 50 * 0.45) * 1000);
  });
});

describe('mapAlchemyTransfers on Base', () => {
  it('dates a row without a block timestamp 1 day old when it is 432,000 blocks back', () => {
    const HEAD = 60_000_000;
    const headTs = 1_800_000_000;
    const row = { from: A, to: B, hash: '0xh', blockNum: hex(HEAD - 432_000), uniqueId: '0xh:log:0x1', rawContract: { address: TOKEN } };
    const { items } = mapAlchemyTransfers([row as never], HEAD, headTs);
    expect(new Date(items[0]!.timestamp).getTime()).toBe((headTs - DAY) * 1000);
  });
});

describe('sentinelWindowFromBlock', () => {
  it('starts 30 days back by the schedule', () => {
    const head = 60_000_000;
    const span = baseTimeOfBlock(head) - baseTimeOfBlock(sentinelWindowFromBlock(head));
    expect(span).toBeGreaterThanOrEqual(30 * DAY);
    expect(span - 30 * DAY).toBeLessThan(2);
  });
});

/** A fake Base node whose head is fresh; one inbound transfer `agoBlocks` before the scan's end. */
function fakeBaseNode(head: number, transferBlock: number) {
  const nowSec = Math.floor(Date.now() / 1000);
  const ranges: Array<[number, number]> = [];
  const rpcCall: RpcCall = vi.fn(async (_url, method, params) => {
    switch (method) {
      case 'eth_getBlockByNumber': {
        const tag = params[0] as string;
        if (tag === 'latest') return { number: hex(head), hash: '0x' + 'ab'.repeat(32), timestamp: hex(nowSec - 1) };
        return { number: tag, hash: '0x00', timestamp: hex(nowSec - 1) };
      }
      case 'eth_getLogs': {
        const f = params[0] as { fromBlock: string; toBlock: string; topics: (string | null)[] };
        const from = parseInt(f.fromBlock, 16);
        const to = parseInt(f.toBlock, 16);
        ranges.push([from, to]);
        if (f.topics[2] === addressTopic(A) && from <= transferBlock && transferBlock <= to) {
          return [{ ...log(transferBlock), topics: [TRANSFER_TOPIC, addressTopic(B), addressTopic(A)] }];
        }
        return [];
      }
      case 'eth_getCode':
        return '0x';
      case 'eth_getTransactionCount':
        return '0x1';
      case 'eth_getBalance':
        return '0x0';
      case 'eth_call':
        return '0x0';
      default:
        throw new Error(`unexpected ${method}`);
    }
  });
  return { rpcCall, ranges };
}

describe('fetchRpcFixtures (base)', () => {
  const rpcs = [{ url: 'https://primary.test', logChunkBlocks: 10_000 }];
  const opts = (rpcCall: RpcCall, windowDays: number) => ({ fetchTimeoutMs: 1000, rpcs, rpcCall, windowDays, explorerApiKey: null });

  it('scans a 1-day window as 432,000 blocks on 200 ms blocks and dates a transfer 1 day old', async () => {
    const head = 60_000_000;
    const node = fakeBaseNode(head, head - 2 - 432_000 + 1); // the oldest block of the window
    const fx = await fetchRpcFixtures('base', A, opts(node.rpcCall, 1));
    expect(fx.window.to_block).toBe(head - 2);
    expect(fx.window.to_block - fx.window.from_block + 1).toBe(432_000);
    expect(fx.window.block_seconds).toBeCloseTo(0.2, 6);
    expect(fx.blockscout_transfers.items).toHaveLength(1);
    const age = Date.now() - new Date(fx.blockscout_transfers.items[0].timestamp).getTime();
    expect(age).toBeGreaterThan((DAY - 5) * 1000);
    expect(age).toBeLessThan((DAY + 5) * 1000);
  }, 30_000);

  it('walks a window that crosses the switch with both rates', async () => {
    const head = BASE_SWITCH_BLOCK + 18_000 + 2; // the scan ends 1 h after the switch
    const node = fakeBaseNode(head, BASE_SWITCH_BLOCK - 5_000);
    const fx = await fetchRpcFixtures('base', A, opts(node.rpcCall, 1));
    const span = baseTimeOfBlock(fx.window.to_block) - baseTimeOfBlock(fx.window.from_block - 1);
    expect(span).toBeCloseTo(DAY, 0); // 18,000 fast blocks (1 h) + 41,400 slow blocks (23 h)
    expect(fx.window.to_block - fx.window.from_block + 1).toBe(18_000 + 41_400);
    expect(fx.window.days).toBe(1);
  }, 30_000);
});
