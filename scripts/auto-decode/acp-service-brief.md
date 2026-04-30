# ACP Service-Provider Technical Brief
# ChainWard Wallet-Decode Agent

Research date: 2026-04-29
Sources: whitepaper.virtuals.io (llms-full.txt), moonshot-cyber/virtuals-acp GitHub, acpx.virtuals.io API, npm @virtuals-protocol/acp-node

---

## Registration

Clone the official ACP CLI repo (aliased as `moonshot-cyber/virtuals-acp` internally; upstream is
`Virtual-Protocol/openclaw-acp` per README), run `acp setup`, which opens a browser OAuth flow
against `https://acpx.virtuals.io`. On completion you get a `LITE_AGENT_API_KEY` (shown once,
stored in local config). All subsequent CLI and runtime calls authenticate with that key via
`x-api-key` header to `https://claw-api.virtuals.io`.

Setup steps:
1. `git clone https://github.com/Virtual-Protocol/openclaw-acp && npm install && npm link`
2. `acp setup` — browser OAuth, creates agent record + wallet at acpx.virtuals.io, stores API key
3. `acp profile update description "..."` — sets discovery text shown on marketplace
4. `acp sell init wallet_decode` — scaffolds offering.json + handlers.ts
5. `acp sell create wallet_decode` — registers offering via POST /acp/job-offerings
6. `acp serve start` — starts the persistent seller runtime (daemonized tsx process)

---

## SDK

- **Language:** TypeScript / Node.js >= 18
- **Package:** `@virtuals-protocol/acp-node` v0.3.0-beta.40 (npm)
- **Install:** `npm install @virtuals-protocol/acp-node`
- **Key exports:** `AcpClient`, `AcpJob`, `AcpJobOffering`, `AcpAgent`, `AcpAccount`, `AcpContractClient`, `AcpContractClientV2`
- **Transport deps:** `socket.io-client` (WebSocket job events), `viem` (on-chain signing), `@account-kit/smart-contracts` (ERC-4337 account abstraction)
- **Reference implementation:** `moonshot-cyber/virtuals-acp` on GitHub — a full working CLI + seller runtime built on top of the SDK. This is the clearest available open-source example.

For our use case the CLI approach (not raw SDK) is the right entry point. The SDK is used internally by the runtime.

---

## Service Definition Schema

`offering.json` placed at `src/seller/offerings/<agent-name>/wallet_decode/offering.json`:

```json
{
  "name": "wallet_decode",
  "description": "Full on-chain audit of an AI agent wallet on Base. Returns verified balances, transaction history, fund flows, and anomaly flags as a structured JSON report.",
  "jobFee": 25,
  "jobFeeType": "fixed",
  "requiredFunds": false,
  "requirement": {
    "type": "object",
    "required": ["wallet_address"],
    "properties": {
      "wallet_address": {
        "type": "string",
        "description": "EVM wallet address to audit (0x + 40 hex chars)"
      },
      "agent_name": {
        "type": "string",
        "description": "Optional: Virtuals agent name for metadata enrichment"
      }
    }
  }
}
```

Name must match `[a-z][a-z0-9_]*`. The `requirement` block is a JSON Schema; the ACP runtime validates incoming requests against it before calling your handler. The Otto AI agent on-chain confirms `priceV2: { type: "fixed", value: 25 }` is the wire format (the CLI derives this from `jobFee`/`jobFeeType`).

---

## Job Lifecycle

The state machine is numeric internally (`AcpJobPhase` enum in types.ts) and maps to these phases:

```
REQUEST (0)      — Buyer submits job; provider receives onNewTask socket event
     |
     v
NEGOTIATION (1)  — Provider accepts via POST /acp/providers/jobs/{id}/accept
     |             Provider calls POST /acp/providers/jobs/{id}/requirement to
     v             request payment (includes custom message to buyer)
TRANSACTION (2)  — Buyer funds job; USDC locked in escrow on-chain
     |             Provider receives onNewTask event again at this phase;
     v             provider executes the work
EVALUATION (3)   — Provider submits result via POST /acp/providers/jobs/{id}/deliverable
     |             (optional: evaluator reviews)
     v
COMPLETED (4)    — Escrow released to provider (auto-triggered on approval)

Alternate terminals:
REJECTED (5)     — Provider rejected job at NEGOTIATION, or evaluator/buyer rejected deliverable
                   Escrowed USDC returned to buyer
EXPIRED (6)      — Job exceeded SLA time limit
```

The seller runtime receives job events over a persistent Socket.io WebSocket connection to
`https://acpx.virtuals.io` (auth: `{ walletAddress }` in socket handshake). There is NO polling —
jobs arrive as push events (`onNewTask`, `onEvaluate`). The runtime must be running continuously.

---

## Payment Flow

1. Provider registers offering with price ($25 USDC fixed fee).
2. Buyer submits job — no funds locked yet at REQUEST phase.
3. Provider accepts job; calls `/requirement` to request payment with optional message.
4. Buyer funds job — $25 USDC locked in the ACP Job smart contract on Base (on-chain escrow).
5. Provider receives the TRANSACTION phase event and begins work.
6. Provider delivers result via `/deliverable`.
7. On completion approval, the contract auto-releases funds:
   - Provider receives 90–95% ($22.50–$23.75)
   - Protocol fee: 5% ($1.25)
   - Evaluator fee: 5% ($1.25, only if an evaluator is designated — deducted from provider's share)
8. If provider rejects at NEGOTIATION or deliverable is rejected: escrowed funds return to buyer.
9. If job expires before delivery: funds return to buyer.

Settlement is on-chain via the ACP Job smart contract on Base. The `claw-api.virtuals.io` backend
orchestrates the state transitions; the actual USDC release is a contract call.

---

## Delivery

The `executeJob` handler returns:

```typescript
return {
  deliverable: {
    type: "json",
    value: { /* the decoded wallet report JSON */ }
  }
};
```

This is sent via `POST /acp/providers/jobs/{id}/deliverable` to `claw-api.virtuals.io`. The
deliverable is stored off-chain (Virtuals backend) and surfaced to the buyer in the ACP UI. There
is no on-chain delivery of the result payload — only the state transition is on-chain.

For `requiredFunds: false` (our case) the `payableDetail` field is omitted. The handler simply
returns the JSON report as the deliverable value.

Otto AI's `jobOutput` field in the ACP detail API (`/api/agents/788/details`) shows what buyers
see: a `{ "type": "message", "value": "..." }` envelope with the full JSON payload stringified.
Our output should follow the same envelope.

---

## Wallet Architecture

**Self-hosted agents use a Virtuals-provisioned wallet, not a factory proxy.**

Key observations from the data:
- Otto AI: `isSelfCustodyWallet: true`, `isVirtualAgent: false` — no factory proxy, plain EOA
- The `acp setup` command provisions a wallet and returns a `walletAddress` for the agent
- The CLI stores signing keys in the local config file (not OS keychain for the API key — the
  API key is a bearer token; the wallet private key management is handled by the backend)
- `isSelfCustodyWallet: true` on active providers confirms the SDK does NOT force an ERC-4337
  proxy for self-hosted mode; that's only for Virtual Agents (`isVirtualAgent: true`)

For our K3s deployment: the agent wallet is provisioned once during `acp setup`, the
`LITE_AGENT_API_KEY` is the only runtime secret needed, stored as a K8s Secret. The seller
runtime uses this key + socket connection — no raw private key required in application code.

---

## Authentication and K8s Secret Storage

Runtime credentials:
- `LITE_AGENT_API_KEY` — the agent's API key from `acp setup`. Sent as `x-api-key` header to
  `claw-api.virtuals.io`. Used for all job management API calls.
- Socket auth: `{ walletAddress }` passed in socket.io handshake (wallet address is public, not
  secret — it identifies which agent's room to join).

K3s pattern: create a `chainward/acp-agent` Secret with `LITE_AGENT_API_KEY`, mount as env var
into the seller runtime container. No other secrets required.

---

## Job Category

From surveying the top-20 ACP agents by grossAgenticAmount, the `category` field is `null` on
most active agents including Otto AI. The `cluster` field is similarly sparse (observed values:
`null` for most). The `jobCategory` field seen in earlier transaction data (`ON_CHAIN`,
`ENTERTAINMENT`, `PRODUCTIVITY`, `NONE`) appears to be a legacy or buyer-side field.

Recommendation: register with `category: null` initially (it is not required). If categorization
becomes required by the API, `ON_CHAIN` is the correct fit for a wallet-decode service.

---

## Open Questions / Empirical Discovery Required

1. **$25 minimum fee validation.** The docs and API accept any positive number for `jobFee`. We
   have not verified whether $25 is above or below any platform minimums. Needs a test registration.

2. **SLA minutes for our workload.** The `slaMinutes` field (default unset in scaffold) controls
   the EXPIRED deadline. Our decode pipeline run time on sentinel node is unknown — need to
   benchmark before setting this. Otto AI uses 5–10 min; suggest 15 min as starting point.

3. **Exact escrow contract address and ABI.** Not documented publicly. The SDK's
   `AcpContractClientV2` handles this internally. If we need to verify payments on-chain
   independently, we'll need to extract the contract address from the SDK or observe a live tx.

4. **Buyer discovery path.** How buyers find our agent: `acp browse "wallet decode"` uses a
   natural-language search against agent descriptions. Whether it's semantic embedding search or
   keyword match is undocumented. We should test discoverability after registration.

5. **Evaluator designation.** Docs say an evaluator can be designated per job. It is not clear
   whether sellers can opt in/out of evaluator review, or whether it's buyer-set. If buyers can
   force evaluation, our 5% evaluator fee deduction applies.

6. **Socket reconnect behavior.** The acpSocket.ts implementation does not have explicit
   reconnection logic beyond socket.io's built-in reconnection. In K3s, pod restarts could miss
   jobs in-flight. We'll need to implement a startup reconciliation step that polls for open
   jobs on the `/acp/providers/jobs?phase=REQUEST` or similar endpoint to catch any missed events.
   This endpoint is not documented; needs to be discovered empirically.

7. **Rate limits on claw-api.virtuals.io.** Undocumented. The `moonshot-cyber` repo's agent-health-
   monitor offering makes external HTTP calls from inside `executeJob` — no throttling observed in
   that code. Assume standard REST rate limits apply.

8. **Console registration alternative.** The brief says `https://app.virtuals.io/acp/new` shows a
   Self-hosted flow with "Develop using ACP SDK / CLI." It is not confirmed whether the console
   registration path and the CLI `acp setup` path create the same agent record type. Likely yes,
   but if console registration is required first to get an API key, `acp setup` may be the
   programmatic equivalent of that console step.

---

## Recommended Integration Path for ChainWard

Given the existing auto-decode pipeline at `scripts/auto-decode/`:

1. Clone `Virtual-Protocol/openclaw-acp` as a new service directory (separate from the main
   Turborepo or as `packages/acp-seller/`).
2. Scaffold offering: `acp sell init wallet_decode`, fill `offering.json` with schema above.
3. Implement `handlers.ts`: `executeJob` wraps the existing auto-decode pipeline, reads
   `wallet_address` from `request`, calls the decode logic, returns structured JSON.
4. Add `validateRequirements` to reject non-address inputs early.
5. `acp sell create wallet_decode` to register.
6. `acp serve start` or deploy as a K8s pod running `tsx src/seller/runtime/seller.ts` with the
   `LITE_AGENT_API_KEY` secret mounted.
7. The seller runtime holds the persistent Socket.io connection to acpx.virtuals.io and handles
   the full accept → payment-request → execute → deliver cycle automatically.
