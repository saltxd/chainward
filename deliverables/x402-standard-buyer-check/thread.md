# Thread draft: x402-standard-buyer-check (NOT POSTED)

Rules: one @chainwardai post that UTC day (replies count), original post only, no replies with links under other accounts' posts, never resend. No vendor, host or seller wallet in any post. Numbers are from the Oct 21, 2026 run (16:14 to 16:52 UTC). Counts below use X's rule that any link is 23 characters. The link carries `?ref=cw1028` for the placeholder publish date; change it to the real date (`x-MMDD`) when it posts.

**Clash to settle first:** `ops/social/funnel.md` schedules an @chainwardai "x402 lint thread" for Oct 27 linking `/x402/watch`, and an @SaltCx quote of it on Oct 28. This draft is the same story linking the decode. Post one of them, not both: if the Oct 27 thread already went out, use the single post below as the @SaltCx quote's link, or skip it.

## The post (use alone)

```text
We pointed a standard x402 buyer at 1,391 live paid endpoints, without paying. 33 would fail on a seller's mistake and 6 would sign a payment valid for over a day, all on hosts whose listings already showed a problem. How to check yours: chainward.ai/decodes/x402-standard-buyer-check?ref=cw1028
```

261 characters.

## Optional thread (4 posts; the link goes in the last one)

1. (251)

```text
On Oct 21 we pointed a standard x402 buyer at 1,391 live paid endpoints, without paying: each payment was replayed offline. Most would have paid fine. 33 would fail on a seller's mistake, and 6 would have the buyer sign a payment valid for over a day.
```

2. (271)

```text
The mistakes: v1 network names like 'base' in a v2 402 (16). A token name the token doesn't use, like 'USDC' for Base USDC's 'USD Coin' (12). A payment window over a day (6, one until 2083). A token address with nothing deployed (3). The offer in the body, no header (2).
```

3. (241)

```text
Two more 402s carried no offer at all: paused deployments. All 39 seller mistakes were on hosts whose catalog listings already showed a problem, still broken that day. On 1,267 endpoints from hosts no listing had flagged, the buyer hit none.
```

4. (184)

```text
Most fixes are one field. How to check your own 402, with a short script that runs a standard buyer without paying, or send us your host for a free first check: chainward.ai/decodes/x402-standard-buyer-check?ref=cw1028
```

## Sources per post

- **Post / 1:** 1,391 = `summary.json` `headline.live_402_endpoints`. "Without paying, replayed offline" = `summary.json` `stock_buyer`. "Most would have paid" = `outcomes_all_live.SIGNS_VALID_AUTHORIZATION` 1,301 of `headline.in_scope_endpoints` 1,342. 33 = 16 + 12 + 3 + 2 (`outcomes_all_live`: v1 names, wrong domain, asset not a contract, body only); the two `FAIL_NO_X402_CHALLENGE` are excluded because `outreach.md` Corrections 2 shows they were paused deployments. 6 = `OVER_AUTHORIZE_VALIDITY_OVER_1_DAY`. "All on hosts whose listings already showed a problem" = `headline.failing_endpoints_on_previously_flagged_hosts` 39.
- **2:** class counts from `outcomes_all_live`. 'USDC' vs 'USD Coin' = `candidates.json` rank 4 (`stock_buyer.detail`, `rpc_checks`). "One until 2083" = rank 5 `impact` (the class has 2 such endpoints on 1 host, so "one" means one seller).
- **3:** paused deployments = `outreach.md` Corrections 2 and the `x-vercel-error: DEPLOYMENT_DISABLED` header in `probes_r1.jsonl` (16:19:53 and 16:20:09 UTC). 39 on flagged hosts = `headline.failing_endpoints_on_previously_flagged_hosts`; still broken that day = second probe of every one, 3 to 33 minutes later (probe JSONL). 1,267 and "none" = `headline.untargeted_in_scope_endpoints` and `untargeted_note` (both failures were the paused 402s).
- **4:** "one field" = fixes in `outreach.md` notes; the script was run on 2026-10-22 against our own route and a local test server (see `publish-checklist.md`); free first check = live `/x402/watch` ("First check free").

## Graphic (optional)

None required. If made: one stat card in the ChainWard style (1200x675 @2x): "1,391 live 402s / 1,301 paid / 33 fail / 6 sign for a week or more / 0 x402 mistakes on 1,267 unflagged endpoints", source line "Standard @x402/fetch buyer, Oct 21 2026, replayed offline". No hosts, sellers or addresses on the card.
