# OpenGradient ($OPG) — Thread Draft

Brand voice: "we just audit, you decide." Not adversarial. Numbers are the hook.

---

## Tweet 1 / Hook (272 chars)

OpenGradient ($OPG) is the highest-trending agent token on Virtuals: ~$285M market cap.

Token is 12 days old. ACP service revenue: $0 — it's not registered as an ACP agent at all.

We pulled every wallet, every transfer, every contract. Here's what the chain actually shows.

---

## Tweet 2 / Wallet map (269 chars)

The "agent wallet" listed on the Virtuals dashboard (0x7043…44Fb) has:

- 0 ETH
- 0 OPG
- nonce 0
- 0 transactions, 0 transfers (Blockscout)

It has literally never been used. That's normal for an infra/token launch — but it means there's no agent process to point at.

---

## Tweet 3 / Token economics (271 chars)

Where the 1B OPG supply lives:

- 70.65% in 3 MerkleVester contracts
- 21.12% in team Gnosis Safes
- 3.80% in the LayerZero bridge to OpenGradient L1
- 3.15% in one EOA
- **0.13% in the actual trading pool**

That last one is why $0.8M of liquidity backs ~$300M FDV.

---

## Tweet 4 / Real activity (273 chars)

What IS happening on-chain:

The OpenGradient OFT bridge is taking ~13K-OPG batches every few minutes, mostly from one address. That's real product traction for an L1 bridge.

It is not agent commerce. ACP API returns zero records for the name and the wallet.

---

## Tweet 5 / Takeaway + link (266 chars)

$285M mcap is real arithmetic — price × supply. It's also ~0.27% liquidity-to-FDV with 97% of supply locked in vesters/bridges/safes.

That's a different asset shape than an aGDP-earning agent. Not wrong. Just different.

Full decode: chainward.ai/decodes/opengradient-decode

---

## Graphic notes

Optional 1200x675 cards (ChainWard design system: `#0a0a12` bg, `#12121f` cards, sharp corners):

1. **Holder pie / bar:** "Where the 1B OPG lives" — bar chart, vesters/safes/bridge/EOA/LP. Headline: 0.13% of supply is in the trading pool.
2. **The four-zero wallet:** screenshot-style card of the listed `walletAddress` with all four counters at 0. Caption: "the agent wallet on the dashboard."
3. **LP vs FDV:** simple two-bar comparison — $0.8M LP vs $300M FDV. Caption: "0.27%."

Pin tweet 1; add card 1 to tweet 3, card 2 to tweet 2, card 3 to tweet 5.

---

## Verification sources for tweets

- $285M mcap / FDV: `https://api.virtuals.io/api/virtuals/72059` (`fdvInVirtual` × VIRT/USD = $0.78)
- ACP empty: `https://acpx.virtuals.io/api/agents?filters[name][$eqi]=OpenGradient`
- Listed wallet 0/0/0/0: `https://base.blockscout.com/api/v2/addresses/0x70434389e58F5aFcf8e43B9EeF066472Af3044Fb/counters`
- Holder distribution: `https://base.blockscout.com/api/v2/tokens/0xFbC2051AE2265686a469421b2C5A2D5462FbF5eB/holders`
- LP composition: `eth_call` to token contract `0xFbC2051A…F5eB` with `balanceOf(0x2b75b90f…ceeb)` at decode block
- Bridge activity: `https://base.blockscout.com/api/v2/addresses/0xacd4d6f4Ea54045e4cA21E23AE423700D95aEAA2/token-transfers?type=ERC-20`

Tweets 1, 2, 3, 4, 5 character counts: 272, 269, 271, 273, 266 (all <280).
