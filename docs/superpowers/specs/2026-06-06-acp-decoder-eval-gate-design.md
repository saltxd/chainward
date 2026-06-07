# acp-decoder Eval Gate — Design

**Status:** approved 2026-06-06; corrected 2026-06-07 after repo exploration.

**Goal:** A layered regression gate so a prompt / model / code change to the acp-decoder decode pipeline cannot silently ship a quality regression — covering the two failure classes this project has actually hit.

**Why:** Agent Roadmap #8 and the [AI Orchestration Adoption Scorecard](http://docs.k3s.nox/books//page/ai-orchestration-adoption-scorecard-2026-06-06) (BookStack 257). The Degen Claw decode **self-verified 47/47 and still shipped two wrong claims** — self-verification *inside* the pipeline is not an independent gate.

---

## The two failure classes the gate must catch

1. **Logic / parse / count** — wrong numbers from deterministic code. Real instance: the **$144 lifetime undercount** (a latest-50 sample restated as a lifetime count → ~367× off). Frequent, deterministic.
2. **Reasoning / methodology** — the decode reaches a wrong *conclusion*. Real instance: **"$490K real Hyperliquid volume"** when the agent's Hyperliquid account held **$11.18 and had never traded** (destination chain never queried). Rare, expensive, reputational.

---

## ⚠️ Repo reality (exploration 2026-06-07) — what is and isn't testable TS

The paid decoder `quickDecode()` (`packages/decode/src/quick-decode.ts`) is **pure, importable TS** returning a typed `QuickDecodeResult` from a `fixtures` object (no LLM/network in `replayMode`). vitest 4 + 5 captured fixtures + 74 green tests already exist. **But:**

- **Lifetime/total counting, full-history pagination, and on-chain↔API revenue reconciliation have NO TS implementation** — they exist only as prose in `scripts/auto-decode-prompts/{utility-audit,failure-mode-verifier}.md`. So the **$144-lifetime class and the Hyperliquid class are BOTH Layer B** (prompt/LLM), not Layer A.
- **One $144-*shaped* bug DOES live in TS:** `apps/acp-decoder/src/data-fetch.ts` fetches transfers with a **single un-paginated ~50-row page**, so the served `transfers_7d/30d` + `unique_counterparties_30d` undercount active agents. That is Layer-A-fixable + testable, and Phase 1 fixes it.

---

## Architecture — shared fixtures + two layers

### Golden fixtures
- **Phase 1 (already captured):** `packages/decode/__tests__/fixtures/{axelrod-active,ethy-borderline,lucien-dormant,luna-dormant,otto-active}.json` — 5 real `fixtures`-shaped snapshots. Enough to seed Layer A with curated `expected/<name>.json` (no new capture needed).
- **Phase 2 (capture for Layer B):** the **corrected** `degen-claw-on-chain` (carries Hyperliquid ground truth — HL account $11.18 / 0 fills), `job-5424`, and a **mega-volume** case (exercises the pagination cap). These carry the destination-venue + lifetime ground truth the reasoning gate needs.
- **Ground-truth rule:** `expected.*` is **human-verified**, never blind-snapshotted from current output (snapshotting blesses current bugs; Degen Claw proves "current" can be wrong).

### Layer A — deterministic core gate (every PR, **blocking**) — scoped to importable TS
Targets the pure `quickDecode` path + the fetch helper:
- **transfer-fetch pagination fix** (`data-fetch.ts`) — paginate `next_page_params` until the oldest item crosses the widest window (30d) or a hard page cap; set a `truncated` flag; unit-test against a mocked multi-page response. The only $144-shaped bug that lives in TS.
- **classifier + struct outputs** — golden assertions on `quickDecode(...).data.*`: balances (`computeBalances` hex→ETH/USDC), activity window counts (`computeActivity`), `usdc_pattern`, `survival`, `wallet_arch`, `discrepancies` (ACP-claim vs chain-reality), resolver name/address.
- **slug / `displayName`** (`scripts/auto-decode/lib/validators.ts`) — already covered by PR #20; extend if gaps.
- Runner: **vitest 4** (already configured). Golden tests load a fixture → `quickDecode({…, replayMode:true})` → assert `data.*` vs curated `expected.json` (amounts ±tol, addresses exact, classifier verdicts exact).

> **NOT in Layer A (confirmed):** lifetime totals ("paid N times"), on-chain↔API revenue reconciliation, destination-chain verdict — no TS impl → **Layer B**.

### Layer B — reasoning gate (nightly + on decode-prompt PRs) — Phase 2
- Drives the reasoning stages (`utility-audit.md`, `failure-mode-verifier.md`) via **Promptfoo** (`anthropic:claude-agent-sdk`, `apiKeyRequired:false` → OAuth, no metered key), feeding the recorded fixture data **as prompt context** (context injection, not tool-mocking — sidesteps the brittle interception problem).
- Asserts: structured fields + the **methodology verdicts** — esp. the **destination-chain check** (given the HL fixture $11.18/0-fills, the verifier MUST refute a "$X on Hyperliquid" claim). The mechanical guard against the Hyperliquid-class miss + the lifetime-undercount class.
- Plus an **OWASP-LLM red-team** suite (Promptfoo) on the decode input surface (roadmap #5).
- Non-blocking on PRs (LLM variance; `repeat`/min-pass); blocks the nightly run.

### Explicitly out of scope
- **Full live e2e pipeline run as a gate** — non-deterministic, OAuth-burning, flaky → online-eval/monitoring (roadmap #15), not a merge gate.
- **Full record/replay interception of the MCP/ssh data path** — too brittle; Layer B injects fixtures as context instead.

---

## Phasing

- **Phase 1 (this plan — high ROI):** (a) **fix** the un-paginated transfer fetch (TDD) so window counts are correct; (b) **Layer A** golden tests on `quickDecode().data.*` over the 5 captured fixtures + curated `expected.json`; (c) wire `pnpm test` into the GHA `check` job to gate PRs.
- **Phase 2:** capture the Layer-B fixtures (incl. corrected Degen Claw w/ HL ground truth) + the Promptfoo reasoning gate + red-team, nightly.

---

## Success criteria

- A PR that reintroduces the **transfer-fetch undercount** (un-paginated 7d/30d counts) **fails Layer A**. *(The long-form "paid N times" lifetime count is prompt-only → guarded in Layer B.)*
- A decode-prompt change that **drops the destination-chain check fails Layer B** (Phase 2; the HL fixture case stops being flagged → red on the nightly run).
- The gate runs with **no metered API key** (OAuth via `claude-agent-sdk` for Layer B).
- **Adding a new golden wallet = drop a fixture + `expected.json`** — no code change.

---

## Open questions (resolve during implementation)

1. **`expected.json` schema** — define the exact asserted-field set + tolerances during Phase 1, anchored to the 5 captured fixtures.
2. **Pagination cap** — confirm `MAX_PAGES` / window-stop values that bound latency for mega-agents while keeping 30d counts correct.
3. **Phase-2 stage-eval entry path** — cleanest way to run one reasoning stage with injected fixture context (likely a small `decode:eval-stage --stage <name> --fixture <dir>` script). Main Phase-2 build detail.
