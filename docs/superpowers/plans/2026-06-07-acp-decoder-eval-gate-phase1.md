# acp-decoder Eval Gate — Phase 1 Implementation Plan

> **For agentic workers:** execute task-by-task with TDD; commit after each. Steps use checkbox (`- [ ]`) syntax. Design: `docs/superpowers/specs/2026-06-06-acp-decoder-eval-gate-design.md`.

**Goal:** Fix the un-paginated transfer fetch so the paid agent's window counts are correct, add Layer A golden tests on the deterministic `quickDecode` output, and gate `pnpm test` in CI on every PR.

**Architecture:** vitest golden tests over the pure `quickDecode()` path (fixtures-in, typed-result-out, no network in `replayMode`); a paginating Blockscout fetch helper bounded by the 30d window + a hard page cap; a `pnpm test` step added to the existing GHA `check` job (already runs on PRs).

**Tech Stack:** TypeScript (NodeNext ESM), vitest 4, pnpm 9 workspace + turbo, GitHub Actions. Node 22.

**Branch:** `feat/acp-decoder-eval-gate`. **Execution:** single-threaded inline TDD (write-heavy single-codebase work — no parallel coders), then a fresh-context adversarial review of the whole diff before the PR.

---

### Task 1: Paginate the Blockscout transfer fetch (fix the undercount)

**Files:**
- Modify: `apps/acp-decoder/src/data-fetch.ts` (the `fetchBlockscoutTransfers` ~50-row single fetch)
- Test: `apps/acp-decoder/__tests__/data-fetch.test.ts`

- [ ] **Step 1 — failing test.** Mock a 3-page Blockscout `…/token-transfers?type=ERC-20` response: page 1 + page 2 carry `next_page_params`, page 3 returns `next_page_params: null`. Make page-3 items older than `now - 30d`. Assert: (a) the helper follows `next_page_params` across pages, (b) it **stops** once a page's oldest item is older than the 30d window (doesn't fetch beyond), (c) returns `{ items, truncated: false }`, and a separate case where hitting `MAX_PAGES` returns `truncated: true`.
- [ ] **Step 2 — run, expect RED** (`pnpm --filter @chainward/acp-decoder test`): current single-fetch returns only page 1 / has no `truncated`.
- [ ] **Step 3 — implement.** Loop on `next_page_params`: fetch page, accumulate `items`; stop when `next_page_params == null`, OR the page's oldest `timestamp < now - 30d` (widest window `computeActivity` uses), OR page count reaches `MAX_PAGES` (const, e.g. 20) → set `truncated: true`. Preserve the existing return shape consumers expect; add `truncated`. Keep the existing single-fetch signature working for callers (return items array; expose `truncated` via the fetch-meta path used in Task 2).
- [ ] **Step 4 — run, expect GREEN.**
- [ ] **Step 5 — commit** (`fix(acp-decoder): paginate Blockscout transfers to cover the 30d window`).

### Task 2: Surface fetch completeness in the decode result

**Files:**
- Modify: `packages/decode/src/types.ts` (`QuickDecodeResultData` — add `fetch_meta: { transfers_fetched: number; transfers_truncated: boolean }`)
- Modify: `packages/decode/src/quick-decode.ts` (populate `fetch_meta` from the fixtures/fetch input)
- Test: `packages/decode/__tests__/quick-decode.test.ts` (extend) or new `fetch-meta.test.ts`

- [ ] **Step 1 — failing test:** a fixture with a `truncated` transfer set yields `result.data.fetch_meta.transfers_truncated === true` and a correct count.
- [ ] **Step 2 — RED.**
- [ ] **Step 3 — implement:** thread the count/`truncated` from the fixtures input into `QuickDecodeResult.data.fetch_meta`. Bump `SCHEMA_VERSION` if asserted by `types-compile`/schema tests.
- [ ] **Step 4 — GREEN** (`pnpm --filter @chainward/decode test`).
- [ ] **Step 5 — commit** (`feat(decode): expose transfer fetch_meta (count + truncated)`).

> Rationale: a capped fetch must be *visible* so a count can never silently masquerade as complete — the structural lesson from the $144 bug.

### Task 3: Layer A golden assertions on the `quickDecode` struct

**Files:**
- Create: `packages/decode/__tests__/fixtures/expected/{axelrod-active,ethy-borderline,lucien-dormant,luna-dormant,otto-active}.json` (curated, human-verified)
- Create: `packages/decode/__tests__/golden.test.ts`

- [ ] **Step 1 — generate candidates:** for each of the 5 fixtures, run `quickDecode({…, replayMode:true})` and dump `data.*`. **Human-verify** the load-bearing fields (don't blind-accept): balances (ETH/USDC amount+usd), `activity.transfers_{24h,7d,30d}` + `unique_counterparties_30d`, `usdc_pattern`, `survival.classification`, `wallet_arch`, `discrepancies[]`, resolver `name`/`address`. Spot-check ≥1 fixture's classifier verdict against chain reality. Save verified values to `expected/<name>.json`.
- [ ] **Step 2 — write `golden.test.ts`:** `describe.each(fixtures)` → load fixture + `expected/<name>.json` → `quickDecode({…, replayMode:true})` → assert `data.*`: numeric fields `toBeCloseTo`/exact per tolerance, addresses exact (lowercased), classifier verdicts strictly equal, `discrepancies` set-equal.
- [ ] **Step 3 — run, expect GREEN** (`pnpm --filter @chainward/decode test`). If a fixture reveals a real current bug, note it; fix or quarantine with a clear comment (do not bend `expected` to bless a bug).
- [ ] **Step 4 — commit** (`test(decode): Layer A golden assertions on quickDecode struct (5 fixtures)`).

### Task 4: Gate `pnpm test` in CI on PRs

**Files:**
- Modify: `.github/workflows/build.yml` (`check` job)

- [ ] **Step 1 —** add `- run: pnpm test` immediately after `- run: pnpm build` in the `check` job. (`check` has no `if`, so it runs on `pull_request` → becomes a required gate. `docker` job stays push-only.)
- [ ] **Step 2 —** sanity: `pnpm test` passes locally at repo root (`turbo test` over decode/auto-decode/acp-decoder/common/indexer).
- [ ] **Step 3 — commit** (`ci: run pnpm test in the check job to gate PRs`).

### Task 5: Final adversarial review + PR

- [ ] Dispatch a fresh-context review subagent: give it ONLY the branch diff + the spec's success criteria; ask it to find gaps (does Task 1 actually stop at 30d? do golden assertions cover the load-bearing fields? any `expected.json` that looks blind-snapshotted?). 
- [ ] Address findings (re-review if needed).
- [ ] Open PR `feat/acp-decoder-eval-gate` → main; body links the spec + scorecard (257) + roadmap #8.

---

## Self-review notes
- Types consistent: `fetch_meta` defined in Task 2 (types.ts) is what Task 1's `truncated` feeds and Task 3 may assert.
- No placeholder steps; each task is independently committable and leaves tests green.
- Phase-1 scope only — Layer B (Promptfoo reasoning gate + Degen Claw/HL fixtures) is a separate later plan.
