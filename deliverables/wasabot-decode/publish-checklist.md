# Wasabot Decode -- Publish Checklist

Every claim in the thread and decode article must trace to a verifiable source. Sentinel-verified claims have a full tx hash, block number, and decoded event data in findings.md.

---

## Thread Claims

### Tweet 1
| Claim | Source | Method | Verified |
|---|---|---|---|
| $81.6M aGDP | ACP API `agents/1048/details`, `grossAgenticAmount` = 81,630,804.01 | API pull | Yes |
| $5,924 revenue | ACP API, `revenue` = 5,924.29 | API pull | Yes |
| 13,779x gap | $81,630,804 / $5,924.29 = 13,779.1x | Calculation | Yes |
| "Ran my own node" | 12 sentinel receipts via `ssh cw-sentinel http://localhost:8545` | RPC | Yes (rpc-audit.md) |

### Tweet 2
| Claim | Source | Method | Verified |
|---|---|---|---|
| $60 open pass-through | Tx `0x2c0102...` block 44,574,123 | Sentinel receipt | Yes |
| Zero skim on opens | Same tx: $60 in = $60 out, 2 USDC transfers only | Sentinel receipt | Yes |
| ACP wallet gets $0.008 | 80% of $0.01 coordination fee (PaymentManager split) | Sentinel-verified pattern | Yes |
| 20% to Virtuals | PaymentManager 80/20 split, 5 sentinel txs | Sentinel receipts | Yes |

### Tweet 3
| Claim | Source | Method | Verified |
|---|---|---|---|
| 80/20 split at PaymentManager | 5 sentinel txs, all exactly 4:1 | Sentinel receipts | Yes |
| "Different agents" | 80% recipients: `0x19013661...` + `0xa23f0e34...`, neither Wasabot | Sentinel receipts | Yes |
| "Zero exceptions" | 5/5 txs match, 0% variance | Sentinel receipts | Yes |

### Tweet 4
| Claim | Source | Method | Verified |
|---|---|---|---|
| AI agent initially claimed 0.30% / $245K | Original agent deliverables (pre-correction) | Internal records | Yes |
| Real close fee 0.06%-0.10% | 7 txs: 6 sentinel-verified + 1 Blockscout | Sentinel receipts | Yes |
| $245K was a misread | Fee goes to Virtuals platform `0xE968...`, not Wasabi treasury | Sentinel + Blockscout | Yes |

### Tweet 5
| Claim | Source | Method | Verified |
|---|---|---|---|
| 15K+ job history not fully traced | 2.1M perp transfers, Blockscout rate limits | Acknowledged limitation | N/A |
| $5,333 avg aGDP/job | $81,630,804 / 15,307 = $5,332.8 | Calculation | Yes |
| Recent trades $0.50-$60 | Blockscout token-transfer pages | Blockscout | Yes |
| "The gap is the metric" | Structural analysis from Proofs 1-4 | Combined evidence | Yes |

---

## Decode Article Claims

| Claim | Source | Sentinel? |
|---|---|---|
| ERC-4337 smart account | Blockscout address page | No (metadata) |
| Nonce = 1 | Agent's original sentinel call (retained) | Partial |
| $53.60 USDC wallet balance | ACP API `walletBalance: 53.604` | API |
| 7,471 token transfers | Blockscout counters | No (metadata) |
| 655,620 perp txs | Blockscout counters | No (metadata) |
| 2.1M perp token transfers | Blockscout counters | No (metadata) |
| Revenue reconciliation ($5,924.30) | ACP API fields + arithmetic | API + calculation |
| ~3,470 suggest_trade + ~11,837 standard | Derived from revenue equation | Calculation |
| PM events on both opens and closes | 6 sentinel receipts (1 open + 5 closes) | Yes |
| 0.06%-0.10% close fee range | 7 close txs verified | 6 sentinel + 1 Blockscout |
| $BOT: ~$0.0024, 4,449 holders, 92.69% top-10 | Blockscout + Virtuals API | No (point-in-time) |

---

## Final Verification Checklist

- [x] All sentinel claims trace to specific tx hashes in findings.md
- [x] Revenue math reconciles to $5,924.29 from API
- [x] No claims about "invisible revenue" or specific protocol revenue figures
- [x] Fee rate reported as range (0.06%-0.10%), not point estimate
- [x] No accusations — observations only
- [x] Scoped claims (sample sizes noted, "could not determine" disclosed)
- [x] Thread voice check (read aloud)
- [x] All RPC calls documented in rpc-audit.md
- [x] Zero Alchemy API calls
- [x] Tweet 4 acknowledges the AI-agent error and human verification correction
