---
title: "The Honeypot Isn't in ClankerToken"
subtitle: "The 'Clanker Hook' tokens people search for are real Clanker launches, and most never traded. The one working trap we found is a copycat whose verified source hides a mint inside an imported library."
date: "2026-09-26"
slug: "clankertoken-honeypot-check"
seoTitle: "ClankerToken & \"Clanker Hook\" Tokens: Rug, Scam, or Honeypot? Checked On-Chain"
---

# The Honeypot Isn't in ClankerToken

People search for this exact phrase: *"clankertoken" rug or scam or honeypot*. They open a token on BaseScan, see the contract name `ClankerToken`, and wonder whether they're about to get trapped. A cluster of tokens is literally named "Clanker Hook", after Clanker's own Uniswap v4 hook, and those get searched too.

We read the contracts and the transfers. Short version: **a genuine Clanker token cannot be a code-level honeypot, the "Clanker Hook" tokens are real Clanker launches, and the one working mint trap we found sits in a copycat that borrows the `ClankerToken` name and hides its backdoor one file away from where anyone looks.**

---

## What a real ClankerToken can do

Clanker is the Base token launcher behind thousands of tokens. Its factory deploys every token from the same template, and the template is verified.

The current template (for example [`0xaF41Aa41…`](https://base.blockscout.com/address/0xaF41Aa41723c3C032aBE1Ad120aAC2d66B13472E), verified as `ClankerToken`):

- **Mints the whole supply once**, at deployment, to the Clanker factory, which puts it into a Uniswap v4 pool behind Clanker's locker. There is no owner mint.
- **Has no pause, no blacklist, no max-wallet, no transfer tax.** Nothing in the token can stop you from selling.
- **Gives the admin four powers, all cosmetic:** `updateAdmin`, `updateImage`, `updateMetadata`, and a one-time `verify` flag the original admin can set.
- **Has one mint path, and it isn't the deployer's.** `crosschainMint` only accepts calls from `Predeploys.SUPERCHAIN_TOKEN_BRIDGE` = `0x4200000000000000000000000000000000000028`, the Superchain's own bridge system contract. That address is in the deployed bytecode.

The older template (DRB, [`0x3ec2156D…`](https://base.blockscout.com/address/0x3ec2156D4c0A9CBdAB4a016633b7BcF6a8d68Ea2)) is the same shape with fewer knobs: the deployer can only call `updateImage`.

None of that makes a token a good buy. It means the risk isn't in the token code. It's in who holds the supply and who trades against you.

---

## The "Clanker Hook" tokens are real Clanker launches

Every "Clanker Hook" token we checked was deployed by a Clanker factory, and the factory agrees: `tokenDeploymentInfo(token)` on the current factory [`0xE85A59c6…`](https://base.blockscout.com/address/0xE85A59c628F7d27878ACeB4bf3b35733630083a9) returns the token's own address. Across our sweep of hook-named tokens, 20 of 22 are Clanker launches; the other two are Zora coins.

Most never traded. [`clankerhook` `0x768AB578…`](https://base.blockscout.com/address/0x768AB578d15E1B0EE60FcEd3eEeeFcC1d2750b07) has exactly three transfers in its whole history, all inside its creation transaction `0x804d5f494c…`: 100B minted to the factory, handed to Clanker's LP locker, deposited into Uniswap v4's PoolManager. Nobody has bought or sold it since.

On 2026-04-14 one wallet, [`0xfaBEeC69…`](https://base.blockscout.com/address/0xfaBEeC6976B5cc7Ee35Ba792bfA9C52A157e25e5), launched five "Clanker Hook" tokens through the factory in 24 seconds: blocks 44,696,374 through 44,696,386, 15:54:55 to 15:55:19 UTC, one every three blocks. Each has three transfers. None traded.

---

## Two traded. Both deployers left within minutes.

Two hook-named launches did trade, and both follow the same script: the deployer buys at launch, then sells the whole bag into whoever shows up.

- **"Clanker Hook" / HOOK [`0x5F13D8f3…`](https://base.blockscout.com/address/0x5F13D8f3Bd2A9BD439d6eC9734AC1b4FB32B3B07).** Launched at 15:21:13 UTC on 2026-02-02 with a 1.0 ETH dev-buy (tx `0x2f7eae9f2b…`). Twenty-six seconds later the deployer [`0xdbd1C0E6…`](https://base.blockscout.com/address/0xdbd1C0E6C6252492Bd5B99DA162558de7f08D68B) sold all 6,416,006,425.89 tokens for 0.990813 WETH (tx `0x6f1155fa3d…`), a small loss before fees.
- **"Clanker hook" [`0xdd47396c…`](https://base.blockscout.com/address/0xdd47396c0Fe5cDa9eE66FaB16AEa8Dc9af4dBb07).** Launched on 2026-02-07 at 19:20:09 UTC with a 0.5 ETH dev-buy (tx `0x5eeaaf813f…`). At 19:24:49 the deployer [`0x872a6699…`](https://base.blockscout.com/address/0x872a6699fBf8Db6de6a3444dbbB4E77cB6b86C6d) sold 3,909,833,649.81 tokens for 1.5100 WETH (tx `0x2961283618…`).

Liquidity can't be pulled from these pools, since Clanker's locker holds the position, so this isn't a rug in the liquidity sense. It's a launch-and-exit. One more thing the chain shows, which we can't prove means what it looks like: nearly every wallet that traded against `0xdd47` later sent ETH to one collection address, and the same is true of `0x5F13` with a different address. That pattern fits one operator on both sides of the trade.

---

## The one real trap: a copycat named ClankerToken

[`CLK2` `0xde597c05…`](https://base.blockscout.com/address/0xde597c05788134C16054ad44bFC98aa1172b70CC) is verified on Blockscout under the contract name `ClankerToken`. It was not deployed by Clanker: the factory registry returns zero for it, and the deployer is an ordinary wallet, [`0xE0bc640d…`](https://base.blockscout.com/address/0xE0bc640d797E8915BDBA732A6A444EB1a2805f38).

Its main file looks like Clanker's. `crosschainMint` checks the caller against a constant from Optimism's `Predeploys` library:

```solidity
if (msg.sender != Predeploys.L2_STANDARD_BRIDGE) revert Unauthorized();
_mint(_to, _amount);
```

On every OP-stack chain, `L2_STANDARD_BRIDGE` is the system address `0x4200000000000000000000000000000000000010`. Nobody holds its key.

The trick is in the *imported* file. CLK2's bundled `Predeploys.sol` redefines that one constant:

```solidity
address internal constant L2_STANDARD_BRIDGE = 0xFDa65631c6602d0aB09ed8A1644Fa7acf0775705;
```

The deployed bytecode contains `fda65631…` and not `4200…0010`. And [`0xFDa65631…`](https://base.blockscout.com/address/0xFDa65631c6602d0aB09ed8A1644Fa7acf0775705) is a small contract whose `owner()` is the deployer. The "bridge" is the deployer.

What the chain shows on 2025-05-09:

| UTC | Event | Tx |
|---|---|---|
| 15:29:25 | Token created with 10,000 supply, all to the deployer | `0x041906151d…` |
| 15:35:43 | Deployer seeds the pool [`0xD7d491a6…`](https://base.blockscout.com/address/0xD7d491a61b9ae6372868C661b90308973977858F) with all 10,000 | `0x9d1013d624…` |
| 15:38 – 15:48 | Two buyers buy 823.87 and 369.85 CLK2 | |
| 16:09:09 | "Bridge" mints 500,000 to the deployer | `0x4280189ea2…` |
| 16:10:47 | Deployer sells 500,045 into the pool for 0.024423 WETH | `0x42bbd5fcb1…` |
| 16:13:03 | "Bridge" mints another 500,000 | `0x7c1da4e71c…` |
| 16:13:47 | Deployer sells 500,000 for 0.000215 WETH | `0x93701d25a9…` |

The deployer printed 100 times the launch supply in four minutes and sold it into the pool, which today holds 0.00023 WETH against 956,347 CLK2.

Who got caught? As far as the chain shows, nobody outside. The two buyers, [`0x51A68828…`](https://base.blockscout.com/address/0x51A688284c3dB1e188A1521473fbB1331c2122Ff) and [`0xF516A364…`](https://base.blockscout.com/address/0xF516A3645f011c6Fd415045D409c34c1b6074Fc7), were each funded with 0.005 ETH by [`0xDc000dd2…`](https://base.blockscout.com/address/0xDc000dd23cb5A20ad346325fBb353A3Ced78c61F), which also funded the deployer with 0.03 ETH. All three transfers landed within 70 seconds, six minutes before launch. It reads as a working rehearsal of the technique, and the technique works. The same deployer ran the same play on at least two more tokens, [`0xB9820418…`](https://base.blockscout.com/address/0xB98204186Be3206eB8508EBF86F9241040C892fe) and [`0xc08cC91f…`](https://base.blockscout.com/address/0xc08cC91f6eF4cC99a6Ede96Fac08133848ef89B2): each launched with 10,000 supply, and each later sent a 1,000,000 mint to the deployer.

---

## How to check a Clanker token yourself

1. **Ignore the contract name.** Every real Clanker token is called `ClankerToken`, and so is CLK2. The name proves nothing.
2. **Ask the factory.** Call `tokenDeploymentInfo(token)` on the current Clanker factory `0xE85A59c628F7d27878ACeB4bf3b35733630083a9`. A real token comes back with its own address; zero means that factory didn't make it. Older Clanker factories (Blockscout labels them "Clanker": `0x2A787b23…`, `0x375C15db…`, `0x732560fa…`, `0x9B84fcE5…`) keep their own records.
3. **Read the imports, not just the main file.** If a mint is gated on a system contract, check the constant it resolves to in the *bundled* library, then check that address is in the bytecode. `0x4200…` addresses belong to the chain; anything else belongs to someone.
4. **Remember that genuine isn't the same as safe.** A real Clanker token can't trap your sale, but a deployer can dev-buy and dump, and the launch settings (LP fees, fee recipients) are the deployer's choice. Check who holds the supply and what the deployer wallet has done before.

ChainWard's free risk check reads a wallet's on-chain behavior. Point it at the deployer: [chainward.ai](https://chainward.ai).

---

## Open questions

**Who runs the collection wallets.** Nearly all of `0xdd47`'s counterparties later swept ETH to one address, and nearly all of `0x5F13`'s to another. The two groups share no depositors. We infer one controller per cluster; we haven't proven it.

**How the two hook deployers were funded.** Both wallets' histories start with the launch transaction itself.

**Two unexplained namesakes.** Tokens `0x2b45cE26…` and `0x0fcAbD58…` came from unverified contracts `0x4E11C4b2…` and `0x4672EBd5…`, aren't in any Clanker registry, and have one holder and zero holders. We didn't decode them.

**Search isn't exhaustive.** Blockscout's name search missed at least two `ClankerToken`-named contracts we found another way. There are likely more copycats than we counted.

---

*Verified September 26, 2026. Current state (factory registry reads, owner of `0xFDa65631…`, contract bytecode) read from a public Base RPC; transfer and transaction history from Blockscout; the namesake sweep used ChainWard's own Base node for factory registry entries, which are written once at deploy and aren't affected by the node's sync lag. Blockscout's holder counts and creator fields were unreliable for these tokens, so we don't use them. Every figure above is tied to a transaction or contract read. A genuine token can still lose you money; nothing here is a safety verdict.*
