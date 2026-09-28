---
title: "Every Base MCP Transaction Ends in bmcp_blue"
subtitle: "We found Base MCP's on-chain tag, and it isn't the one we predicted. 12,691 tagged operations from 332 wallets since the May 26 launch; 89% of them came from 229 wallets running the same seven-protocol routine, mostly for a few cents."
date: "2026-09-28"
slug: "base-mcp-find-the-tag"
seoTitle: "Base MCP On-Chain: The bmcp_blue Tag, 12,691 Operations and Who Uses It (May–Sep 2026)"
---

# Every Base MCP Transaction Ends in bmcp_blue

On May 26, 2026, Coinbase launched [Base MCP](https://blog.base.org/base-mcp), a server that lets an AI assistant like Claude, ChatGPT or Cursor prepare transactions for a user's own Base Account. The user approves each one in their wallet. Day-one plugins covered Morpho, Moonwell, Uniswap, Aerodrome, Avantis, Bankr and Virtuals.

The day after launch we drafted this decode around a prediction. Base's wallet SDK contains a function that hashes an app's web origin into 16 bytes and appends them to its transactions, so we expected each Base MCP plugin to leave its own 16-byte tag, readable by anyone with a node. We couldn't show one on-chain then, so we didn't publish.

Four months later we went looking. **The tag exists, but it isn't the hash we predicted. Every Base MCP write we found ends in the same 27 bytes, spelling the text `bmcp_blue`.** It is one tag for all of Base MCP, not one per plugin. It isn't registered in Base's Builder Codes registry, and we found it documented nowhere.

Reading it from our own Base node and Base's public RPC: **12,691 tagged operations from 332 wallets since launch. 89% of them came from 229 wallets that run the same routine across the same seven protocols, mostly moving a few cents. The rest is about 100 wallets, mostly swapping and sending, at around 20 operations a day.**

---

## The tag

A Base Account is a smart wallet. When you approve a Base MCP request, your wallet submits an ERC-4337 user operation whose calldata is a batch of calls (`executeBatch`). Base MCP operations end that calldata with an attribution suffix in the proposed [ERC-8021](https://github.com/ethereum/ERCs/pull/1209) format:

```
626d63705f626c7565   "bmcp_blue"   the attribution code (9 bytes)
09                   code length
00                   ERC-8021 schema 0
80218021…8021        16-byte ERC-8021 marker
```

The suffix is on the outer batch, not on the individual calls inside it. When a wallet is created inside the same operation, the tag also appears on its deployment data.

**How we know it's Base MCP.** Four plugin authors posted mainnet transactions to Base's plugin repo as proof that their plugin ran through Base MCP. All five of those operations end in `bmcp_blue`:

| Posted in base/skills | What the author said it was | Transaction |
|---|---|---|
| issue #51 | `send_calls`: USDC approve for BoonV3 | [`0xc2e346ca…`](https://base.blockscout.com/tx/0xc2e346ca220255225fcfb38e2b0d1c1ca83b245d03f151be6228251de083616c) |
| PR #50 | Extra Finance: 5 USDC supply via `send_calls` | [`0x8fcbd85e…`](https://base.blockscout.com/tx/0x8fcbd85ece6bf02bbb811837a95b71beccb965c588327616171305b612e487e8) |
| PR #103 | YO: deposit | [`0x942a1f71…`](https://base.blockscout.com/tx/0x942a1f717627f5b794f18e8f4e6c630a5877c598faa4d795c87ebeaafa05a74d) |
| PR #103 | YO: instant redeem | [`0xdcda0814…`](https://base.blockscout.com/tx/0xdcda0814759eba5f6f699c68c2c1fbf07a3c99339cfbcd5c089c0f142450f4e4) |
| PR #107 | Bitrefill: direct USDC send | [`0xcea4a97d…`](https://base.blockscout.com/tx/0xcea4a97d4b39e8ca0a03ddd7c80ef275eda3cef5d67bf5dfb777b8edd5d72bd4) |

In each case the tag sits on exactly the operation the author described, while other operations in the same bundle carry other codes. A second check: Base MCP's KyberSwap plugin asks the agent to label its swaps `"Source":"base-mcp"` in the router calldata. All 8 KyberSwap swaps with that label in our window carry `bmcp_blue`. [One of them](https://base.blockscout.com/tx/0x8b51a3e8e693fce4ed2d3ffcfa89ffdd8d68a3ea746dfa9e4cd510d290677f56) swaps two 2.5 USDC lots into Coinbase tokenized stocks, and its calldata carries both labels.

For comparison, the most common code on Base smart-wallet operations is `bc_mnip`: about 40,000 operations a day from tens of thousands of wallets, mostly LI.FI swaps, USDC transfers and sends. The chain doesn't label it, but its volume and targets fit Coinbase Wallet's own in-app activity. It is registered: on Base's Builder Codes contract, `isRegistered("bc_mnip")` returns true and `isRegistered("bmcp_blue")` returns false.

---

## What we got wrong in May

**The hash is real, but it isn't Base MCP's.** The 16-byte origin hash (`compute16ByteHash`) is still in Base's wallet SDK. It was added in April 2025, thirteen months before Base MCP, for browser apps that use sub-accounts. We computed it for ten candidate Base MCP origins, including `https://mcp.base.org` and `https://keys.coinbase.com`. None of the ten appears once in 380 million transactions. One old-style 16-byte tag does recur on Base, more than a thousand times a day, on operations that call a contract verified as ClaimRewards; we couldn't tell which origin produces it.

**Plugins don't get their own tag.** Base MCP is a hosted service at `mcp.base.org`, and Base's docs now call it "Coinbase Wallet MCP". A plugin is a set of instructions that tells the assistant what calldata to pass to Base MCP's own tools (`send_calls`, `swap`, `send`). Every write goes out through the same tools, so every write gets the same tag. Which protocol an operation touched has to be read from the contracts it calls.

**The legacy server's key.** We wrote that the archived pre-launch `base-mcp` signed with "a Coinbase-managed key". Its source reads a seed phrase from an environment variable on whatever machine runs the server. That's a key held by whoever runs it, not a key Coinbase manages.

**Upgraded accounts.** In May we pointed at Coinbase's EIP-7702 upgrade contract having 18 uses and concluded that almost nobody used upgraded accounts. Of the 332 Base MCP wallets we found, 186 are ordinary accounts upgraded through that contract.

---

## Four months in numbers

Our node covers blocks 50,000,000 to 51,657,640, **Aug 15 10:22 to Sep 22 19:17 UTC**: 380,479,017 transactions with no missing blocks. We parsed every ERC-4337 bundle in that range.

| Aug 15 – Sep 22, our node (complete) | |
|---|---|
| `bmcp_blue` operations | **1,696** |
| Wallets | **328** |
| Succeeded | 1,632 (96.2%); 45 of the 64 failures touched Morpho |
| Gas sponsored by Coinbase's paymaster | 129 (7.6%) |
| `bc_mnip` operations (likely Coinbase Wallet in-app), same blocks | 1,581,609 |

Base MCP's tagged traffic is about **0.11%** of `bc_mnip` traffic. The two also differ on who pays gas. On Sep 21–22, 98.9% of `bc_mnip` operations had gas sponsored by the paymaster. Only 7.6% of Base MCP operations did; the rest paid their own.

For the months before Aug 15 we took the 328 wallets plus the four from the plugin repo and read their full history back to launch. That adds **10,995 tagged operations from 277 of them, for a total of 12,691 operations from 332 wallets.** It's a floor: a wallet that used Base MCP only before Aug 15 and never again isn't in it.

The first tagged operation is a USDC transfer on launch day, [May 26 at 16:09 UTC](https://base.blockscout.com/tx/0x9cb57d33723bf26bef4dbd71d6b443aa621c8fcd7a86c9ac774a4de3130f8881). Weekly, Monday start:

| Week of | Operations | Wallets |
|---|---:|---:|
| May 25 | 253 | 23 |
| Jun 1 | 137 | 24 |
| Jun 8 | 195 | 46 |
| Jun 15 | 552 | 49 |
| Jun 22 | 300 | 53 |
| Jun 29 | 1,746 | 148 |
| **Jul 6** | **3,278** | **178** |
| Jul 13 | 2,243 | 152 |
| Jul 20 | 1,825 | 131 |
| Jul 27 | 195 | 31 |
| Aug 3 | 216 | 25 |
| Aug 10 | 96 | 17 |
| Aug 17 | 1,049 | 244 |
| Aug 24 | 188 | 40 |
| Aug 31 | 160 | 41 |
| Sep 7 | 152 | 33 |
| Sep 14 | 78 | 20 |

Rows through the week of Aug 10 are floors.

---

## Two populations

**229 wallets doing the same thing.** On Aug 21 and 22, 229 wallets made 986 tagged operations between about 08:00 and 19:00 UTC. The median operation moved **$0.03**. Nearly every one of those wallets touches the same seven venues: 0x (98% of the wallets), Moonwell, YO, Morpho, Uniswap (88–89% each), a verified contract named SwapProxy (87%), and LI.FI (80%). They make a median of 43 tagged operations each. 227 of the 229 had used Base MCP before Aug 15, and together they account for **11,248 of the 12,691 operations (89%)**. The July peak is almost entirely theirs: 98.5% of tagged operations from Jun 29 to Jul 26 came from these wallets.

They don't share a key. Almost all of them (226) list Coinbase's standard SpendPermissionManager as a co-owner, as most wallets in the data do; beyond that they have 246 different owners, none reused. The pattern looks like one routine run many times, not people finding a product. The chain doesn't show who runs it or why.

**About 100 wallets doing different things.** The other 103 wallets made 1,443 tagged operations, a median of 4 each, usually on one or two venues: LI.FI and 0x swaps, Uniswap, plain sends. From Aug 15 to Sep 22, outside the Aug 21–22 burst, Base MCP ran at about 20 operations a day from 113 wallets, with a median operation of **$3.29**. Full weeks since the burst fell from 188 operations to 160, 152, then 78.

---

## Where it goes

Tagged operations by the contract they called, Aug 15 to Sep 22:

| Venue | Operations | Wallets |
|---|---:|---:|
| 0x | 280 | 119 |
| LI.FI | 216 | 84 |
| Morpho | 196 | 87 |
| SwapProxy (verified name, operator unknown) | 180 | 79 |
| Uniswap | 160 | 81 |
| Plain token or ETH sends | 154 | 105 |
| Moonwell | 152 | 72 |
| YO | 146 | 67 |
| Approvals only | 96 | 86 |
| Uniswap LP positions | 36 | 13 |
| KyberSwap | 9 | 4 |
| Spark PSM | 7 | 1 |
| Aerodrome | 6 | 2 |
| Avantis | 3 | 2 |

Of the seven launch plugins, Morpho, Moonwell and Uniswap show up heavily and Aerodrome and Avantis barely. **Bankr and Virtuals leave nothing we can separate**: Bankr trades go through Base MCP's generic `swap` tool, and most of the Virtuals plugin is sign-in and off-chain calls.

Priced value is rough: about **$61.5K** across the window, with 385 operations unpriced. About $50.0K of that is one wallet's 16 operations, mostly Spark PSM swaps of up to about $8,000. Everyone else together moved about $11.5K.

---

## What the tag can't see

- **Signatures.** Base MCP can also sign messages, and it pays for x402 APIs by signing a USDC authorization that someone else submits. Neither is a wallet operation, so neither carries the tag. The two x402 payments in plugin PR #107 have no suffix at all.
- **Wallets that stopped before Aug 15.** Our node's history starts at block 50,000,000; earlier numbers cover only wallets we could see afterwards.
- **The same user in the app.** A Base MCP user who does the same swap inside the wallet app gets a different code, not `bmcp_blue`. One wallet in the data carries 27 `bc_mnip` operations alongside 5 `bmcp_blue` ones. The tag marks where an operation came from, not who the user is.
- **Tomorrow.** The code is unregistered and undocumented. Coinbase can change it at any time.

---

## Find it yourself

1. Take any transaction to the ERC-4337 EntryPoint v0.6 (`0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789`).
2. Decode `handleOps` and take each user operation's `callData`.
3. If it ends in `626d63705f626c7565090080218021802180218021802180218021`, that operation came through Base MCP. The `ox` library's `Attribution.fromData` decodes it to `{ codes: ['bmcp_blue'] }`.

A plain substring search over transaction input finds the candidates; decoding the bundle tells you which operation and wallet they belong to.

---

## Exhibits

- **[`0xc2e346ca…`](https://base.blockscout.com/tx/0xc2e346ca220255225fcfb38e2b0d1c1ca83b245d03f151be6228251de083616c)**, May 27. The plugin-repo approve from issue #51. The same bundle holds a `bc_mnip` operation and an operation with an old-style 16-byte origin hash: three attribution styles in one transaction.
- **[`0x8b51a3e8…`](https://base.blockscout.com/tx/0x8b51a3e8e693fce4ed2d3ffcfa89ffdd8d68a3ea746dfa9e4cd510d290677f56)**, Sep 10. KyberSwap's `"Source":"base-mcp"` label and the `bmcp_blue` tag on the same operation, approved with a passkey on `keys.coinbase.com`.
- **[`0xef1b073b…`](https://base.blockscout.com/tx/0xef1b073bd71013bd7cae38c112805fa0ea4dc3dfcb75915647ac90d619662cf8)**, Sep 5. A wallet created through Coinbase's smart wallet factory (`0xba5ed110…5842`) inside a Base MCP operation. The tag is on both its deployment data and its first swap, 0.001 ETH to 2.43 USDC.

---

## Open questions

**Who runs the 229 wallets.** The chain shows the routine and when it runs, not the operator or the purpose: testing, farming, or a product built on Base MCP.

**What `bmcp_blue` is for.** An unregistered code has no payout address in the registry. Coinbase hasn't said what it uses the tag for.

**How big the first two months were.** Our lower bound misses early wallets that left. An archive node would settle it.

---

*Verified September 28, 2026. Operations from Aug 15 to Sep 22 (blocks 50,000,000–51,657,640) were read from ChainWard's own Base node, which was about six days behind the chain tip, so the window ends Sep 22. Earlier operations for the same wallets were listed from Blockscout's account-abstraction index and decoded from Base's public RPC. Receipts beyond the node's retained range came from the public RPC. The five plugin-repo transactions and the three exhibits were re-read from public RPC and Alchemy before publishing, along with a random sample of 24 counted operations; all carried the tag. Registry results were read from Base's Builder Codes contract (`0x000000BC7E6457e610fe52Dcc0ca5b3ce59C8E80`) at the live head. Venue names come from verified contract names and plugin docs. USD values price stablecoins at $1 and ETH and cbBTC at daily close; other tokens are unpriced. Counts are wallets, not people, and the chain shows where operations went, not why. Nothing here is a verdict on Base MCP or any wallet.*

> Disclosure: ChainWard publishes its own MCP server (`chainward-mcp-server`) and drafted a Base MCP plugin in May. Base's plugin repo accepts contributions only from its core team, so it was never submitted. No ChainWard wallet appears in the data.
