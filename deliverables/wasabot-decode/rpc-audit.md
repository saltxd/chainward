# RPC Endpoint Audit Log

Investigation: Wasabot On-Chain Decode (Revised)
Date: April 13, 2026

---

## Summary

This decode had TWO verification passes:
1. **Agent pass** (subagent, killed after fabrication detected): ~8 sentinel calls + ~43 Blockscout calls
2. **Inline human-verified pass** (this document): 13 sentinel receipts + ~20 Blockscout discovery calls

Only the inline pass is authoritative. Agent-pass results are NOT cited in the published thread or decode article.

---

## No unauthorized endpoints contacted

All RPC calls went through approved infrastructure. No Alchemy, public Base RPC, or third-party fallback endpoints were used.

---

## Inline Verification Pass — Sentinel (cw-sentinel, http://localhost:8545)

### Health check
- `eth_blockNumber` — 1 call. Result: block 44,574,268
- `eth_getBlockByNumber("latest")` — 1 call. Result: block 44,575,804 (2026-04-11T20:55:55 UTC)
- `eth_syncing` — 1 call. Confirmed node syncing from 44,575,804 toward tip

### Proof 1: PaymentManager 80/20 split (5 receipts)
- `eth_getTransactionReceipt` × 5:
  - `0x4f42c3a5...` block 44,574,706
  - `0x245b65fa...` block 44,574,687
  - `0x2763a9c0...` block 44,574,668
  - `0x28dd79b1...` block 44,574,651
  - `0x667f1fb0...` block 44,574,626
- Decoded: USDC Transfer events from PaymentManager, confirmed 20/80 split + multi-agent pattern

### Proof 2: Perp pass-through architecture (1 receipt)
- `eth_getTransactionReceipt` × 1:
  - `0x2c010232...` block 44,574,123
- Decoded: $60 USDC in = $60 out, 2 Transfer events, zero skim

### Proof 3: Close-fee verification (6 receipts)
- `eth_getTransactionReceipt` × 6:
  - `0x3c667a16...` block 44,399,932 (fee rate 0.06%)
  - `0x6aea2a6a...` block 44,444,707 (fee rate 0.10%)
  - `0x34186181...` block 44,446,282 (fee rate 0.10%)
  - `0xdaeffa9f...` block 44,447,038 (fee rate 0.10%)
  - `0x7709b510...` block 44,447,416 (fee rate 0.10%)
  - `0xf8224d97...` block 44,499,631 (fee rate 0.10%)
- Decoded: USDC Transfer events, confirmed fee from perp → `0xE968...` + PayableMemoExecuted events

### Proof 4: PayableMemoExecuted on open tx (verified in Proof 2 receipt)
- Same `0x2c010232...` receipt: non-USDC log at PaymentManager address with event sig `0x5c6a329...`, data contains USDC token address + $60 amount

**Total sentinel calls: 15** (3 health + 12 receipts)

---

## Inline Verification Pass — Blockscout (https://base.blockscout.com/api/v2/)

### Discovery queries (not cited as verification, used for target identification)
- `/addresses/0xE968.../token-transfers` — ~4 pages, finding in-window txs + identifying fee sources
- `/addresses/0xEF4364.../` — PaymentManager identity (ERC1967 → PaymentManager impl)
- `/addresses/0xEF4364.../counters` — 6.4M token transfers
- `/addresses/0x696B35.../` — Agent identity (SemiModularAccountBytecode)
- `/addresses/0x2FcfA.../` — Payout wallet identity
- `/addresses/0xa6C9BA.../token-transfers` — perp contract transfer patterns, identifying close-fee txs
- `/addresses/0xa6C9BA.../` — perp contract metadata (ERC1967 Proxy)
- `/transactions/0x5c53c688.../token-transfers` — decoded one PaymentManager payout
- `/transactions/0xd5c55f1b.../token-transfers` — decoded $963 close (full decomposition)
- `/transactions/0xd5c55f1b...` — tx metadata (handleOps method)
- `/addresses/0xfa655C.../token-transfers` — found full hash of $963 close tx
- `/addresses/0xa6C9BA.../token-transfers?block_number=44575000` — found in-window perp pass-throughs
- `/blocks/44666892` — block existence verification

### Blockscout-only verification (cited with caveat in findings.md)
- $963.56 close tx `0xd5c55f1b...` at block 44,666,074 — outside sentinel window, Blockscout-verified only
- $322 open tx `0x065de654...` at block 44,666,892 — outside sentinel window, Blockscout cross-check only

**Total Blockscout calls: ~20**

---

## ACP / Virtuals API

- `acpx.virtuals.io/api/agents/1048/details` — 1 call (job types, revenue, counts, wallet)

---

## Confirmation

No calls were made to:
- `base-mainnet.g.alchemy.com` (Alchemy) — **CONFIRMED CLEAN**
- `mainnet.base.org` (public Base RPC) — **CONFIRMED CLEAN**
- `base.llamarpc.com` — **CONFIRMED CLEAN**
- Any other public RPC fallback — **CONFIRMED CLEAN**

No libraries (viem, ethers, web3.py) were used. All RPC calls were direct `curl` commands via `ssh cw-sentinel`. All Blockscout calls were direct `curl` from the local machine.

---

## Sentinel Health Note

Sentinel was at block 44,575,804 during this investigation (~47 hours behind chain tip). Recent Wasabot transactions (blocks 44,666,000+) could NOT be sentinel-verified. These are cited as "Blockscout-verified" in findings.md and are NOT marked as sentinel-verified in the publish checklist.
