---
title: "Find the Tag: How Base MCP Transactions Sign Themselves On-Chain"
subtitle: "Coinbase shipped its agent gateway on May 26. Most coverage missed the architectural pivot — and the 16-byte forensic primitive it leaves behind in every signed transaction."
date: "2026-05-27"
slug: "base-mcp-find-the-tag"
draft: true
---

# Find the Tag: How Base MCP Transactions Sign Themselves On-Chain

On May 26, 2026, Coinbase published [Introducing Base MCP](https://blog.base.org/base-mcp): an open-source MCP server that connects a user's Base Account to AI assistants like Claude, ChatGPT, Cursor, and Codex. Day-one skill plugins ship with Morpho, Bankr, Moonwell, Avantis, Aerodrome, Virtuals, and Uniswap. The post emphasises chat-driven swaps, transfers, lending positions, and agent-token launches — all signed by the user's own Base Account, never by a Coinbase-controlled key.

Coverage in CoinDesk, The Block, and news.bitcoin.com described the product accurately and missed the only forensic detail that makes any of this verifiable. The detail is in the SDK, not the blog post. Base MCP transactions carry a 16-byte fingerprint at the tail of their calldata. Anyone reading the chain can pull that fingerprint, attribute the transaction to the plugin and origin that produced it, and reconstruct the agentic decision graph after the fact. No cooperation from Coinbase is required.

This decode is the on-chain version of the launch. We read the published SDK source, traced the architectural pivot from the deprecated `base-mcp` package, and walk through the methodology for finding MCP-signed transactions yourself. The product is one day old; the data is thin by design. The point is not what the first 24 hours look like — the point is the forensic primitive Coinbase quietly shipped underneath the marketing.

---

## What changed underneath the announcement

There are two Base MCPs in the wild. They are not the same product.

**`base/base-mcp-legacy`** (archived, renamed from `base/base-mcp` shortly before the May 26 announcement) shipped in late 2024 as an experimental Node-based MCP. Its `src/main.ts` imported `CdpWalletProvider` from `@coinbase/agentkit` and pulled a `SEED_PHRASE` from environment variables. Every transaction the legacy server initiated was signed by a Coinbase-managed key. The agent's wallet was Coinbase's wallet. The user was a beneficiary.

**`base/account-sdk`**, the package that powers the launched product, drops that model entirely. There is no `SEED_PHRASE` env var. There is no `CdpWalletProvider`. The MCP server holds no keys, manages no custody, and never sees a signing surface. When the assistant wants to act, it constructs a `wallet_sendCalls` request and hands it to the user's Base Account. The Base Account — a Coinbase Smart Wallet on the user's device or in their browser — is what signs. The user reviews each call in the standard Base Account approval flow. The MCP server's only job is to assemble the bundle and ferry it to the wallet UI.

The shift is non-custodial-by-design. It also closes one of the more obvious failure modes of the legacy architecture: an environment-variable seed phrase living on whatever box the MCP server ran on. The new model has its own failure modes — every Base MCP user concentrates approval authority over USDC, NFTs, perp collateral, LP positions, and agent tokens behind one Smart Wallet that an AI assistant can pre-stage requests against — but the surface is at least visible to the user at sign time.

None of the announcement coverage we reviewed mentioned this transition. Three months ago, telling your AI assistant to "swap 50 USDC into AERO" meant a Coinbase enclave signed it. Today it means your own Smart Wallet does, and Coinbase's MCP server does not see the private key. That is the entire point.

---

## The 16-byte fingerprint

Inside `packages/account-sdk/src/sign/base-account/utils.ts` there is a six-line function:

```ts
export function compute16ByteHash(input: string): Hex {
  return slice(keccak256(toHex(input)), 0, 16);
}
```

And a slightly larger helper:

```ts
export function makeDataSuffix({
  attribution,
  dappOrigin,
}: { attribution?: Attribution; dappOrigin: string }): Hex | undefined {
  if (!attribution) return;
  if ('auto' in attribution && attribution.auto && dappOrigin) {
    return compute16ByteHash(dappOrigin);
  }
  if ('dataSuffix' in attribution && typeof attribution.dataSuffix === 'string') {
    return validateDataSuffix(attribution.dataSuffix);
  }
  return;
}
```

These functions are reachable from every call the SDK packages into `wallet_sendCalls`. The output is a `Hex` value that lands as `capabilities.attribution.suffix` on the request, and from there at the tail of the inner-call `data` bytes once the user op executes on chain. Sixteen bytes. The first sixteen bytes of `keccak256(dappOrigin)`, or a hardcoded value if the plugin sets one explicitly.

The implication, written out plainly: every Base MCP plugin produces a distinctive trailing-bytes signature. Morpho's signature differs from Aerodrome's signature differs from Bankr's signature, because each plugin runs under a different `dappOrigin` string. Once you decode one transaction per plugin and learn its 16-byte tail, every subsequent transaction from that plugin is identifiable on chain by anyone with a Base node and `eth_getTransactionByHash`.

This is not a privacy leak. The `dappOrigin` is public, the calldata is public, the user op is public. What it is, is a forensic primitive that lets external observers — researchers, indexers, security firms, journalists — attribute transactions back to their originating plugin without any cooperation from Coinbase, the plugins, or the user.

Two months from now we will be able to answer: how many transactions on Base were signed via Morpho's MCP plugin in June? Which plugin saw the largest USD-volume swing after the official Discord post? What was the median size of an MCP-mediated Bankr swap, and how did it differ from a tweet-mediated Bankr swap? These are all 16-byte-tail histogram questions over the public Base transaction stream.

---

## The infrastructure ride

Base MCP deploys no contracts of its own. There is no Base MCP factory, no router, no signer. It rides on infrastructure that already exists.

| Contract | Address | Lifetime tx (block 46,202,840) |
|---|---|---|
| EntryPoint v0.6 (ERC-4337) | `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` | 100,441,849 |
| EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` | 65,508,434 |
| CoinbaseSmartWalletFactory | `0x0BA5ED0c6AA8c49038F819E587E2633c4A9F428a` | 74,015 |
| EIP-7702 Proxy | `0x7702cb554e6bFb442cb743A7dF23154544a7176C` | 18 |

The EIP-7702 proxy count is the interesting one. Eighteen total uses across the chain, despite being the canonical Coinbase 7702 upgrade target. The Pectra-style account-upgrade flow that Base MCP nominally supports is not, today, what most users are running through. They are running through pre-deployed Coinbase Smart Wallets, signing user ops via `EntryPoint`, and tagging them with the attribution suffix.

The verifying paymaster — the off-chain service that lets Coinbase sponsor user-op gas — runs as a JSON-RPC endpoint at `paymaster.base.org`. The Base Sepolia paymaster contract is published in `base/paymaster` as `0xf5d253B62543C6Ef526309D497f619CeF95aD430`; the mainnet paymaster contract is not yet listed in that README, only the RPC endpoint. That is itself worth flagging: the contract that lets Coinbase pay your AI's gas bills is, as of the launch, less publicly documented than the rest of the stack.

---

## Methodology: find a Base MCP transaction yourself

The methodology has three steps and one prerequisite.

**Prerequisite.** You need a Base node (or an RPC endpoint that returns full transaction objects without truncation). The trailing 16 bytes of calldata are not surfaced by every block explorer and not retained by every indexer. We use our own sentinel node. Blockscout's `/api/v2/transactions/{hash}` returns enough.

**Step 1 — identify a candidate.** Filter Base transactions where:
- `to` is one of the day-one plugin destinations (Uniswap routers, Morpho's bundler, Bankr's settlement contract, Aerodrome's pool factory, Moonwell's comptroller, Avantis's tx-builder targets, the Virtuals platform contracts), AND
- the `data` field's last 16 bytes are not a known historical hash and not all zeros, AND
- the originating EOA or smart wallet has a deployment trail through `CoinbaseSmartWalletFactory`.

A user op submitted via `EntryPoint.handleOps` is the cleanest case; the inner call's `data` shows the suffix unambiguously.

**Step 2 — confirm the tag.** Decode the 16-byte tail. If `dappOrigin` is `https://base-mcp.coinbase.com` (or whatever the launched plugin uses), `compute16ByteHash('https://base-mcp.coinbase.com')` produces a known hex prefix. Match the on-chain tail against your locally-computed hash. A match confirms the transaction was signed via Base MCP. (We are publishing our local hash table for the seven day-one plugins as a separate gist — see [TODO: link from runbook once published].)

**Step 3 — bucket and aggregate.** Once the tag is confirmed, group transactions by tag, then by plugin, then by time. The first useful aggregate is: per-plugin daily volume since launch. The second: per-plugin failure rate (`status: 0x0` user ops with a known tag). The third: per-plugin median USD value moved.

We will publish these aggregates 30 days after launch as a follow-up decode.

> [!NOTE]
> **TODO before publish:** capture one fully-decoded MCP-signed transaction as Exhibit A. Install `@modelcontextprotocol/sdk`-based Claude config with Base MCP enabled, run a sub-dollar Uniswap swap, pull the receipt, point at the 16-byte tail in the inner-call `data`. Without this, the methodology section above is a recipe, not a demonstration.

---

## What to watch

Three patterns we will be monitoring as the first month plays out:

**Pattern 1 — tag uniformity.** If all seven plugins use auto-attribution from `dappOrigin`, each has one tag. If any plugin sets `dataSuffix` manually — for partner accounting, gas attribution, or some downstream incentive program — that plugin will have an arbitrary 16-byte string instead of `keccak256(origin)[:16]`. The presence of manual suffixes would mean Coinbase or the plugin author wanted a stable identifier independent of URL changes. That is a signal worth catching when it appears.

**Pattern 2 — paymaster-sponsored MCP traffic.** Base MCP runs against `paymaster.base.org`. If the paymaster sponsors only a subset of plugins, or sponsors with rate-limits per origin tag, on-chain gas-cost ratios per plugin will diverge from off-chain reports. Either pattern would be informative.

**Pattern 3 — agent-token concentration.** The Virtuals plugin lets a Base MCP user create and operate Virtuals agents from chat. If we see Smart Wallet addresses signing through the Virtuals tag while also signing through Uniswap and Bankr tags, those wallets are agent operators who are also actively trading agent tokens via two other plugins. That is a population worth tracking — the loop of "I run agents, I trade agents, I assistant-route both" is the loop Base MCP was built to enable.

---

## What this decode is not

This is not a security review of Base MCP. We have not audited the user-op approval flow, the way `capabilities.attribution.suffix` propagates through `handleRequest`, or whether the SDK's session-key model has reasonable expiry defaults. None of that is in scope here.

This is also not a usage report. The product is, at the time of writing, one day old. The data does not exist yet.

What this is, is a methodology piece. Read the attribution-suffix code, understand what it produces, learn how to find these transactions on chain, and you can build the usage report yourself in 30 days without waiting for Coinbase to publish one. The forensic primitive is in the SDK. The blog post did not mention it. We did.

---

## Verification

- `github.com/base/base-mcp-legacy` — `src/main.ts` confirms the legacy architecture used `CdpWalletProvider` with `SEED_PHRASE`.
- `github.com/base/account-sdk` — `packages/account-sdk/src/sign/base-account/utils.ts` exports `compute16ByteHash` and `makeDataSuffix`. The `Attribution` type and `capabilities.attribution.suffix` placement in `translatePayment.ts` confirm where the suffix lands on `wallet_sendCalls`.
- `github.com/base/paymaster` — README lists Sepolia paymaster `0xf5d253B62543C6Ef526309D497f619CeF95aD430`; mainnet referenced only as RPC endpoint.
- `github.com/base/eip-7702-proxy` — proxy `0x7702cb554e6bFb442cb743A7dF23154544a7176C`, validator `0x79A33f950b90C7d07E66950daedf868BD0cDcF96`.
- Base sentinel `eth_getCode` at block `0x2c0fbd8` (46,202,840) confirms factory + EIP-7702 proxy bytecode present and matches GitHub deployment artifacts.
- Blockscout `/addresses/{addr}/counters` confirms the lifetime transaction counts cited above.
- Launch announcement: `blog.base.org/base-mcp`. Custom plugin docs: `docs.base.org/ai-agents/plugins/custom-plugins`.
