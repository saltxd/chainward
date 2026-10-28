# Publish checklist: x402-standard-buyer-check (DRAFT, not published)

Every number and claim in `decode.md` and `thread.md`, mapped to its source file and field, and to how it was checked. Run: 2026-10-21 16:14 to 16:52 UTC. Drafted 2026-10-22. Publish date in the frontmatter (`2026-10-28`) is a placeholder.

**Privacy rule for this file** (it lands in the public repo if the decode ships): no seller name, host or wallet appears here. Sellers are referred to by their `candidates.json` rank (`C1` to `C15`) or their `outreach.md` note number (`O-note 1` to `O-note 26`). Never copy `candidates.json`, `outreach.md`, the probe JSONL or `stock_outcomes.json` into `deliverables/`: they name sellers and hold their payment addresses.

## Source shorthand

| Code | File | Notes |
|---|---|---|
| S | `ops/x402lint/summary.json` (generated 2026-10-21T16:56:16Z) | field paths below are JSON keys |
| C*n* | `ops/x402lint/candidates.json`, entry with `"rank": n` | 15 entries |
| O | `ops/x402lint/outreach.md` | header, "Corrections" 1 to 4, summary table, notes 1 to 26 |
| M | `memory/project_x402_endpoint_lint_oct2026.md` | method, unbiased rate, notes sent Oct 21 and 22, Oct 22 re-probe |
| R | `~/Forge/chainward/scripts/x402-watch/README.md` | buyer setup and outcome classes |
| P | `https://chainward.ai/x402/watch`, fetched 2026-10-22 17:01 UTC (HTTP 200, 49,593 bytes) | quoted text below; mailto links decoded from Cloudflare's email protection |
| PJ | probe JSONL in `ops/x402lint/`: `probes_r1`, `probes_r2`, `probes_r2b`, `probes_r3`, `probes_extras_r1`, `probes_tail_r1`, `reprobe_oct22` | raw requests and answers |
| SO | `~/.claude/jobs/48e44fc2/tmp/x402lint/stock_outcomes.json` | per-endpoint table S was built from; used only to cross-check host counts, never as the only source |
| F | `ops/social/funnel.md` | scope rule: never "3% of x402 is broken" or "41 would break" without the split |

## Frontmatter

| Claim | Source | Check |
|---|---|---|
| title "Six Ways a 402 Breaks a Standard x402 Buyer" | six classes = S `outcomes_all_live` failing keys; P lists the same six | count of FAIL_* plus OVER_* keys present in S = 6 |
| subtitle: 1,391 live 402s | S `headline.live_402_endpoints` | 130 characters (limit 140) |
| subtitle: 39 had a seller mistake | 41 (S `headline.stock_buyer_fails_or_over_authorizes`) minus the 2 `FAIL_NO_X402_CHALLENGE`, which O Corrections 2 shows were paused deployments | P says the same: "39 of them ... (33) ... (6)" |
| subtitle: 33 fail | 16 + 12 + 3 + 2 (S `outcomes_all_live`: `FAIL_V1_NETWORK_NAMES_IN_V2`, `FAIL_WRONG_EIP712_DOMAIN`, `FAIL_ASSET_NOT_A_CONTRACT`, `FAIL_V2_BODY_ONLY_NO_HEADER`) | arithmetic; P "(33)" |
| subtitle: 6 sign payments valid a week or more | S `outcomes_all_live.OVER_AUTHORIZE_VALIDITY_OVER_1_DAY` = 6; per endpoint 604,800 s (C9, 2 endpoints), 604,900 s (C8, 2), about 1.79e9 s (C5, 2) | SO `detail` for the 6 rows: 604800, 604900, 1792599496, 604800, 1792599918, 604900 |
| plain: "39 endpoints, all on hosts whose catalog listings already showed a problem" | S `headline.failing_endpoints_on_previously_flagged_hosts` = 39 | 326 characters, 2 sentences, no em dash (web test limit 330) |
| plain: "valid for days" | C8, C9 (7 days), C5 (decades) | |
| plainHref `/x402/watch?ref=decode-x402-check` | page exists (P); `campaignRef` accepts `^[a-z0-9][a-z0-9_-]{0,31}$` (`apps/web/src/app/x402/watch/WatchEmailLink.tsx`) | path starts with one `/`, as `plainCallout` requires |
| plainCta "Get a free first check" | P: "First check free. Then $10 a month in USDC on Base." | |
| `draft: true` | `apps/web/src/lib/decodes.ts` hides any decode with `draft === true` | gray-matter parse: boolean true |

## Opening and short version

| Claim | Source | Check |
|---|---|---|
| x402 explained (402 with price, buyer signs and resends; one wrong field and you don't get paid) | P "Why" section | |
| Oct 21; 1,500 endpoints picked from 50,102 that public catalogs list | S `sample_frame.endpoints_probed_round1` = 1,500, `sample_frame.catalog_endpoints_deduped` = 50,102; P "1,500 paid endpoints from public x402 catalogs, picked from the 50,102 they list" | |
| 1,391 answered with a live 402 | S `headline.live_402_endpoints` | |
| never paid; replayed offline with a throwaway key; checked against the token's contract | S `stock_buyer` ("replayed offline with a throwaway key; nothing was signed for or sent to any seller"); S `outcome_rules.valid` ("domain verified on a public RPC") | |
| standard buyer = @x402/fetch and @x402/evm 2.27.0, default settings, default tokens, $1 a payment | S `stock_buyer` ("default spendControls (default assets, $1 per payment)"); R "How it checks" step 2 | installed versions in `scripts/x402-watch/node_modules`: @x402/fetch 2.27.0, @x402/evm 2.27.0 |
| 1,301 of the 1,342 the buyer could try to pay | S `outcomes_all_live.SIGNS_VALID_AUTHORIZATION`; S `headline.in_scope_endpoints` | 1,301 + 41 = 1,342; 1,342 = 1,391 - 24 - 17 - 8 |
| 41 would not; 2 paused; 39 seller mistakes: 33 fail, 6 over a day | S `headline.stock_buyer_fails_or_over_authorizes`; O Corrections 2 | split as in the subtitle row; F scope rule satisfied (41 never appears without the split) |
| six mistakes cover every failure; most take one field | S `outcomes_all_live` (six failing classes, no `FAIL_TOKEN_HAS_NO_EIP3009` or `FAIL_OTHER`); fixes in O notes 4, 5, 9, 10, 14, 16, 19 (one field each; O-note 14 is a header plus a name) | |
| all 39 on hosts whose listing already showed a mistake; still broken when asked twice | S `headline.failing_endpoints_on_previously_flagged_hosts`; second probe: PJ | drafter's check, 2026-10-22: every one of the 41 failing endpoints has 2 probes 208 to 1,971 s apart with the same defect in both |
| 1,267 endpoints from unflagged hosts, no x402 mistake | S `headline.untargeted_in_scope_endpoints` = 1,267 (activity census 1,220 + random tail 47, S `strata.*.endpoint_level.in_scope_endpoints`); S `headline.untargeted_note` ("both failures are 402s with no x402 challenge at all"); O Corrections 2 | P: "none failed on an x402 mistake" |
| 15 sellers on 30 hosts | 30 = S `headline.failing_hosts_previously_flagged`. Hosts per class: 15 (C1: endpoint + 15 `other_endpoints` = 16 URLs on 15 hostnames), 9 (C4 lists 9 hostnames; S `strata.agent402_flagged.endpoint_level.bad_hosts` = 12 = 9 + 2 (C2) + 1 (C3), so all 12 wrong-domain endpoints sit on those 9), 3 (C5, C8, C9), 2 (C2), 1 (C3): 15 + 9 + 3 + 2 + 1 = 30. Sellers: 1 (C1, one shared payTo per C1 `notes`) + 9 (C4; O Corrections 1 shows one of the nine hostnames is a second host of a seller not otherwise in the probe set) + 3 + 1 (C2 "one operator (shared payTo)") + 1 = 15 | SO cross-check: 16 on 15, 12 on 9, 6 on 3, 3 on 2, 2 on 1 |
| one seller's 15 APIs account for 16 | C1 (`summary`: "All 15 ... APIs we probed"; 16 URLs) | SO: 16 rows, 15 hosts, all `catalog_flagged` |
| nine more sellers passed only on their Base USDC offer while another offer could not settle | C6, C7, C10, C11 (three sellers), C12, C13, C14 = 9; each `stock_buyer.classification` = `SIGNS_VALID_AUTHORIZATION` on `eip155:8453` | |
| first check free, then $10 a month | P | |

## What the buyer did (table)

| Row | Source |
|---|---|
| 1,301 signed a valid payment | S `outcomes_all_live.SIGNS_VALID_AUTHORIZATION` |
| 33 failed on a seller's mistake | 16 + 12 + 3 + 2, S `outcomes_all_live` |
| 6 signed for more than a day | S `outcomes_all_live.OVER_AUTHORIZE_VALIDITY_OVER_1_DAY` |
| 2 failed, host paused | S `outcomes_all_live.FAIL_NO_X402_CHALLENGE`; O Corrections 2; PJ `probes_r1.jsonl` headers `server: Vercel`, `x-vercel-error: DEPLOYMENT_DISABLED` at 16:19:53 and 16:20:09 UTC |
| 8 over the $1 cap | S `outcomes_all_live.POLICY_OVER_1_USD_DEFAULT_CAP` |
| 24 no EVM `exact` offer | S `outcomes_all_live.OUT_OF_SCOPE_NO_EVM_EXACT_OFFER`; S `outcome_rules.excluded_from_share` ("Solana-only, upto/batch-only") |
| 17 test-network offer | S `outcomes_all_live.TESTNET_ONLY_OFFER_SELECTED` |
| 1,391 total | sum of the rows above = 1,391 = S `headline.live_402_endpoints` |
| "Failed" and "valid for more than a day" definitions | S `outcome_rules.fail`, `outcome_rules.over_authorize` (validBefore - now > 86,400 s) |

## The six mistakes

| Claim | Source | Check |
|---|---|---|
| Table counts 16, 12, 6, 3, 2, 2 | S `outcomes_all_live` | P prints the same six counts |
| Table hosts 15, 9, 3, 2, 1, 2 | see "15 sellers on 30 hosts" above; 2 = C15 (two hostnames) | SO |
| **1.** CAIP-2 ids `eip155:8453`, `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | O-note 5 Fix line; O-note 17 ("the 32-character CAIP-2 form") | |
| 1. the 402s said version 2 but offered only `base` and `solana` | C1 `defect`, `probes[*].offers` | |
| 1. error text "No network/scheme registered for x402 version: 2 which comply with the payment requirements." | C1 `stock_buyer.offline_replay.error` | reproduced by the drafter's script on a local test server (below) |
| 1. one change fixes all | O-note 5 ("The 14 other ... APIs we checked today need the same change") | |
| 1. a day after we wrote, the re-checked endpoint had switched to `eip155:8453` | M (second-batch paragraph: Oct 22 re-probe showed the C1 seller fixed; note sent Oct 21 13:30 to 13:36 MDT); PJ `reprobe_oct22.jsonl` first row, 2026-10-22T16:13:25Z, `accepts[0].network` = `eip155:8453` | only one endpoint of the 16 was re-checked; the sentence says so |
| 1. a leftover `base` offer next to `eip155:8453` is skipped | S `notes.class6` | |
| 1. check: every network contains a colon | O-note 5 Verify line | |
| **2.** buyer signs under the EIP-712 domain (name, version, chain, token address) | C4 `stock_buyer.offline_replay.signed_domain` keys `name`, `version`, `chainId`, `verifyingContract` | |
| 2. all 12 offered Base USDC as `USDC`; on Base `name()` is `USD Coin`, version `2` | C4 `defect`, `stock_buyer.detail`; C4 `rpc_checks` `eth_call` `0x06fdde03` returns "USD Coin", `0x54fd4d50` returns "2" (mainnet.base.org, 2026-10-21T16:34:42Z to 16:34:43Z) | SO: all 12 rows `eip155:8453 name='USDC' version='2'` |
| 2. token rejects at settlement; the call fails after the buyer has signed | C4 `impact` | |
| 2. `{USD Coin, 2}` gives `0x02fa7265…834f` = `DOMAIN_SEPARATOR`; `{USDC, 2}` gives `0xe824be45…a3d7` | C3 `rpc_checks` (`computed` entry and `eth_call` `0x3644e515` at 16:50:54Z); C4 `rpc_checks` | O-note 9 Verify line |
| 2. World Chain USDC `name()` is `USDC`; three sellers wrote `USD Coin` | S `notes.class1` ("3 hosts"); C11 (`defect`, three sellers); O-notes 7, 11, 13 (chainId 480, version `2`) | |
| 2. those are second offers, not in the 12 | C11 `stock_buyer.classification` = `SIGNS_VALID_AUTHORIZATION` on Base | |
| **3.** `maxTimeoutSeconds` is a duration; buyer signs validBefore = now + maxTimeoutSeconds | O-note 4 ("which signs validBefore = now + maxTimeoutSeconds"); R table row `OVER_AUTHORIZE_VALIDITY_OVER_1_DAY` | drafter's script on a local server: 604,800 in, "valid for 604800 seconds" out |
| 3. four endpoints on two hosts at 604,800 or 604,900 s | C8 (604,900, endpoint + 1 other), C9 (604,800, endpoint + 1 other) | SO |
| 3. two endpoints on one host with a Unix time, about 1.79 billion; valid until 2083 | C5 (`probes[*].offers[*].maxTimeoutSeconds` 1,792,599,496; `other_endpoints` 1; `impact` "validBefore lands in 2083") | SO second value 1,792,599,918 |
| 3. a failed or retried call can be charged days later | C8 `impact` ("a failed or retried call can be settled up to ~7 days later"); P ("could still be collected long after the request") | |
| 3. week-long windows belong to Circle Gateway's batched offers | O-notes 10 and 16; C8 `defect` and `notes` | |
| 3. check: 60 to 300 s; never over 86,400; never a timestamp | O-notes 10, 16 (60 to 300); S `outcome_rules.over_authorize` (86,400); O-note 4 | |
| **4.** two hosts, one operator, mistyped copy of Base USDC's address, nothing deployed | C2 `vendor` ("one operator (shared payTo)"), `defect`; C2 `rpc_checks` `eth_getCode` = `0x` (16:34:41Z) | address deliberately not printed |
| 4. error text "All payment requirements were rejected by spendControls: only default assets or entries in spendControls.allowedAssets are allowed." | C2 `stock_buyer.offline_replay.error` (first sentence) | reproduced by the drafter's script |
| 4. spend controls off would sign a token that doesn't exist | C2 `impact` | |
| 4. check: `eth_getCode` must return more than `0x` | O-note 19 Verify line | |
| 4. Circle publishes USDC's address for each chain | general fact, also used in the published `address-poisoning-base` decode | |
| **5.** v2 offer travels in a base64 `PAYMENT-REQUIRED` header; buyer reads the body only for v1 | C3 `stock_buyer.source` ("header first, body only if x402Version === 1"); O-note 14 Fix line | |
| 5. one host, body only, its own payment headers | C3 `defect` ("custom X-Payment-* headers instead"); 2 endpoints (C3 endpoint + 1 other) | |
| 5. error text "Invalid payment required response" | C3 `stock_buyer.offline_replay.error` | reproduced by the drafter's script |
| 5. its offer also named Base USDC `USDC` | C3 `defect`, `probes[*].offers[*].extra.name` | |
| 5. same JSON can stay in the body | drafter's local test: a 402 with both header and body signed normally | |
| **6.** both were paused Vercel deployments; `x-vercel-error: DEPLOYMENT_DISABLED`; every path | O Corrections 2 ("on every path, homepage included"); PJ headers (above) | `reprobe_oct22.jsonl` shows the same header on both on Oct 22 |
| 6. Vercel disables deployments over usage limits or plan changes | O Corrections 2 and O-note 15 (citing vercel.com/docs/errors/DEPLOYMENT_DISABLED) | |
| 6. one seller had moved; catalogs still listed the old host | O Corrections 2 and O summary row 6 (stale listings on the old host) | |

## They were visible before we asked

| Claim | Source | Check |
|---|---|---|
| 22 on hosts our check of the PayAI and Bazaar listings flagged | S `strata.catalog_flagged.endpoint_level.stock_buyer_fails_or_over_authorizes` = 22; S `strata.catalog_flagged.selection` ("every host whose PayAI/Bazaar listing already showed a lint hit") | `tools/select_probes.py`: the flags are our lint (`lintlib.lint_accept`) of the catalogs' listing data |
| 17 on hosts Agent402's index flags (USDC domain mismatch) or lists with an unusual token | S `strata.agent402_flagged.endpoint_level.stock_buyer_fails_or_over_authorizes` = 17; S `strata.agent402_flagged.selection` | 22 + 17 = 39 |
| still broken when asked a second time | PJ (see short version) | |
| 1,267 endpoints, no x402 mistake; the only two failures were the paused deployments | S `headline.untargeted_*`, `untargeted_note`; O Corrections 2 | |

## A broken offer can hide behind a working one

| Claim | Source |
|---|---|
| the standard buyer paid with Base USDC on these endpoints | C6, C7, C10 to C14 `stock_buyer.detail` (all `eip155:8453`) |
| nine more sellers | C6, C7, C10, C11 (3), C12, C13, C14 |
| one of them from the random sample of small hosts | C14 `summary` ("Found in the random tail sample") |
| World Chain USDC named `USD Coin`: three sellers | C11; S `notes.class1` |
| stablecoins without EIP-3009 as plain `exact`: four sellers | C6 (MegaUSD), C10 (USDT, USDT0), C13 (Binance-Peg USDC), C14 (DAI); S `notes.class8_asset_no_eip3009` (bytecode scanned for the EIP-3009 selectors) |
| buyer signs an authorization the token can't execute; use `assetTransferMethod: 'permit2'` or drop | O-notes 3, 8, 12 Fix lines; C6 `notes` (@x402/evm's own default-asset table lists permit2 for that token) |
| USD₮0 offered as `USD0`; `name()` has ₮ (U+20AE) | C12 `defect`; O-note 2 |
| mistyped USDC address on a second chain: one seller | C7 `defect` |
| the watch tries each offer on its own | R step 2 ("each offer on its own ... allowedAssets: true"); P ("We also try each of your offers on its own") |

## If you buy over x402

| Claim | Source |
|---|---|
| default spend controls stopped the payment to an address with no token; with them off the buyer would sign | C2 `impact`, `stock_buyer.offline_replay.error` |
| mistakes 2 and 3 get past the standard buyer: it signs | C4 and C5/C8/C9 `stock_buyer.offline_replay.ok` = true |

## How to check your own 402

| Claim | Source | Check |
|---|---|---|
| steps 1 to 6 | O-note Verify lines: 5 (colon), 14 (header decodes), 19 (getCode), 9 (name and version), 3/8/12 (`authorizationState` reverts), 4/10/16 (duration, 60 to 300) | |
| Base USDC `USD Coin`, `2` | C4 `rpc_checks` | |
| `cast code` / `cast call ... "name()(string)"` / `"version()(string)"` lines | standard Foundry syntax | **not run**: Foundry is not installed on this Mac. Run the three lines once against Base USDC before publishing; expected `0x6080…` (non-empty), `USD Coin`, `2` |
| the script (30 lines) | written by the drafter from `scripts/x402-watch/src/replay.ts` (same imports and calls); `registerExactEvmScheme(client, { signer: account })` is the package's own documented use (`@x402/evm` `exact/client` type docs) | run 2026-10-22 with Node v26.12.1, @x402/fetch 2.27.0, @x402/evm 2.27.0, viem 2.56.9: one unpaid GET to `https://api.chainward.ai/api/risk/wallet?address=<Base USDC contract>` at 17:10 and 17:17 UTC printed `eip155:8453`, `extra.name` `USD Coin`, version `2`, "valid for 120 seconds"; a local test server (127.0.0.1) reproduced each class: `base` under v2, body only and no offer threw the errors quoted above; mistyped asset threw the spendControls error; 604,800 and a Unix time printed those validities; a `USD₮0` name decoded intact; a v1 402 printed "exact on base (x402 v1)"; a POST-only route answered 405 to GET ("no 402 to pay") and signed on POST |
| the script tests only the offer the default buyer picks | R step 2 (the watch adds a per-offer buyer for this reason) | |

## A free first check, then $10 a month

Every line is P's own wording or a close paraphrase. Re-fetch P before publishing and diff against these:

| Decode line | P text |
|---|---|
| A stock x402 client (@x402/fetch with its default settings) tries each of your paid endpoints. It never pays. The day a payment would fail, or a buyer would sign a payment that stays open for more than a day, we email you what broke and the field to fix. | identical (P subhead) |
| It also tries each of your offers on its own, as a buyer who pays only on that network, or only in that token, would. | "We also try each of your offers on its own, as a buyer who pays only on that network, or only in that token, would." |
| The first check is free, within a day of your email: each paid endpoint we can find on your host, what the buyer did with it, and the field to fix where it failed. | "The first check, free, within a day of your email: each paid endpoint we can find on your host, what the buyer did with it, and the field to fix where it failed." |
| Then one run a day, and an email only when something changes ... A quiet day sends nothing. | "Then one run a day." / "An email only when something changes: an endpoint breaks, or starts working again. It shows the request we sent, what came back and the fix. A quiet day sends nothing." |
| $10 a month in USDC on Base, paid after the free first check, and only if you keep the watch. No account. To stop, reply to any of our emails. | identical (P "Price") |
| email hello@chainward.ai with your host, or your `/.well-known/x402` or `openapi.json` URL. Already have a fix note from us? Reply 'start' to it. | P "How to start"; the address is behind Cloudflare email protection on P and decodes to `hello@chainward.ai?subject=x402 endpoint watch` |
| The payment address is on the watch page: copy it from there, never from a transaction history. | P "Paying us" ("copy it from this page, never from a transaction history"); the address itself is deliberately not printed in the decode |
| one unpaid request per endpoint a day, at least 1.2 seconds apart; POST endpoints get an empty JSON body; send a sample request if needed; can't see after a payment | P "Limits"; R step 1 |

No free tier beyond the first check exists on P, and the decode offers none.

## Limits

| Claim | Source |
|---|---|
| we probed every host whose listing showed a mistake; they hold all 39 | S `strata.catalog_flagged` (38 of 38 hosts probed), `strata.agent402_flagged`; S `headline.failing_endpoints_on_previously_flagged_hosts` |
| 39 of 1,391 is not a rate for x402 | S `headline.caveat_all_probed`; P ("these counts are not a rate for x402 as a whole") |
| zero x402 mistakes in 1,267; 2 failed counting the pauses (0.16%) | S `headline.untargeted_failures`, `untargeted_share_pct`; O Corrections 2 |
| about 20 failing hosts of about 2,703 PayAI and Bazaar hosts in scope (0.74%), two of them the paused ones; 95% upper bound 130 (4.8%); tail of 1,913 sampled with 62 | S `headline.stratified_estimate_payai_bazaar_hosts` (`failing_hosts_point`, `in_scope_hosts_est`, `share_point_pct`, `failing_hosts_95_upper`, `share_upper_pct`, `method`); the 20 = 18 (S `strata.catalog_flagged.endpoint_level.bad_hosts`) + 2 (S `strata.activity_census.endpoint_level.bad_hosts`, the paused pair) |
| offline replay; can't see the handler or the facilitator's uptime | S `notes.limits`; R; P "Limits" |
| EVM only; Solana, other schemes and prices over $1 reported, not judged | S `outcome_rules.excluded_from_share`; P |
| one client, 2.27.0 | S `stock_buyer` |
| POST got `{}`; input-dependent prices may differ | `tools/probe.py` (`data = b"{}" if method == "POST"`); S `observations_not_counted.price_vs_listing_note` |
| Oct 21, 16:14 to 16:52 UTC | S `probe_window_utc` |
| header blocks of 17.5, 18.4 and 30.1 KB; Node over HTTP/1.1 refuses above 16,384 bytes; HTTP/2 with the two hosts tested | S `observations_not_counted.headers_note` |

## Method

| Claim | Source |
|---|---|
| PayAI's catalog, the x402 Bazaar and Agent402's index | M ("PayAI, Bazaar dump, Agent402") |
| 50,102 endpoints on 3,303 hosts | S `sample_frame.catalog_endpoints_deduped`, `catalog_hosts` |
| left out our own hosts, a newsletter's that pays us bounties, local and IP-only hosts, MCP resources | S `sample_frame.excluded` (first key, the excluded-host rule: 23 endpoints; `mcp_resource`: 36); `tools/select_probes.py` `SKIP_HOST` |
| 1,500 endpoints on 1,460 hosts | S `sample_frame.endpoints_probed_round1`, `hosts_probed_round1` |
| 38 flagged hosts, up to 3 endpoints each, 63 endpoints | S `strata.catalog_flagged` (`population_hosts`, `probed_endpoints`, `selection`) |
| 23 of the 28 Agent402-flagged hosts outside PayAI and Bazaar, 38 endpoints | S `strata.agent402_flagged` (`population_hosts`, `probed_hosts`, `probed_endpoints`) |
| one endpoint on each of the 1,337 busiest unflagged hosts | S `strata.activity_census` (`population_hosts`, `selection`) |
| one random endpoint on each of 62 hosts drawn from the other 1,913 | S `strata.random_tail` (`population_hosts`, `probed_hosts`, `selection`, seed 20261021) |
| 63 + 38 + 1,337 + 62 = 1,500 endpoints; 38 + 23 + 1,337 + 62 = 1,460 hosts | arithmetic |
| one unpaid request per endpoint, at most 2 a second, 10 s timeout, no redirects, POST `{}`, user agent `chainward-x402-lint/1.0 (+https://chainward.ai)` | `tools/probe.py` docstring and `UA`; M ("unpaid, at most 2 req/s") |
| replay through @x402/fetch with `registerExactEvmScheme`, default spend controls, throwaway key, nothing signed for or sent to a seller | S `stock_buyer` |
| token checks on public RPCs: code, `name()`, `version()`, `DOMAIN_SEPARATOR()`, EIP-3009 functions; valid only if the domain hashes to the token's separator | S `outcome_rules.fail` and `valid`; S `notes.class8_asset_no_eip3009`; C `rpc_checks` (mainnet.base.org) |
| each of the 41 requested a second time 3 to 33 minutes later, failed the same way | PJ; drafter's check (2026-10-22): 41 of 41 endpoints have two probes, gaps 208 s to 1,971 s, defect present in both; S `sample_frame.re_probes` (round 2: 167, round 3: 3) |
| re-checked one endpoint per seller Oct 21 19:02 UTC before writing, and Oct 22 16:13 UTC | O header ("2026-10-21 19:02:51 to 19:03:50 UTC ... 29 requests"); M (Oct 22 "re-probed 16:13-16:14 UTC first"); PJ `reprobe_oct22.jsonl` (29 rows, 16:13:25Z to 16:14:15Z) |
| footer: hosts are hostnames; sellers group hosts sharing a payment address or an owner | C1 `notes` (one payTo for 15 hosts); C2 `vendor`; O Corrections 1 |

## Disclosure

| Claim | Source |
|---|---|
| ChainWard sells the watch | P |
| ChainWard is an x402 seller on Base (`api.chainward.ai`) | published decodes' disclosures; our route answered with a Base USDC offer in the drafter's test |
| own endpoints not in the sample | S `sample_frame.excluded` (`chainward` in the excluded-host rule); `tools/select_probes.py` `SKIP_HOST` |
| fix notes to 19 sellers on Oct 21 and 22, each with the offer | M (5 sent Oct 21 with the $10 offer; 14 sent Oct 22 with the offer and a link to P); O summary (26 sellers, 6 with no public contact, 1 with a GitHub issue as its only contact) |

## Verification done while drafting (2026-10-22)

- Em dashes (U+2014): 0 in all three files. No en dashes either.
- gray-matter parse of the frontmatter: `draft` is boolean `true`; subtitle 130 characters; plain 326 characters, 2 sentences.
- Word count: 2,895 words of prose (3,100 with the code blocks).
- Leak scan: 175 seller names, host labels and catalog hostnames from `candidates.json`, `outreach.md` and S `observations_not_counted`, plus 40 seller payment addresses (first 10 and last 6 characters too), searched case-insensitively in `decode.md`: no seller name, host or wallet. (Hits were only the phrase "15 APIs" and the two public USDC domain hashes.) Re-run on all three files before publishing.
- Thread posts counted with any link as 23 characters: 261 (single), 251, 271, 241, 184.

## Deliberately left out

- **The 3.06% share** (41 of 1,342, S `headline.share_pct_all_probed`) and its interval [2.3, 4.1]: it reads as a rate for x402 as a whole, which S `headline.caveat_all_probed`, P and F all rule out. `apps/web/src/app/x402/watch/__tests__/page.test.tsx` even forbids "41" and any "3%" on the watch page; the decode prints 41 only with the split.
- **Every seller name, host, payTo and the mistyped asset address**, the bounty numbers and the public audit that named some of them earlier (they would name sellers indirectly), and per-seller sizes (routes, 30-day payers, payTo balances).
- **Chain-specific details of single-seller second-offer patterns** (which chain the USD₮0, USDT, DAI, Binance-Peg USDC, MegaUSD and mistyped-address offers were on): generalized so no one seller is identifiable.
- **The 92.7% live rate, the 17 listing-versus-live price gaps, the any-offer defect counts by class** (S `defect_classes_hosts_any_offer`, whose class names are null in S): not needed, or not defined in the inputs.
- **Our own routes' result in the watch on Oct 22** (`memory/project_x402_watch.md`: 11 pass, 2 over the $1 cap): outside the listed inputs.

## Before publishing

1. **User OK** to publish the lint numbers (M: "article candidate, needs the user's OK").
2. **Date.** Not before 2026-10-28 (sellers' window). Set `date`, the footer and the `?ref=x-MMDD` tag in `thread.md` to the real day.
3. **Re-probe** the sellers the day before: `cd ~/.claude/projects/-Users-mburkholz-Forge-chainward/ops/x402lint && python3 -I outreach_reprobe.py out.jsonl && python3 -I outreach_check.py out.jsonl` (one unpaid request per endpoint, 1.2 s apart). The Oct 21 counts stay as the run's numbers; update only the present-tense sentence in mistake 1 ("A day after we wrote to that seller ...") if more fixes landed, and consider a one-line "since then" note.
4. **Run the `cast` lines** once (Foundry) and the script once more on a live route.
5. **Re-fetch P** and diff the watch section against the table above (price, free first check, how to start, limits).
6. **Slug.** `x402-standard-buyer-check` (the brief suggested `x402-stock-buyer-check`; "standard" matches P's headline). Decide before the first post; X caches by URL.
7. **Move** `decode.md`, `thread.md` and this file to `deliverables/<slug>/` (the loader skips `thread.md` and `publish-checklist.md`). Remove `draft: true` only in the publishing commit.
8. **OG image** at `apps/web/public/decodes/<slug>/og.png` (1200x675), pre-rendered before any post (deliverables/README.md step 3).
9. **Manifest:** `node scripts/build-decode-manifest.mjs`, commit `apps/api/src/data/decode-manifest.json`.
10. **Ship** by push to `main` (CI, bump, Flux). Verify by the live image tag or `/api/health`, then `chainward.ai/decodes/<slug>` 200, `og.png` 200 image/png, `og:image` static, manifest slug.
11. **Tests:** `apps/web/src/lib/__tests__/decodes.test.ts` (plain box present, at most 330 characters, no em dash) passes with the decode in place.
12. **Thread:** settle the clash with `ops/social/funnel.md` (an @chainwardai lint thread on Oct 27 and an @SaltCx quote on Oct 28). One @chainwardai post per UTC day.
