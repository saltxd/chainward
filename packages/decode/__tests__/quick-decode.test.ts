import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { quickDecode } from '../src/quick-decode.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const fx = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'));

describe('quickDecode (integration with replayMode)', () => {
  it('produces a complete QuickDecodeResult from Axelrod fixture', async () => {
    const result = await quickDecode({
      input: '@axelrod',
      wallet_address: '0x999A1B6033998A05F7e37e4BD471038dF46624E1',
      job_id: 'test-job-1',
      pipeline_version: 'test',
      now: new Date('2026-04-30T12:00:00Z'),
      fixtures: fx('axelrod-active.json'),
      replayMode: true,
    });

    expect(result.report).toMatch(/^# /);
    expect(result.data.survival.classification).toBe('active');
    expect(result.data.target.acp_id).toBe(129);
    expect(result.meta.schema_version).toBe('1.0.0');
    expect(result.meta.classifier_version).toBe('1.0.0');
    expect(result.meta.disclosure).toContain('aggregate intelligence');
    expect(result.sources.length).toBeGreaterThan(0);
  });

  it('produces a dormant classification from Lucien fixture', async () => {
    const result = await quickDecode({
      input: '@lucien',
      wallet_address: '0xeee9Cb0fafF1D9e7423BF87A341C70F58A1A0cc7',
      job_id: 'test-job-2',
      pipeline_version: 'test',
      now: new Date('2026-04-30T12:00:00Z'),
      fixtures: fx('lucien-dormant.json'),
      replayMode: true,
    });
    expect(result.data.survival.classification).toBe('dormant');
    expect(result.data.usdc_pattern === 'graveyard' || result.data.usdc_pattern === 'inactive').toBe(true);
  });
});

describe('quickDecode meta.as_of_block', () => {
  it('populates a non-zero block number and non-empty hash', async () => {
    const result = await quickDecode({
      input: '@axelrod',
      wallet_address: '0x999A1B6033998A05F7e37e4BD471038dF46624E1',
      job_id: 'block-test-1',
      pipeline_version: 'test',
      now: new Date('2026-04-30T12:00:00Z'),
      fixtures: {
        ...fx('axelrod-active.json'),
        sentinel_block: {
          number: '0x2a7d3cf', // 44621775 in hex
          hash: '0x9954b825e40a5fc0dac606b764924a27527843fc176cf8c8d2deb341945a1b8c',
        },
      },
      replayMode: true,
    });
    expect(result.meta.as_of_block.number).toBeGreaterThan(0);
    expect(result.meta.as_of_block.hash).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
