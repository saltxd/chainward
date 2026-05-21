# Bankr Architecture & Narrative Context

Parallel research stream. The on-chain forensic trace lives in `findings.md` (decode-agent output). This file captures the architectural and narrative context drawn from public sources.

## Bankr architectural model — what is a "Bankr wallet"?

Bankr (`@bankrbot`, operated by `@0xDeployer`) is a chat-driven AI agent that lets users transact on Base by mentioning `@bankrbot` in a tweet or Farcaster cast. Behind the consumer surface is a layered custody and signing pipeline.

**Public-facing description (Privy):** Per Privy's `bankrbot-case-study` blog post, Bankr uses Privy server wallets — "instant creation of a secure server wallet, tied to the user's X account... server-side wallet management, meaning users don't need to handle seed phrases... delegation of wallet activity to AI agents, allowing BankrBot to execute transactions or manage onchain logic on behalf of the user."

**On-chain pattern:** What the chain actually shows is the **MetaMask Delegation Framework (ERC-7710)** in use. The Bankr fee collector (`0xF60633D02690e2A15A54AB919925F3d038Df163e`) routinely calls `redeemDelegations` — passing in signed delegations from user wallets — and a Bankr settlement contract (`0x7747F8D2a76BD6345Cc29622a946A929647F2359`, "BaseSettler") handles the actual token movement. User wallets call `execute` on BaseSettler for their own transactions.

In other words: **the user's wallet is technically theirs, but they've signed a delegation handing Bankr the right to make it transact.** That delegation is the signing capability. There's no private key to steal — there's a delegation to abuse.

The BankrBot/skills GitHub repo confirms the design supports multiple signing providers (Privy, Turnkey, Fireblocks, Bankr-native) and notes:

> "Built-in wallet with IP whitelisting, hallucination guards, and transaction verification."

So defensive layers exist; they sit between user-input → policy-checker → delegation-redeemer.

**Capability layer: Bankr Club NFT (`0x9FAb8C51f911f0ba6dab64fD6E979BcF6424Ce82`)**

Verified contract `BankrClub721`. ERC-721, 1,000-supply, 882 holders (Blockscout, block 46,277,480). Deployed by `0x493D649b0C87B8058F1F6965f7AF95129D9D8dD3` via tx `0x3671f2c30103714d0f0bc301e665f6be83be9499d602c3176774b36b4a5d9099`.

The NFT acts as a capability token within Bankr's permission model. From the May 4 incident post-mortem:

> "Holding this NFT unlocks higher-privilege capabilities, including large-value transfers and token swaps."

This is the architectural primitive that matters: **possessing the NFT, not the wallet itself, gates what BankrBot will agree to do for that wallet.** A transfer is a permission change.

**Token:** $BNKR ERC-20 at `0x22aF33FE49fD1Fa80c7149773dDe5890D3c76F3b`. Subscription-pay for the broader Bankr Club service.

## Timeline

### May 4, 2026 — Grok DRB heist (precursor, $174K)

Attacker handle `@Ilhamrfliansyh` (since deleted), on-chain identity `ilhamrafli.base.eth`.

Attack chain, per SlowMist's "AI Agent permission chain abuse" classification:

1. **Privilege escalation by gift:** Attacker sent a Bankr Club Membership NFT to Grok's auto-provisioned Base wallet (`0xb1058…e4f9` — note: not actually controlled by xAI, but auto-created when @grok was tagged in a Bankr context). Receipt of the NFT unlocked Bankr's high-privilege agentic toolset for that wallet, including transfers and swaps. No secondary confirmation triggered.
2. **Encoded prompt injection:** Attacker posted a Morse-code reply on X tagging `@grok`. Grok's safety filters didn't flag the encoded payload because it wasn't in plaintext. Grok decoded it and posted the plaintext command in its reply, tagging `@bankrbot`.
3. **Blind execution:** BankrBot treated the Grok reply as an authoritative command from a verified upstream agent and executed the implied transfer. 3,000,000,000 DRB moved from Grok's wallet → `0xe8e47…a686b` via tx `0x6fc7eb7da9379383efda4253e4f599bbc3a99afed0468eabfe18484ec525739a`.
4. **Liquidation:** Attacker dumped the tokens on the open market within minutes, briefly crashing the DRB price ~40%.
5. **Negotiated recovery:** 80–88% of the value was returned in USDC/ETH; remaining ~$30–40K kept as an informal "bug bounty."

SlowMist's classification: this was not a smart-contract exploit. The exploit primitive is the trust chain itself — Bankr's scanner treats Grok's verified-account replies as authoritative, and Grok's safety filters don't enforce policy on decoded content.

### May 19, 2026 — 14 wallets compromised (the main event)

Per SlowMist's hacked.slowmist.io entry and Bankr's `@bankrbot` thread:

- **Detection:** ~06:00 UTC by Bankr's internal monitoring.
- **Containment:** ~11:00 UTC, all transactions paused.
- **Scope:** 14 Bankr-managed user wallets accessed.
- **Mechanics (per SlowMist):** "unauthorized transfers (primarily direct `transfer()` calls, followed by swaps to ETH and bridging)."
- **Loss range:** ~$170K (SlowMist conservative estimate, ETH + BNKR) up to ~$440K (combined balance now held across three attacker-linked addresses, per analysts).
- **Treasury for reimbursement:** Bankr disclosed >$3M, will refund all victims.
- **Coordination:** May 20 update — coordinating with FBI and counterparties, asset freezes / recovery in progress.

### Bankr's post-incident remediation

Per the same SlowMist write-up, Bankr's post-incident security additions are themselves an architectural admission:

- Optional IP whitelisting
- Permissioned API keys
- **A per-account toggle that disables actions triggered by X replies.**

That last one is the load-bearing one. Letting users turn off "actions triggered by X replies" is a direct fix for the Grok-mediated trust-chain vector. The May 4 incident exploited it (Grok's decoded reply was treated as an authoritative command); the May 19 incident at 14× scale was almost certainly a refinement of the same primitive; and the fix is to let users opt out of the input channel that made both possible.

### Notable victim: Austen Allred (Kelly Claude AI project)

Austen Allred (founder, BloomTech; creator of the "Kelly Claude" AI-agent project, KELLYCLAUDE token at `0x50D2280441372486BeecdD328c1854743EBaCb07`):

> "There's no evidence anyone other than myself ever logged into the Bankr account; they must have accessed the keys some other way."

His Bankr wallet was drained of **ETH only**. Memecoin holdings were untouched.

This is a forensic tell. A standard wallet-drainer (compromised seed → MetaMask drainer signature → `transferFrom` on every approved token) takes everything. ETH-only theft is consistent with operational control at the transaction-construction layer — the attacker had the ability to ask Bankr-the-service to construct and sign a specific ETH transfer, but didn't have a way to enumerate and sweep ERC-20s in the same flow (or was time-limited before the lockdown).

## The decode angle

This is not a smart-contract hack story. There is no protocol to audit. The exploit primitive is architectural:

1. **NFT-as-permission:** Sending a single Bankr Club NFT into a wallet upgrades what BankrBot will do for that wallet. Permission state lives in transferable, fungible-ish ERC-721 metadata.
2. **AI-to-AI trust chain:** BankrBot accepts verified replies from upstream AI agents (notably Grok) as authoritative commands.
3. **Custodial pretending to be non-custodial:** Privy holds the keys; Bankr holds the signing rights. The user's "wallet" is a service-level abstraction. When the service is compromised at the prompt layer, all "user wallets" are simultaneously exposed. A single root cause can drain N wallets in a batch — which is exactly what happened (14 in one window).
4. **Warning ignored:** The May 4 incident demonstrated the full attack chain. Bankr negotiated the funds back and continued. 15 days later, a refinement of the same vector hit 14 wallets.

That's the editorial spine. ChainWard's contribution is the on-chain trace: identify the 14 wallets, map the attacker addresses, quantify what's still recoverable, and show the timing pattern that proves a batch script (not 14 independent compromises).

## Known on-chain addresses

| Role | Address | Source |
|---|---|---|
| Bankr Club NFT (capability) | `0x9FAb8C51f911f0ba6dab64fD6E979BcF6424Ce82` | Blockscout: verified `BankrClub721` |
| BNKR token | `0x22aF33FE49fD1Fa80c7149773dDe5890D3c76F3b` | docs.bankr.bot |
| Bankr Club deployer | `0x493D649b0C87B8058F1F6965f7AF95129D9D8dD3` | NFT contract creator |
| Bankr legacy relayer | `0x2112b8456AC07c15fA31ddf3Bf713E77716fF3F9` | 356K txns; `deployToken` calls; dormant since Feb 24, 2026 |
| Bankr fee collector / redeemer | `0xF60633D02690e2A15A54AB919925F3d038Df163e` | 37K txns, 715K token transfers; calls `redeemDelegations` to settle user txs |
| BaseSettler (settlement contract) | `0x7747F8D2a76BD6345Cc29622a946A929647F2359` | User wallets call `execute` on this for token movements |
| KELLYCLAUDE token (Austen) | `0x50D2280441372486BeecdD328c1854743EBaCb07` | Clanker.world (ClankerToken proxy) |
| KELLYCLAUDE fee splitter | `0xF6bf691711dB89c43925dD013cf10b36BD67E07B` | Clanker.world per-token fee contract |
| Grok wallet (May 4 victim) | `0xb1058…e4f9` | SlowMist (truncated in source) |
| May 4 attacker recipient | `0xe8e47…a686b` | SlowMist (truncated in source) |

## Open questions for the on-chain trace

These are what the decode-agent investigation needs to answer:

1. Which 14 wallets? What is each one's drained value and destination?
2. Did the 14 transfers all go to the same attacker address, or distributed across the three known clusters?
3. Were they all signed within a single short window (suggests script) or staggered (suggests interactive)?
4. Was the same Grok-mediated prompt-injection vector used, or a different abuse pattern?
5. Are the three attacker addresses still holding the $440K? Has anything moved off Base via bridges?
6. Did anyone receive a Bankr Club NFT in the hours before the drain? (Would point to repeat of the May 4 capability-elevation primitive.)

## Sources

- Bankr official tweets, `@bankrbot` thread May 19–20, 2026.
- SlowMist hack database entry, 2026-05-19.
- Yu Xian (`@evilcos`) public commentary, May 2026.
- Privy blog: "From Terminal to Timeline: BankrBot and the Rise of Agentic Wallets."
- Vic Genin, "When Bots Trust Bots: The Grok-Bankrbot Incident," Medium, May 2026.
- BankrBot/skills GitHub repository.
- Austen Allred statements on X.
- Blockscout (`base.blockscout.com`) for verified contract metadata and address counters.
- ChainWard sentinel node (Base L2 full node, pruned ~30 days).
