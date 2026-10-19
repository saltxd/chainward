# Edge fallback (Cloudflare Worker)

chainward.ai and api.chainward.ai run in the homelab behind a Cloudflare Tunnel, so a home internet outage took the whole site down (2026-10-13: 119 minutes, Google Fiber).

This Worker runs on both hostnames:

- **Home up:** every request passes through untouched. Public pages (decodes, /wallet-api, docs, reports, agent pages, home) and their build assets are copied to Workers KV. A copy is kept only when the request carried no cookie or Authorization header and the response set no cookie. Pages are rewritten at most once a day (the sitemap lists ~280, and the free plan allows 1,000 KV writes a day); build assets are written once.
- **Tunnel down** (Cloudflare 520 to 530, or the origin unreachable): saved copies are served with `x-chainward-fallback: snapshot <time>`. Anything without a copy gets a plain "briefly offline" 503 page, or JSON `TEMPORARILY_OFFLINE` on the API ("You were not charged"). The API's own 502/503/504 answers pass through unchanged.

Tests: `apps/api/node_modules/.bin/vitest run --root infra/edge-fallback`

Deploy, once logged in (`npx wrangler@4 login`):

    cd infra/edge-fallback
    npx wrangler@4 kv namespace create SNAPSHOTS   # once; put the id in wrangler.toml
    npx wrangler@4 deploy

Rollback: `npx wrangler@4 delete`, or remove the two Workers routes in the dashboard.

**Deploys are manual.** CI does not deploy this Worker: a change merged to `main` reaches Cloudflare only when someone runs `npx wrangler@4 deploy` here (wrangler is OAuth-logged-in on the Mac). Deploy right after merging any change to this directory.

**Takedowns.** When a page is retracted or withdrawn (a decode, a dataset page), also delete its saved copy, or the old version can still be served during an outage for up to a day. The key is host + path:

    npx wrangler@4 kv key delete --namespace-id 408de82892c5456c977958e10db716f4 --remote "chainward.ai/decodes/<slug>"

Ops notes and the live outage test (2026-10-14): BookStack page 378, "Edge fallback Worker".

Free plan limits: 100,000 Worker requests a day (the account saw ~35k a day in Oct 2026) and 1,000 KV writes a day. Writes are the tight one: Cloudflare mailed a 50% warning on 2026-10-19 when every page was still rewritten daily (500-600 writes), so since then a page is checked once a day and written only when its content changed. Reads (100,000 a day) run at about 1,500. Usage by operation: `wrangler` is logged in, and the account's GraphQL `kvOperationsAdaptiveGroups` dataset answers with the OAuth token; `kv key list` needs `--remote` or it shows the empty local store. Both routes are set to request-limit failure mode **fail open** (dashboard, Workers Routes, Edit), so past the daily limit traffic goes straight to the origin instead of failing. Re-check that setting after a deploy that changes the routes.

Deployed 2026-10-13: KV namespace `SNAPSHOTS` (id in wrangler.toml), warmed with all 281 sitemap pages, their build assets and the API discovery documents.
