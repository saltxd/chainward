---
title: "Six Ways a 402 Breaks a Standard x402 Buyer"
subtitle: "A standard x402 buyer read 1,391 live 402s without paying. 39 had a seller mistake: 33 fail, 6 sign payments valid a week or more."
plain: "Most paid x402 APIs we tested would take a standard buyer's payment, but 39 endpoints, all on hosts whose catalog listings already showed a problem, had a mistake in their payment request that makes the payment fail or leaves the buyer's signature valid for days. If you sell over x402, check yours for the six mistakes below."
plainHref: "/x402/watch?ref=decode-x402-check"
plainCta: "Sell over x402? Get a free first check of your endpoints →"
date: "2026-10-28"
slug: "x402-standard-buyer-check"
seoTitle: "Why x402 Payments Fail: Six 402 Mistakes That Break a Standard @x402/fetch Buyer (1,391 Endpoints Tested, Oct 2026)"
---

# Six Ways a 402 Breaks a Standard x402 Buyer

x402 lets a program pay for a single API request, usually in USDC, with no account. The seller's server answers `402 Payment Required` with its price and how to pay, and the buyer signs a payment and sends the request again. If one field in that 402 is wrong, the buyer can't pay, or it signs a payment that stays valid far longer than the call.

On Oct 21 we pointed a standard x402 buyer at 1,500 paid endpoints, picked from the 50,102 that public x402 catalogs list. 1,391 answered with a live 402. The buyer never paid: we kept each 402, replayed the payment offline with a throwaway key, and checked what it would have signed against the token's own contract.

By a standard buyer we mean the x402 client packages @x402/fetch and @x402/evm, version 2.27.0, with their default settings: it pays only in default tokens such as USDC, and at most $1 a payment.

Short version:

- **Most would have paid.** Of the 1,342 endpoints the standard buyer could try to pay, 1,301 got a payment the token would accept.
- **41 would not.** Two were deployments their host had paused, which answer every request with a 402 that carries no x402 offer. The other 39 had a mistake in the seller's 402: 33 would make the payment fail, and 6 would have the buyer sign a payment that stays valid for more than a day.
- **Six mistakes cover every failure** (table below). Most take one field to fix.
- **They were visible before we asked.** All 39 sat on hosts whose catalog listing already showed a mistake, and each was still broken when we asked twice that day. On 1,267 endpoints from hosts no listing had flagged, the buyer hit no x402 mistake at all.
- **They cluster.** The 39 came from 15 sellers on 30 hosts. One seller's 15 APIs account for 16 of them.
- **A broken offer can hide behind a working one.** Nine more sellers passed only because the buyer paid with their Base USDC offer, while another of their offers could not settle.
- **Check yours** with the steps and the short script below, or email us your host: the first check is free, then $10 a month.

---

## What the buyer did

| What the standard buyer did | Endpoints |
|---|---:|
| Signed a payment the token would accept | 1,301 |
| **Failed** on a mistake in the seller's 402 | **33** |
| **Signed a payment valid for more than a day** | **6** |
| Failed because the host had paused the deployment | 2 |
| Not judged: price above the buyer's $1 cap | 8 |
| Not judged: no EVM offer of the plain `exact` kind (Solana only, for example) | 24 |
| Not judged: the buyer picked a test-network offer | 17 |
| Answered with a 402 | 1,391 |

**Failed** means the buyer stopped before paying, or signed a payment the token rejects when it is settled. **Valid for more than a day** means the payment would go through, but the signed authorization can still be collected long after the request. The three "not judged" rows get no verdict: the buyer refuses prices above $1, it pays only on EVM chains, and a test-network payment is not a real one.

---

## The six mistakes

| | Mistake | Endpoints (hosts) | What the buyer did | Fix |
|---|---|---:|---|---|
| 1 | Version 1 network names like `base` in a version 2 402 | 16 (15) | Found no offer it could match, and stopped | CAIP-2 ids, like `eip155:8453` |
| 2 | A token name or version the token doesn't use | 12 (9) | Signed; the token rejects it | Copy `name()` and `version()` from the token |
| 3 | A payment window over a day | 6 (3) | Signed for 7 days, or until 2083 | `maxTimeoutSeconds` of 60 to 300 |
| 4 | A token address with no contract | 3 (2) | Refused the unknown token | The token's real address |
| 5 | The version 2 offer in the body only | 2 (1) | Couldn't read the 402 | Send the `PAYMENT-REQUIRED` header |
| 6 | No x402 offer at all | 2 (2) | Couldn't read the 402 | Both were paused deployments |

### 1. Old network names in a version 2 402 (16 endpoints)

x402 version 2 names networks with CAIP-2 ids: `eip155:8453` for Base, `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` for Solana. Version 1 used short names like `base`. These 402s said `x402Version: 2` but offered only `base` and `solana`, so the buyer found nothing it could match and stopped before signing:

```text
No network/scheme registered for x402 version: 2 which comply with the payment requirements.
```

All 16 were one seller's 15 APIs, and one change fixes all of them. A day after we wrote to that seller, the endpoint we re-checked had switched to `eip155:8453`. A leftover `base` offer next to a correct `eip155:8453` one does no harm: the buyer skips it.

**Check:** decode the `PAYMENT-REQUIRED` header (base64 JSON). Every `accepts[].network` should contain a colon.

### 2. A token name or version the token doesn't use (12 endpoints)

To pay, the buyer signs under the token's EIP-712 domain: a name, a version, the chain and the token's address. The token checks every signature against its own domain. The 402 supplies the name and version in `extra.name` and `extra.version`, and the buyer uses them as given.

All 12 offered Base USDC with `extra.name` set to `USDC`. On Base, USDC's `name()` is `USD Coin`, version `2`. The buyer signs without complaint and the token rejects the signature at settlement, so the call fails after the buyer has signed. The hashes show it: on Base, `{USD Coin, 2}` gives `0x02fa7265…834f`, the token's own `DOMAIN_SEPARATOR`, and `{USDC, 2}` gives `0xe824be45…a3d7`.

Names differ from chain to chain. On World Chain, USDC's `name()` is `USDC`, and three sellers wrote `USD Coin` there, the reverse of the Base mistake. Those were second offers (see below), so they are not in the 12.

**Check:** read `name()` and `version()` from the token's contract on that chain, and copy them exactly.

### 3. A payment window over a day (6 endpoints)

`maxTimeoutSeconds` is a length of time. The buyer signs a payment that stays valid until now plus that many seconds. Four endpoints on two hosts asked for 604,800 or 604,900 seconds, about seven days, on plain USDC offers. Two endpoints on one host sent a Unix time in that field, about 1.79 billion, so the buyer would sign a payment valid until 2083.

The payment goes through, which makes this one easy to miss. But until it expires, a signed payment can still be settled: a call that failed, or was retried, can be charged days later. Week-long windows belong to Circle Gateway's batched offers, not to a plain USDC transfer.

**Check:** a fresh 402 should show 60 to 300 for a plain USDC offer: never more than 86,400 (a day), and never a timestamp.

### 4. A token address with no contract (3 endpoints)

Two hosts run by one operator asked to be paid in a mistyped copy of Base USDC's address. Nothing is deployed there. The buyer refused it as a token it doesn't know:

```text
All payment requirements were rejected by spendControls: only default assets or entries in spendControls.allowedAssets are allowed.
```

A buyer with spend controls turned off would sign a payment in a token that doesn't exist. Either way, nothing can settle.

**Check:** `eth_getCode` on the asset must return more than `0x`. Copy token addresses from the issuer: Circle publishes USDC's address for each chain.

### 5. The offer in the body, without the header (2 endpoints)

In version 2 the offer travels in a `PAYMENT-REQUIRED` header, as base64-encoded JSON. The standard buyer reads that header, and reads the body only for version 1. One host put its version 2 offer in the JSON body only, with payment headers of its own design, and the buyer stopped:

```text
Invalid payment required response
```

Its offer also named Base USDC `USDC`, so once the header is fixed, mistake 2 comes next.

**Check:** the header is there and decodes to your `accepts` list. The same JSON can stay in the body as well.

### 6. A 402 with no x402 offer (2 endpoints)

Both were deployments their host had paused. Vercel answers every path of a disabled deployment with its own 402 (`x-vercel-error: DEPLOYMENT_DISABLED`), and it disables deployments over usage limits or plan changes. A buyer can't tell that apart from a broken x402 server. One of the two sellers had moved to a new host, but catalogs still listed the old one.

**Check:** your paid route answers with your own 402 and a `PAYMENT-REQUIRED` header, not your host's error page. When you move, update your listings.

---

## They were visible before we asked

Every one of the 39 seller mistakes was on a host whose catalog listing already showed a mistake before we sent a request: 22 on hosts our check of the PayAI and Bazaar listings had flagged, and 17 on hosts that Agent402's index flags for a USDC domain mismatch or lists with an unusual token. Each was still broken when we asked a second time that day. A mistake that shows in a catalog listing doesn't reach the seller's inbox.

Hosts that no listing had flagged looked different. On the 1,267 endpoints we tried there, the buyer hit no x402 mistake. Its only two failures were the paused deployments.

---

## A broken offer can hide behind a working one

A 402 can offer several ways to pay: different chains, different tokens. The standard buyer pays with one it can use, which on these endpoints was Base USDC. If another offer is broken, a buyer who pays only on that chain, or only in that token, fails, and none of the counts above show it.

Nine more sellers we looked at closely were in this spot, one of them from the random sample of small hosts:

- **World Chain USDC named `USD Coin`** (its `name()` there is `USDC`): three sellers.
- **Stablecoins without EIP-3009** (no `transferWithAuthorization`), such as USDT, DAI and some bridged USDC, offered as plain `exact` payments: four sellers. The buyer signs an authorization the token can't execute. Offer them with `assetTransferMethod: 'permit2'`, or drop them.
- **A name with a special character**: one seller offered USD₮0 as `USD0`, but the token's `name()` is spelled with ₮ (U+20AE).
- **A mistyped USDC address on a second chain**: one seller.

That is why the watch below tries each offer on its own.

---

## If you buy over x402

- The default spend controls are what stopped the payment to a token address with nothing behind it (mistake 4). With them off, the buyer would have signed it.
- Mistakes 2 and 3 get past the standard buyer, because it signs with whatever name and window the 402 gives it. A payment that fails after you have signed, or a 402 that asks for a window of days, is a mistake in the seller's 402, not in your wallet.

---

## How to check your own 402

1. **Ask without paying.** Request a paid route with no payment header. You should get a 402 with a `PAYMENT-REQUIRED` header: base64-encoded JSON with an `accepts` list. (Mistakes 5 and 6.)
2. **Network names.** Every `accepts[].network` should be a CAIP-2 id with a colon, like `eip155:8453`. (Mistake 1.)
3. **The token exists.** For each EVM offer, the `asset` must have code. (Mistake 4.)
4. **The name and version are the token's.** Copy `extra.name` and `extra.version` from the token's own `name()` and `version()`. Base USDC: `USD Coin`, `2`. (Mistake 2.)
5. **EIP-3009 or permit2.** If `authorizationState(address,bytes32)` reverts on the token, it has no `transferWithAuthorization`: offer it with `assetTransferMethod: 'permit2'`, or drop it. (Second offers, above.)
6. **A short window.** `maxTimeoutSeconds` is a number of seconds, not a timestamp: 60 to 300 for a plain USDC offer. (Mistake 3.)

Steps 3 and 4 with Foundry's `cast` (a block explorer's read-contract page works too):

```sh
cast code <asset> --rpc-url https://mainnet.base.org        # anything but 0x
cast call <asset> "name()(string)" --rpc-url https://mainnet.base.org
cast call <asset> "version()(string)" --rpc-url https://mainnet.base.org
```

Then run a standard buyer against your route without paying. This script sends one unpaid request, lets @x402/fetch build the payment with a throwaway key, and prints what it would sign instead of sending it. If the buyer would stop, it prints where.

```js
// npm i @x402/fetch@2.27.0 @x402/evm@2.27.0 viem
// node check-402.mjs https://api.example.com/v1/quote [POST]
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const [url, method = 'GET'] = process.argv.slice(2);
const client = new x402Client(); // default settings: default tokens, $1 cap
registerExactEvmScheme(client, { signer: privateKeyToAccount(generatePrivateKey()) }); // throwaway key

let calls = 0;
const onlyYour402 = async (input, init) => {
  if (calls++ === 0) return fetch(input, init); // the real request: your 402
  const headers = new Request(input, init).headers; // the paid retry: read here, never sent
  const sent = headers.get('payment-signature') ?? headers.get('x-payment');
  const paid = JSON.parse(Buffer.from(sent, 'base64').toString('utf8'));
  const auth = paid.payload?.authorization ?? paid.payload?.permit2Authorization ?? {};
  const until = Number(auth.validBefore ?? auth.deadline);
  console.log('offer it chose:', paid.accepted ?? `${paid.scheme} on ${paid.network} (x402 v1)`);
  console.log('signature valid for', until - Math.floor(Date.now() / 1000), 'seconds');
  return new Response('{}', { status: 200 });
};

const init = method === 'POST' ? { method, body: '{}', headers: { 'content-type': 'application/json' } } : undefined;
try {
  const res = await wrapFetchWithPayment(onlyYour402, client)(url, init);
  if (calls === 1) console.log('no 402 to pay: the route answered', res.status);
} catch (e) {
  console.log('a standard buyer stops here:', e.message);
}
```

Compare the `extra.name` and `extra.version` it prints with step 4, and the seconds with step 6. The script tests the offer the default buyer picks; a second chain or token needs its own test.

---

## A free first check, then $10 a month

If you'd rather not run it yourself, ChainWard's [x402 endpoint watch](/x402/watch?ref=decode-x402-check) does it for you every day. A stock x402 client (@x402/fetch with its default settings) tries each of your paid endpoints. It never pays. The day a payment would fail, or a buyer would sign a payment that stays open for more than a day, we email you what broke and the field to fix. It also tries each of your offers on its own, as a buyer who pays only on that network, or only in that token, would.

- **The first check is free**, within a day of your email: each paid endpoint we can find on your host, what the buyer did with it, and the field to fix where it failed.
- **Then one run a day**, and an email only when something changes: an endpoint breaks, or starts working again. Each email shows the request we sent, what came back and the fix. A quiet day sends nothing.
- **$10 a month in USDC on Base**, paid after the free first check, and only if you keep the watch. No account. To stop, reply to any of our emails.
- **To start**, email hello@chainward.ai with your host, or your `/.well-known/x402` or `openapi.json` URL. Already have a fix note from us? Reply 'start' to it. The payment address is on [the watch page](/x402/watch?ref=decode-x402-check): copy it from there, never from a transaction history.

The watch makes one unpaid request per endpoint a day, at least 1.2 seconds apart. POST endpoints get an empty JSON body; if yours needs a sample request before it answers 402, send us one. Like this study, it can't see what happens after a payment.

---

## Limits

- **The sample leans toward broken hosts, on purpose.** We probed every host whose listing showed a mistake, and those hosts hold all 39. So 39 of 1,391 is not a rate for x402. On hosts no listing had flagged, x402 mistakes came to zero in 1,267 endpoints; counting the paused deployments, 2 failed (0.16%). Weighting the flagged hosts back in, we estimate about 20 failing hosts among the roughly 2,703 PayAI and Bazaar hosts in scope (0.74%), two of them the paused ones. The 95% upper bound is 130 hosts (4.8%), because the 1,913 hosts in the long tail were sampled with 62.
- **Before payment only.** We replayed each payment offline, so we see what the buyer would sign and whether the token would accept it. We can't see what happens after that: the seller's handler, or the uptime of the facilitator, the service that settles the payment on-chain.
- **EVM only.** Solana offers, other payment schemes and prices above the buyer's $1 cap are reported, not judged.
- **One client.** @x402/fetch and @x402/evm 2.27.0 with default settings. Other clients, or other settings, can behave differently.
- **Empty bodies.** POST endpoints got `{}`. A price that depends on the input may differ from a real call's.
- **One afternoon.** The run was Oct 21, 16:14 to 16:52 UTC. Sellers fix things, so re-check before you rely on any line here.
- **Seen, not counted.** Three 402s carried header blocks of 17.5 KB, 18.4 KB and 30.1 KB. Node's fetch over HTTP/1.1 refuses header blocks over 16,384 bytes; with the two hosts we tested, it negotiated HTTP/2 and read them. Keep the `PAYMENT-REQUIRED` header small.

## Method

- **Catalogs.** PayAI's catalog, the x402 Bazaar and Agent402's index list 50,102 x402 endpoints on 3,303 hosts. We left out our own hosts, the hosts of a newsletter that has paid us bounties, local and IP-only hosts, and MCP resources.
- **Sample: 1,500 endpoints on 1,460 hosts.** All 38 hosts whose PayAI or Bazaar listing showed a mistake in our check of the listing (up to three endpoints each, 63 in all); 23 of the 28 hosts that Agent402's index flags and the other catalogs don't list (38 endpoints); one endpoint on each of the 1,337 unflagged hosts with the most catalog activity; and one random endpoint on each of 62 hosts drawn at random from the other 1,913.
- **Probe.** One unpaid request per endpoint, Oct 21, 16:14 to 16:52 UTC, at most two a second overall, a 10-second timeout, no redirects followed, POST body `{}`, user agent `chainward-x402-lint/1.0 (+https://chainward.ai)`.
- **Replay.** Each live 402 went through @x402/fetch with @x402/evm's `registerExactEvmScheme` and default spend controls, signing with a throwaway key on our machine. Nothing was signed for or sent to any seller.
- **Token checks.** On public RPCs: whether the asset has code; its `name()`, `version()` and `DOMAIN_SEPARATOR()`; and whether its code has the EIP-3009 functions. A signature counts as valid only if its domain hashes to the token's own separator.
- **Confirmation.** Each of the 41 was requested a second time, 3 to 33 minutes later, and failed the same way. We re-checked one endpoint per seller on Oct 21 at 19:02 UTC, before writing to them, and again on Oct 22 at 16:13 UTC. On Oct 28 we re-checked one endpoint per seller again: 5 of 27 now pass.

*Run on Oct 21, 2026, 16:14 to 16:52 UTC. Counts are endpoints unless they say hosts or sellers. Hosts are hostnames; sellers group hosts that share a payment address or an owner.*

> Disclosure: ChainWard sells the watch described here, and is an x402 seller on Base itself (`api.chainward.ai`); its own endpoints were not in the sample. On Oct 21 and 22, before publishing, we emailed fix notes to the 19 sellers in this study that publish an email address, each with an offer of the watch; two could not be delivered. We name none of them here.
