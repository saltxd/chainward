# ACP Registration Walkthrough — chainward-decoder

> Captured live during the registration of ChainWard's decoder agent on Virtuals'
> Agentic Commerce Protocol. Phase 2 `/build` "How to launch on Virtuals" page seed.

## Environment
- Date started: 2026-05-01T05:04:49Z
- Node: v25.9.0
- OS: macOS

## Step-by-step log
(append as you go)

## What worked / What didn't
(fill at end)

## Time taken
(fill at end)

## Setup attempt — 2026-05-01

### Step 1: Login (✓)
- Auth URL request: `POST /api/auth/lite/auth-url` → `{authUrl, requestId}` returned cleanly
- User clicked browser auth link, completed OAuth on app.virtuals.io
- Session token captured via `GET /api/auth/lite/auth-status?requestId=...`
- JWT exp ~6 hours from issue
- Stored in `/tmp/openclaw-acp/config.json` under `SESSION_TOKEN.token`

### Step 2: Agent creation (✗ — server error)
- `POST /api/agents/lite/key` with `{"data":{"name":"chainward-decoder"}}`
- Response: `400 BadRequestError` wrapping `"Request failed with status code 500"`
- Tried alternate names: `ChainWard Decoder`, `ChainWardDecoder`, `chainward_decoder`, `Chainward`, `test`, `chainward-decoder` with empty `builderCode` — all return same error
- Auth confirmed working: `GET /api/agents/lite` returns `{"data":[]}` (empty agent list, 200)
- Conclusion: upstream wallet-provisioning service is failing; not a name validation or auth issue

### Hypothesis
Either (a) Virtuals' wallet-provisioning backend is down, or (b) user account requires UI onboarding step before API agent creation works. Recommended next: open https://app.virtuals.io/acp in browser, verify can create agent via UI; if UI fails, wait + retry; if UI succeeds, identify the missing API field.


### Step 2 (cont'd): Agent created via UI (✓)
- Could not create agent via CLI `agent create` (legacy `/api/agents/lite/key` returns server-side 500 wrapped in 400, regardless of payload)
- Created via `https://app.virtuals.io/acp/new` UI form instead — required: agent name, description, agent picture upload (used `Logos/chainward_400x400.png`), Token Configuration set to "Skip"
- Result: agent registered in **EconomyOS** (Virtuals' newer agent system)
- **Agent UUID**: `019de3bb-4e95-7438-b6cb-bfe68fed68ec`
- **Agent wallet**: `0x88d181346cd79c1631adf03a87d97e9d425bf9f8`
- Dashboard: `https://app.virtuals.io/acp/agents/019de3bb-4e95-7438-b6cb-bfe68fed68ec`

### CRITICAL DISCOVERY: EconomyOS vs legacy lite-agent system
- Virtuals has **two parallel agent systems**:
  - **Legacy lite-agent** (numeric IDs, `/api/agents/lite/*`) — what `openclaw-acp` CLI's `acp setup` and `acp agent create` target
  - **EconomyOS** (UUIDs, different API surface) — what the UI's `/acp/new` flow creates
- A UI-created agent **does not appear** in `acp agent list` (legacy `/api/agents/lite` returns empty)
- `LITE_AGENT_API_KEY` is **not issued** for EconomyOS agents through the CLI flow
- API surface for EconomyOS is undocumented in `references/` and not exposed via the open-source CLI
- **For Phase 2 Playbook**: this is THE first gotcha new builders will hit. The CLI repo and the UI live in different timelines.

### Failed phantom agents
The 4 failed CLI POST attempts left phantom records in the public ACP API search (id 42101, 42102, 42107, 42108 — all named `chainward-decoder` with `walletAddress: null`). These are legacy-lite-system shadow records and don't correspond to a usable agent. They cannot be deleted via the CLI.


### Step 3: Migration to ACP v2 (✓ wired)
- Found `@virtuals-protocol/acp-node-v2@0.0.6` on npm — completely separate from the deprecated `@virtuals-protocol/acp-node@0.3.0-beta.x` we initially installed
- Auth model changed: legacy `LITE_AGENT_API_KEY` (single secret) → non-custodial wallet + P256 signer (3 fields: `WALLET_ADDRESS`, `WALLET_ID` (Privy), `WALLET_SIGNER_PRIVATE_KEY` (P256 PEM))
- Integration shape changed: phase-based REST (`accept`/`reject`/`requirement`/`deliver` POSTs) → event-driven SDK (`AcpAgent.on('entry', handler)` + `JobSession` methods `setBudget`/`submit`/`complete`/`reject`)
- New SDK uses `PrivyAlchemyEvmProviderAdapter.create({ walletAddress, walletId, signerPrivateKey })` for non-custodial signing
- Useful SDK details discovered:
  - `SystemEntry.event.type` (nested), not flat `.type`
  - `AssetToken.usdc(amount, chainId)` static factory (no on-chain call needed)
  - SDK auto-hydrates sessions on `agent.start()` — our previous `reconcile.ts` is no longer needed
- **Local connection verified**: `acp v2 connected` logged within ~1s of `pnpm dev` against the new credentials

### Step 4: Key rotation (TODO before any USDC touches the wallet)
- The signer private key generated during step 2 was inadvertently pasted in chat for wiring debugging
- Wallet currently holds $0 USDC — no immediate financial exposure
- BLOCKING action before deploy + buyer test: use the EconomyOS UI's "Add Signer" / "Rotate Keys" flow to generate a fresh P256 key pair
- The wallet address `0x55a24a57cc662e180c5bb2e0f4ee2496f5ab7127` stays the same; only the signer key changes
- Save the new private key directly to 1Password — never paste in chat or commit messages

