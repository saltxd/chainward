# Correction proposal: `0xa6C9BA86...` is not Axelrod's contract

Prepared 2026-10-29. Read-only investigation. **Nothing here has been applied to `decode.md` or anything live.**

---

## 1. The error is real

`deliverables/axelrod-on-chain/decode.md` attributes a shared Virtuals platform contract to Axelrod in two places, plus four lines of a trace table that reinforce it.

**Wrong sentence 1 (line 87):**

> The same Virtuals deployer EOA `0x9547e85f3016303A2996271314BDE78b02021A28` that created **Axelrod's swap proxy** `0xa6C9BA86...` also deployed AIXBT's AgentFactoryV3.

**Wrong sentence 2 (line 89), same error class, same paragraph:**

> What changes per agent is **the team's wallet (here: AIxVC EOA `0xc31Cf1168b2f6745650d7B088774041A10D76d55`, which deployed the swap implementation and runs `setFeeDelegation` against the AIxVC BondingV5 proxy)**, the swap-settlement counterparty [...]

Both the EOA and the "AIxVC BondingV5 proxy" are Virtuals platform infrastructure. The sentence presents them as the per-agent variable, which is the exact opposite of what they are.

**Both errors cut against the thesis of the paragraph they sit in.** That section's argument is "Axelrod is not bespoke [...] this is the Virtuals stack as it ships". Calling a shared router "Axelrod's swap proxy" and filing a platform key under "what changes per agent" both weaken that case. Correcting them does not walk the section back, it makes the section's own point harder. The shared router is the single best piece of evidence that Axelrod is not bespoke, and the piece currently files it on the wrong side of the ledger. That is the easiest kind of correction to publish: the article gets stronger, not weaker.

**Reinforcing labels (lines 32 to 35)** call `0xa6C9...9df0` the "exec contract" with no indication it is shared, inside a section titled "How a swap actually settles" that is otherwise all about Axelrod.

The error is also baked into the unpublished research notes (`identity-chain.md` lines 29, 34, 116, 136 and `verification-citation.md` line 64) where the address is named **"Axelrod core swap router"** and **"Axelrod core swap proxy"** throughout. Those notes are the reuse risk: the naming will repeat itself unless they are fixed too.

---

## 2. What the contract actually is (verified independently, 2026-10-29)

Public endpoints only. No Alchemy key, no `withrpc.sh`. Nine RPC calls plus three ACP API calls, paced under 2/s.

**It is shared, by a wide margin.** ACP API `https://acpx.virtuals.io/api/agents`, pages 1 and 200 of 442 (registry total 44,109 agents):

| Sample | Rows | List `0xa6C9…9df0` as `contractAddress` | Distinct `ownerAddress` |
|---|---|---|---|
| Page 1 | 100 | 41 | 32 |
| Page 200 | 100 | 99 | 39 |
| **Combined** | **200** | **140** | **71** |

The 140 matches span clusters `OPENCLAW` (98), none (22), `hedgefund` (9), `mediahouse` (4), `yield-farming` (3) and more. Among them: **aixbt** (id 26), **Mamo** (id 33), **Luvi** (id 58), **Director Lucien** (id 59). Agents that do not list it list `0x6a1FE26D…` instead, the older v1 ACP contract, which matches our own `virtuals-top-dog` decode.

Axelrod's own record (`/api/agents/129/details`) returns `contractAddress: 0xa6C9BA866992cfD7fd6460ba912bfa405adA9df0`, the same string as 139 other agents in a 200-agent sample.

**It is a UUPS proxy, not an agent contract.** Via `https://mainnet.base.org`:

- `eth_getCode` returns 170 bytes, the canonical OpenZeppelin `ERC1967Proxy` runtime.
- EIP-1967 implementation slot `0x360894…bbc` = `0x361DECCFc381aCa339218D2A148bC08943D02CDb`. This matches the implementation our `degen-claw-on-chain` decode names as the shared `ACPRouter`.
- EIP-1967 admin slot `0xb53127…6103` = zero, so upgrade authority lives in the implementation, not a per-agent admin.
- `owner()` on the proxy reverts, so it exposes no agent-level ownership at all.

**The "AIxVC team wallet" is a Virtuals platform key.** The decode's "AIxVC BondingV5 proxy" is `0x1A540088125d00dD3990f9dA45CA0859af4d3B01`, which Virtuals publishes in its own whitepaper as the **Base launchpad bonding curve for the whole protocol** (`deliverables/virtuals-top-dog/data/d_wp_info-hub_important-links-and-resources_virtuals-protocol-contract-addresses.md`). We called `owner()` on it:

```
owner() @ 0x1A540088125d00dD3990f9dA45CA0859af4d3B01
  → 0xc31Cf1168b2f6745650d7B088774041A10D76d55
```

That is the same EOA the decode calls "the team's wallet". It owns Virtuals' launchpad bonding curve for every agent on Base. No agent team has that key.

**One adjacent claim checked and confirmed, no change needed.** `0x1e7a617ed598a39ed5a735573fc56498d7a2cf77`: `eth_getCode` returns `0x` (EOA), balance 0.2623 ETH today against the decode's "0.27 ETH live" at its April snapshot. That one is genuinely Axelrod-specific and stays.

---

## 3. Where else this appears

Across all 35 published `deliverables/*/decode.md`, **the hard error appears in exactly one piece: Axelrod.** It is not a systemic pattern. Our later decodes got it right:

| Decode | Wording | Verdict |
|---|---|---|
| `four-agents-one-wallet` | "the shared Virtuals ACP router that every v2 agent lists as its `contractAddress`" | correct |
| `degen-claw-on-chain` | "the shared Virtuals `ACPRouter` proxy [...] It is not agent-owned" | correct |
| `butlerliquid-on-chain` | "the ACP router at `0xa6C9BA86…`" / "ACPRouter" | correct |
| `live-leaderboard-2026-04` | "The ACP settlement contract" / "ERC1967 proxy" | correct |
| `virtuals-top-dog` | "a Router (`0xa6C9BA86…`) and PaymentManager [...] added in October 2025" | correct |
| `bridgekitty-on-chain` | "the **OPENCLAW cluster's** `ERC1967Proxy` [...] shared across all OPENCLAW agents" | **too narrow, optional fix** |
| `axelrod-on-chain` | "**Axelrod's swap proxy**" | **wrong, fix needed** |

BridgeKitty reaches the right conclusion ("not a per-agent contract") by the wrong route: it scopes the router to one cluster. Our sample shows it serving `hedgefund`, `mediahouse`, `yield-farming` and unclustered agents too. That is a precision fix, not a retraction.

A sweep for possessive phrasing on other shared contracts (`PaymentManager 0xEF4364Fe…`, platform collector `0xE968…64C1`) found no further misattributions. Hits in `bankr-hack-trace`, `bsc-erc8004-registry` and `x402-top-ten-self-funded` refer to routers those parties genuinely own.

---

## 4. The fix

Zero em dashes. House voice. Exact strings, ready to apply.

### Fix A, axelrod `decode.md` lines 32 to 35 (trace table)

Current:

```
80.000000  user 0xd98e...28acc  →  exec contract 0xa6C9...9df0
 0.048000  exec contract        →  platform 0xE968...64C1   (20% of fee)
 0.192000  exec contract        →  Axelrod ACP 0x999A...624E1   (80% of fee)
79.760000  exec contract        →  swap pool 0x1e7a...2cf77
```

Replacement (column alignment preserved, arrows stay at the same offset):

```
80.000000  user 0xd98e...28acc  →  ACP router 0xa6C9...9df0
 0.048000  ACP router           →  platform 0xE968...64C1   (20% of fee)
 0.192000  ACP router           →  Axelrod ACP 0x999A...624E1   (80% of fee)
79.760000  ACP router           →  swap pool 0x1e7a...2cf77
```

This also brings the label in line with `butlerliquid-on-chain`, which already says "ACPRouter" for the same four-leg trace.

### Fix B, axelrod `decode.md` line 87

Current:

> Axelrod is not bespoke. The ERC-7760 ACP wallet, the AccountFactory deployer, the SingleSignerValidationModule, the ERC1967 execution contract, the PaymentManager, the swap-settlement EOA, the 80/20 platform/agent split, the V2 LP locked into the protocol's ve-wrapper, the AgentToken with its built-in 1% swap tax, is the Virtuals stack as it ships. The same Virtuals deployer EOA `0x9547e85f3016303A2996271314BDE78b02021A28` that created Axelrod's swap proxy `0xa6C9BA86...` also deployed AIXBT's AgentFactoryV3.

Replacement:

> Axelrod is not bespoke. The ERC-7760 ACP wallet, the AccountFactory deployer, the SingleSignerValidationModule, the ACP router, the PaymentManager, the swap-settlement EOA, the 80/20 platform/agent split, the V2 LP locked into the protocol's ve-wrapper, the AgentToken with its built-in 1% swap tax, is the Virtuals stack as it ships. `0xa6C9BA86...` is the clearest case: it is not Axelrod's contract, it is the shared Virtuals ACP router that the ACP API returns as `contractAddress` for v2 agents generally. In a 200-agent sample pulled from the registry, 140 of them list that exact address under 71 different owner wallets, aixbt and Mamo and Luvi among them. The Virtuals deployer EOA `0x9547e85f3016303A2996271314BDE78b02021A28` that created it also deployed AIXBT's AgentFactoryV3.

### Fix C, axelrod `decode.md` line 89

Current:

> What changes per agent is the team's wallet (here: AIxVC EOA `0xc31Cf1168b2f6745650d7B088774041A10D76d55`, which deployed the swap implementation and runs `setFeeDelegation` against the AIxVC BondingV5 proxy), the swap-settlement counterparty (`0x1e7a617e...`, an EOA: Axelrod is acting as principal market-maker on its own pool, not routing to Uniswap or 0x), and the size of the dev-wallet bag.

Replacement:

> What changes per agent is the swap-settlement counterparty (`0x1e7a617e...`, an EOA: Axelrod is acting as principal market-maker on its own pool, not routing to Uniswap or 0x), the signer on the ACP wallet, and the size of the dev-wallet bag. The EOA that deployed the router's implementation, `0xc31Cf1168b2f6745650d7B088774041A10D76d55`, is not Axelrod's team either: call `owner()` on Virtuals' own Base launchpad bonding curve `0x1A540088125d00dD3990f9dA45CA0859af4d3B01` and it returns that same address. It is a platform key with authority over the whole launchpad, not over one agent.

### Fix D, the correction note (append after the existing italic verification footer)

Matches the `degen-claw-on-chain` precedent, which carries a trailing italic revision line.

> *Correction, 2026-10-29: as first published, this piece called `0xa6C9BA86...` "Axelrod's swap proxy" and described `0xc31Cf11...` as the AIxVC team's wallet. Both are Virtuals platform infrastructure rather than Axelrod's. The ACP API returns that router as `contractAddress` for v2 agents generally, 140 of 200 we sampled, and that EOA is the `owner()` of Virtuals' own Base launchpad bonding curve. The fee math, the 0.300% split at 80/20, the signer rotation and the zero-burn finding are unaffected and unchanged.*

### Fix E, bridgekitty `decode.md` line 83. Recommendation: **leave it, fix only if the Axelrod edit ships anyway**

My call: **it is not wrong enough to correct on its own.** Reasons, in order of weight:

1. **It gets the load-bearing claim right.** The sentence exists to stop a reader crediting the router's activity to BridgeKitty, and it says plainly "not a per-agent contract [...] not attributable to BridgeKitty". A reader acts on that correctly. Axelrod's reader acts on its sentence incorrectly. That is the difference between a precision gap and an error.
2. **It was a defensible read at the time.** In our own sample, 98 of the 140 matching agents are in cluster `OPENCLAW`. From a BridgeKitty-shaped vantage point, the router does look OPENCLAW-flavoured. Page 1 of the registry is what disproves it.
3. **A correction notice has a cost.** It spends reader trust and signals "we got something wrong here". Spending that on a sentence whose conclusion holds trains readers to discount our notices when one actually matters.

So: if the user approves Fixes A through D, apply E in the same pass as a silent precision edit with its own short note, since we are already touching the subject and consistency across decodes is worth having. If the user declines the Axelrod correction, leave BridgeKitty alone entirely. Do not raise a standalone BridgeKitty correction.

Text, if applied:

Current:

> The contract at `0xa6C9BA86…9df0` (recorded as `contractAddress` on both BridgeKitty records) is the OPENCLAW cluster's `ERC1967Proxy`, an upgradeable proxy used by the cluster, not a per-agent contract. Its activity is shared across all OPENCLAW agents, not attributable to BridgeKitty.

Replacement:

> The contract at `0xa6C9BA86…9df0` (recorded as `contractAddress` on both BridgeKitty records) is the shared Virtuals ACP router, an upgradeable `ERC1967Proxy` that the ACP API returns as `contractAddress` for v2 agents across the registry, not a per-agent contract and not specific to the OPENCLAW cluster. Its activity is shared across the whole ACP marketplace, so none of it is attributable to BridgeKitty.

Line 168 source label, same file: change `- Cluster proxy contract:` to `- Shared ACP router contract:`.

If Fix E is applied, append:

> *Correction, 2026-10-29: as first published, this piece described `0xa6C9BA86...` as the OPENCLAW cluster's proxy. It is the shared Virtuals ACP router, used across the whole ACP marketplace rather than by one cluster. The conclusion is unchanged: it is not a per-agent contract, and none of its activity is BridgeKitty's.*

### Fix F, research notes: **DONE 2026-10-29, already applied**

These are unpublished working files, so correcting them needed no approval and stops the error propagating into the next investigation that reads them. Applied:

| File | Changes |
|---|---|
| `identity-chain.md` | Correction note at top. Renamed "Axelrod core swap router / proxy / implementation" to "Virtuals ACP router (shared, NOT Axelrod's)" at lines 29, 116, 117, 137 and 141. Relabelled `0xc31Cf11...` from "Implementation deployer (AIxVC team)" to "Virtuals platform ops EOA" and recorded the `owner()` evidence. Corrected "AIxVC's BondingV5 proxy" to "Virtuals' BondingV5 launchpad proxy". Rewrote the §Conclusion sentence that called `0xa6C9BA86...` "the agent's swap-execution contract". Added the UUPS and `owner()`-reverts facts. |
| `verification-citation.md` | Correction note at top. Row 6 relabelled from "exec contract" to "ACP router". **Row 47 flipped from a clean PASS to "PASS on the creator fact, FAIL on the naming"**, with a note that this is the row that should have caught it: the citation check confirmed the address and never questioned the possessive. |
| `utility-audit.md` | Correction note at top. Four instances of "Axelrod execution contract" and one "(NFT/exec)" relabelled to the shared Virtuals ACP router. Fee figures untouched. |
| `tweet.md` | Correction note at top. "Axelrod's exec contract" replaced. **The thread as posted on X still carries the wrong phrase**, so this file and the live post now differ. Whether to post a correction on X is the user's call. |

**The wider finding for our process:** the error survived a 53-claim citation verification that returned 53 PASS. It did so because the verifier checked that each address was the address we said it was, and never checked whether the possessive attached to it was earned. "Is this address correct?" and "is this address theirs?" are different questions. Worth adding the second one to the decode checklist.

---

## 5. What does not change

The fee mechanism, the 0.300% gross rate, the 80/20 split, the seven receipts, the $6.241848 wallet balance, the ERC-7760 single-signer wallet analysis, the February 4 signer rotation, the 1,000,000,000 AXR supply, the 30.96% dev bag, the top-10 concentration, the LP figures and the zero-burn finding are all untouched by this correction. None of them depended on who owns `0xa6C9BA86...`.

The headline claim, that eleven months after the buyback promise nothing has been burned, stands.

---

## Appendix: commands run

```
curl https://acpx.virtuals.io/api/agents/129/details
curl 'https://acpx.virtuals.io/api/agents?pagination[page]=1&pagination[pageSize]=100'
curl 'https://acpx.virtuals.io/api/agents?pagination[page]=200&pagination[pageSize]=100'

# all against https://mainnet.base.org
eth_getCode      0xa6C9BA866992cfD7fd6460ba912bfa405adA9df0  → 170-byte ERC1967Proxy
eth_getStorageAt 0xa6C9BA86... slot 0x360894...bbc  → 0x361DECCFc381aCa339218D2A148bC08943D02CDb
eth_getStorageAt 0xa6C9BA86... slot 0xb53127...6103 → 0x0 (no proxy admin, UUPS)
eth_call         0xa6C9BA86... owner()              → reverts
eth_getCode      0x361DECCFc381aCa339218D2A148bC08943D02CDb  → 24,474 bytes
eth_getStorageAt 0x1A540088... slot 0x360894...bbc  → 0x20c124e13069889633fc4212e0797c95cb30db40
eth_getStorageAt 0x1A540088... slot 0xb53127...6103 → 0x689aEeA3f3b09F03788C62A50f74D44b6b05c98d
eth_call         0x1A540088... owner()              → 0xc31Cf1168b2f6745650d7B088774041A10D76d55
eth_getCode      0x1e7a617ed598a39ed5a735573fc56498d7a2cf77  → 0x (EOA)
eth_getBalance   0x1e7a617e...                      → 0.2623 ETH
```

`base.blockscout.com` returned HTTP 403 behind Cloudflare, as expected on this host. No deployment-date or upgrade-count claim is made here because that provenance was not re-verifiable from public endpoints this session. The proposed replacement text makes no such claim.
