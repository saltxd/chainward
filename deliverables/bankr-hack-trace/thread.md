# Launch Thread — Bankr Hack Decode

Target: 5-tweet thread, each ≤280 chars. Lead tweet pulls the decode URL preview.

---

## Tweet 1 — Lede (the hook + URL for OG card)

> Bankr's 14-wallet hack wasn't a smart-contract bug.
>
> It was the same architectural primitive that broke on May 4. Verified on-chain.
>
> Decoded: chainward.ai/decodes/bankr-hack-trace

279 chars. The OG card carries the visual.

---

## Tweet 2 — What a Bankr wallet actually is

> "14 bankr wallets compromised" doesn't mean 14 seed phrases leaked.
>
> Privy holds the keys (Nitro enclaves, Shamir shares).
> Bankr holds the signing rights via MetaMask Delegation Framework (ERC-7710).
>
> You own the address. Bankr owns the right to use it.

273 chars.

---

## Tweet 3 — The May 4 dress rehearsal

> May 4: attacker sent a Bankr Club NFT to Grok's wallet → unlocked high-privilege actions. Morse-coded reply at @grok → Grok decoded it as plaintext → Bankrbot treated the verified-account reply as authoritative → 3B DRB transferred.
>
> ~$174K. Tx 0x6fc7eb…25739a.

277 chars.

---

## Tweet 4 — Bankr's fix is the confession

> Bankr's post-incident fix list, per SlowMist:
> • Optional IP whitelisting
> • Permissioned API keys
> • Toggle to **disable actions triggered by X replies**
>
> If the root cause were key theft, the fix would be key rotation.
> The fix is "turn off the input channel."

277 chars.

---

## Tweet 5 — The hard receipts + CTA

> What we verified:
> ✅ Bankr 1 still holds 16 ETH (~$34K)
> ✅ May 4 attacker wallets: empty as of block 46,290,542
> ✅ ~80% "recovery" was negotiated post-doxxing, not seized
> ❌ 14 May 19 victims: not publicly disclosed yet
>
> Full decode → chainward.ai/decodes/bankr-hack-trace

280 chars.

---

## Graphic notes

- Static OG card at `apps/web/public/decodes/bankr-hack-trace/og.png` (1200×675).
- Suggested visual: split-frame timeline showing May 4 (single wallet, single tx) on left and May 19 (14 wallets, paused) on right, with the shared exploit primitive across the bottom (NFT-as-capability + AI-trust-chain + delegated-signing).
- Colors: card `#12121f`, accent green `#4ade80` for "verified" callouts, accent red `#f87171` for "compromised."

## Verification sources

- Bankr 1 balance: Blockscout `/api/v2/addresses/0xb1058c959987E3513600EB5b4fD82Aeee2a0E4F9` @ block 46,290,802.
- May 4 attacker (`ilhamrafli.base.eth`) state: Blockscout `/api/v2/addresses/0x35DdFc1Cf8835b3B1EA960D892a82963D3386D19` @ block 46,290,542.
- May 4 DRB tx: Blockscout `/api/v2/transactions/0x6fc7eb7da9379383efda4253e4f599bbc3a99afed0468eabfe18484ec525739a`.
- MetaMask delegation framework `redeemDelegations` flow: Blockscout tx `0x019d8eaa00e0dc19d78a917940ea3e0172e5949dbefb265efff0d7ef181ca057`.
- SlowMist commentary: `@evilcos` X posts May 19–20; `hacked.slowmist.io` entry for 2026-05-19.
- Bankr disclosure: `@bankrbot` thread May 19–20, 2026.
