/**
 * Lite-Agent REST API client for claw-api.virtuals.io.
 *
 * Self-hosted (lite) agents authenticate with LITE_AGENT_API_KEY via x-api-key header.
 * All on-chain operations (accept, reject, deliver) are handled server-side by Virtuals —
 * no wallet private key is required in application code.
 *
 * Endpoint reference (from acp-service-brief.md + empirical discovery):
 *   POST /acp/providers/jobs/{id}/accept
 *   POST /acp/providers/jobs/{id}/reject
 *   POST /acp/providers/jobs/{id}/requirement
 *   POST /acp/providers/jobs/{id}/deliverable
 */

import { logger } from './logger.js';

export interface AcpApiConfig {
  clawApiHost: string;
  liteAgentApiKey: string;
}

export class AcpApi {
  private readonly base: string;
  private readonly headers: Record<string, string>;

  constructor(config: AcpApiConfig) {
    this.base = config.clawApiHost.replace(/\/$/, '');
    this.headers = {
      'Content-Type': 'application/json',
      'x-api-key': config.liteAgentApiKey,
    };
  }

  private async post(path: string, body?: unknown): Promise<void> {
    const url = `${this.base}${path}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!resp.ok) {
      let detail = '';
      try {
        const text = await resp.text();
        detail = text.slice(0, 300);
      } catch {
        // ignore parse errors
      }
      throw new Error(`ACP API ${path} → HTTP ${resp.status}: ${detail}`);
    }
  }

  /** Accept the job at REQUEST phase, transitioning it to NEGOTIATION. */
  async accept(jobId: string): Promise<void> {
    logger.info({ jobId }, 'acp: accept');
    await this.post(`/acp/providers/jobs/${jobId}/accept`);
  }

  /**
   * Reject the job. Accepted at REQUEST or NEGOTIATION phase.
   * reason is logged and sent to the platform for buyer visibility.
   */
  async reject(jobId: string, reason: string): Promise<void> {
    logger.info({ jobId, reason }, 'acp: reject');
    await this.post(`/acp/providers/jobs/${jobId}/reject`, { reason });
  }

  /**
   * Send a payment requirement to the buyer at NEGOTIATION phase.
   * The platform locks the quoted amount in escrow; the job transitions to TRANSACTION
   * once the buyer pays.
   */
  async requirement(jobId: string, opts: Record<string, unknown>): Promise<void> {
    logger.info({ jobId }, 'acp: requirement');
    await this.post(`/acp/providers/jobs/${jobId}/requirement`, opts);
  }

  /**
   * Deliver the result payload for a job in TRANSACTION phase.
   * payload must be a JSON-serialisable value; the platform wraps it in the deliverable envelope.
   */
  async deliver(jobId: string, payload: unknown): Promise<void> {
    logger.info({ jobId }, 'acp: deliver');
    await this.post(`/acp/providers/jobs/${jobId}/deliverable`, { deliverable: payload });
  }
}
