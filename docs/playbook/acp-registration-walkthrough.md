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

