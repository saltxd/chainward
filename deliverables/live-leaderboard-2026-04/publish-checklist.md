## Publish Checklist — Live Leaderboard 2026-04

### Every claim mapped to its source

| Claim | Source | Verified |
|---|---|---|
| Total lifetime aGDP $481M, +0.04% 30d | ACP API meta (prior research) | Pre-existing |
| Top-50 list and aGDP values | `acpx.virtuals.io/api/agents?pageSize=50&sort=grossAgenticAmount:desc` queried 2026-04-30 | Yes |
| Nox 7d=683 transfers | Blockscout paginated `/addresses/0xa42cAe.../token-transfers?type=ERC-20`, iterated to exit window | Yes |
| Otto AI 7d=126, 30d=788 | Blockscout paginated, same method | Yes |
| Axelrod 7d=42, 30d=182 | Blockscout paginated | Yes |
| All zero-7d dormant agents | Blockscout single-page response (50 items), all items older than 7d cutoff | Yes |
| 56% of top-50 have zero 7d activity | Count from batch query: 28/50 | Yes |
| Top-3 concentration = 91.1% | (683+126+42)/934 = 851/934 | Calculated |
| Ethy AI 1,138,715 all-time transfers | Blockscout `/addresses/0xfc9f.../counters` → `token_transfers_count` | Yes |
| Nox is ERC-4337 contract | `eth_getTransactionCount` = 0x1 via cw-sentinel; `is_contract: true` via Blockscout | Yes |
| ACP settlement contract all-time 2,126,892 | Blockscout `/addresses/0xa6C9BA.../counters` | Yes |
| Settlement contract 7d=4,875+, prior 7d=125 | Blockscout paginated (100-page cap, 5,000 timestamps collected) | Yes |
| Degen Claw weekly breakdown | Blockscout paginated, grouped by week (capped at 2,500 items for 30d) | Yes |
| HUB airdrop on 2026-04-11 | Cross-checked Sympson, Director Lucien, ASCII Artist, Finwizz — all show `from=0xD152f54...` HUB token | Yes |
| Otto Market Alpha 7d=40 (rank #78) | Blockscout single-page response for `0xe5B38F...` | Yes |
| Otto Tools Agent 7d=9 (rank #80) | Blockscout single-page response for `0x98CB7E...` | Yes |
| TBA addresses inactive | Blockscout token-transfers for Nox TBA `0xAFD2eB...` and Axelrod TBA `0x0866eF...` returned 0 items in window | Yes |
| ACP contractAddress shared by all agents = 0xa6C9BA... | ACP `/agents/{id}/details` for Nox, Axelrod, Otto, Degen Claw, Capminal — all return same contractAddress | Yes |
| aGDP is notional volume by design | Virtuals ACP glossary at whitepaper.virtuals.io | External ref |

### Language review

- [ ] No adversarial language (dirty, broken, fake, scam) — PASS
- [ ] aGDP explained as defined metric, not "inflated" — PASS
- [ ] Claims scoped to verified window (7d, 30d) — PASS
- [ ] No blanket claims from single tx — PASS
- [ ] Balances not published (volatile, not core to story) — N/A
- [ ] Nonce=1 explained as ERC-4337 artifact — PASS
- [ ] "one verified route" hedging where applicable — PASS
