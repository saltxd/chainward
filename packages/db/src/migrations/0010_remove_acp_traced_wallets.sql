-- Remove ACP fund flow traced wallets from agent_registry to stop balance polling
-- These were auto-inserted by the acpWalletTracer worker and are burning CUs
-- Also clean up any orphaned balance snapshots from these wallets

-- First, capture the wallet addresses for cleanup
DELETE FROM agent_registry
WHERE tags @> ARRAY['ACP fund flow trace']
  AND registry_source = 'acp-trace'
  AND user_id = '00000000-0000-0000-0000-000000000000';

-- Remove the repeatable job from BullMQ (handled by indexer restart with tracer disabled)
-- No further action needed — the indexer code change prevents re-creation
