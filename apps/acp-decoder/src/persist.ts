import { sql } from 'drizzle-orm';

export interface PersistAcceptedInput {
  jobId: string;
  buyerWallet: string;
  targetInput: string;
  targetWallet: string;
  feeUsdc: number;
}

export interface PersistDeliveredInput {
  jobId: string;
  result: unknown;
}

export interface PersistRejectedInput {
  jobId: string;
  buyerWallet: string;
  targetInput: string;
  targetWallet: string;
  rejectReason: string;
}

export async function persistAccepted(db: any, input: PersistAcceptedInput): Promise<void> {
  await db.execute(sql`
    INSERT INTO decodes (job_id, buyer_wallet, target_input, target_wallet, tier, status, fee_usdc)
    VALUES (${input.jobId}, ${input.buyerWallet}, ${input.targetInput}, ${input.targetWallet}, 'quick', 'accepted', ${input.feeUsdc})
    ON CONFLICT (job_id) DO NOTHING
  `);
}

export async function persistDelivered(db: any, input: PersistDeliveredInput): Promise<void> {
  await db.execute(sql`
    UPDATE decodes
    SET status='delivered', result=${JSON.stringify(input.result)}::jsonb, delivered_at=now()
    WHERE job_id=${input.jobId}
  `);
}

export async function persistRejected(db: any, input: PersistRejectedInput): Promise<void> {
  await db.execute(sql`
    INSERT INTO decodes (job_id, buyer_wallet, target_input, target_wallet, tier, status, reject_reason)
    VALUES (${input.jobId}, ${input.buyerWallet}, ${input.targetInput}, ${input.targetWallet}, 'quick', 'rejected', ${input.rejectReason})
    ON CONFLICT (job_id) DO UPDATE SET status='rejected', reject_reason=EXCLUDED.reject_reason
  `);
}

export async function persistSettled(db: any, jobId: string): Promise<void> {
  await db.execute(sql`UPDATE decodes SET settled_at=now() WHERE job_id=${jobId}`);
}
