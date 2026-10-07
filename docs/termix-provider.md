# ChainWard as a TermiX provider (BNB Chain)

How ChainWard sells the Set and Earn hire check on TermiX, the BNB Chain agent
marketplace, as a provider (seller). Sources: TermiX's agent skill v1.8.0
(`http://termix.ai/skills`, downloaded to `.termix-skill/`, gitignored), the docs at
https://docs.termix.ai, live reads of the BSC backend and escrows on 2026-10-07, and
our September escrow decode (`deliverables/termix-on-chain/`).

Code:

| Piece | Path |
| - | - |
| API client, tx-intent guard, listing body | `packages/common/src/termix/` |
| Registration + listing (dry run by default) | `apps/api/scripts/termix-provider.mts` |
| Job worker (BullMQ, every 2 min) | `packages/indexer/src/workers/termixProvider.ts` |
| Input parsing + deliverable | `packages/indexer/src/lib/termixDeliverable.ts` |
| Chart | `deploy/helm/chainward` (`termixProvider.*`, secret key `TERMIX_PROVIDER_PRIVATE_KEY`) |

## The short version

- TermiX already lists our ERC-8004 agent **365669** (it indexes the shared registry
  `0x8004A169…a432`): db id `cmuy3jo13xl0ozw01mxvtcpj6`, handle `365669`, name and
  avatar from our card, owner = treasury `0xf7Ee…67cD`, **no TermiX account yet**.
  No mint is needed to sell.
- Registration is one off-chain wallet sign-in with the owner key (it creates the
  account), then one off-chain listing. **Zero gas** for both.
- Selling costs gas per order, paid by the agent owner in BNB: `acceptOrder` and
  `submitDelivery` always (~166k gas), plus `claimAfterTimeout` (~148k) whenever the
  buyer never releases. At 0.05 gwei that is ~0.0000083 BNB, or ~0.0000157 BNB with a
  claim. The treasury's 0.00167 BNB covers ~106 orders with claims, ~200 without.
- Buyers pay USDT or USDC (BEP-20, 18 decimals) into a TermiX escrow. On release the
  escrow pays budget minus 2% to the agent owner, our treasury.
- TermiX has no auto-settle. If the buyer neither accepts nor disputes, we must call
  `claimAfterTimeout` ourselves after the challenge window, or the money sits in escrow.
- Recommended price: **0.25 USDT** (reasoning below).

## Identity: handle vs agent

| | What it is | Ours |
| - | - | - |
| `agentTokenId` | ERC-721 id on the registry | 365669 |
| `agentId` | TermiX db cuid, used in most REST paths | `cmuy3jo13xl0ozw01mxvtcpj6` |
| `name` / handle | "settable once", only through `POST /api/v1/agents/prepare` (a TermiX mint) | `365669` (indexed, not minted by TermiX) |

`GET /api/v1/agents/name-availability?name=chainward` returns `{available: true,
normalized: "chainward.agent"}` (as of 2026-10-07). There is no documented endpoint to
set or change the handle of an agent TermiX indexed from outside, so claiming
`chainward.agent` means minting a **second** ERC-8004 agent (~236k gas, ~0.0000118 BNB)
and splitting hires, reputation and the Set and Earn record across two ids. The script
checks availability and skips the mint unless `--mint-handle` is passed. Recommendation:
don't mint; sell under 365669, whose card is at
`https://chainward.ai/.well-known/erc8004-agent.json`.

## Auth

| Credential | How | Used for |
| - | - | - |
| Wallet session | `POST /api/v1/auth/nonce {walletAddress}` returns `{nonce, message}`; `personal_sign(message)`; `POST /api/v1/auth/wallet {walletAddress, nonce, signature}` returns `accessToken` (24 h) + `refreshToken` (30 d); `POST /api/v1/auth/refresh` | Every account call. **First sign-in creates the account.** |
| None | | Config, storefronts, listings, `GET /orders/:id` (public view) |
| A2A runtime token | owner-signed `AACP:a2a-runtime-token:<agentId>:<ts>` headers | Chat inbox and presence. The worker doesn't use it. |
| On-chain | The owner key signs the tx-intents the backend returns | Accept, deliver, claim |

The backend never holds a key and never broadcasts. The worker keeps the session in
memory, refreshes on 401, and signs in again from the key if the refresh fails.

## On-chain vs off-chain

BSC (chain 56), contracts from `GET /api/v1/config/contracts` (never hardcode; the
worker reads them each run):

| Contract | USDT | USDC |
| - | - | - |
| TermixEscrow | `0xCE02f987D8b8AF694E13C8a843Db9c77caBF544c` | `0x6A52ba4C84b348FaEAe13dDC7A97b4F6af23913C` |
| TermixStaking | `0x1DcafFB7275fa2650d480a4F939A0C0D5874750B` | `0x0Bd066f5113e6B8336b06F8Aa3EF90D37F7e65FC` |
| Token (18 decimals) | `0x55d398326f99059fF775485246999027B3197955` | `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d` |
| IdentityRegistry (shared) | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | |
| Fee recipient (2-of-3 Safe) | `0x1095deD95CB6e81C01204F7A94950dd559195E42` | |

Gas per call, median of 50 mainnet calls each (2026-10-07, ~0.06 gwei effective):

| Call | Who | Selector | Gas |
| - | - | - | - |
| `createOrder` | buyer | `0x61f9f106` | 294,008 |
| `acceptOrder(bytes32)` | **us** | `0xdfc86408` | 86,882 |
| `submitDelivery(bytes32,bytes32)` | **us** | `0x94e8b028` | 79,064 |
| `releaseEscrow(bytes32)` | buyer | `0xbf89fc61` | 148,022 |
| `claimAfterTimeout(bytes32)` | **us** if the buyer is silent | `0x22399f5d` | not observed; settles like `releaseEscrow`, ~148k |
| `cancelPending(bytes32)` | buyer | `0x893372ca` | 65,699 |

Off-chain (platform REST): account, listings, conversations and messages, delivery
artifact upload (presigned S3 PUT) and registration, every `*/prepare` that returns an
intent, and order state (projected from escrow events by TermiX's indexer, so a mined tx
shows up in the API seconds to minutes later).

## Provider lifecycle, end to end

1. **Sign in** (off-chain, creates the account): auth flow above. Then
   `GET /api/v1/agents` must list 365669. If it doesn't, stop and ask TermiX; don't mint.
2. **Listing** (off-chain): `POST /api/v1/agents/<agentId>/services` with the body in
   `packages/common/src/termix/listing.ts` (strict schema; `coverImageUrl` required), then
   `POST /api/v1/listings/<id>/publish`. `instantBuyable: true`, so buyers skip quoting.
3. **Stake**: none needed. `providerLockBps` is 0 for USDT and USDC on BSC, and our listing
   has `bondAmount` 0. (A request's `minStake` would gate quoting; we don't quote.)
4. **Buyer funds**: `POST /api/v1/listings/<id>/instant-buy {clientAgentId, note?}` then
   checkout, `approveEscrow` + `createOrder`. The order appears at `PENDING_ACCEPT`.
   **The Set and Earn hire counts here**: the campaign counts the `OrderCreated` event.
5. **We accept** (on-chain): `POST /api/v1/orders/<id>/provider-accept/prepare` returns an
   `acceptOrder` intent; sign and send; poll `GET /api/v1/orders/<id>` until `FUNDED` or
   `IN_PROGRESS`. If we never accept, the buyer gets a full refund with `cancelPending`.
6. **We deliver** (off-chain upload, then on-chain): per file
   `POST /orders/<id>/delivery/upload-url {fileName, contentType, sizeBytes}`, PUT the bytes,
   `POST /orders/<id>/delivery/artifacts {s3Key, url, sha256, contentType, sizeBytes}`; then
   `POST /orders/<id>/delivery/submit {artifactIds, note}` returns `submitDelivery`; sign and
   send; status becomes `DELIVERED`. The `note` becomes the order's public `deliveryNote`.
   Deadline: `deliveryDueAt` = funding + `deliveryDays`. After it, anyone can call
   `cancelExpired`: full refund to the buyer, nothing for us, no slashing.
7. **Settlement**:
   - Buyer accepts: they send `releaseEscrow`; we get budget minus 2%; `SETTLED`.
   - Buyer requests the one redo: back to `IN_PROGRESS` with `redoUsed: true`; deliver again.
   - Buyer disputes (`openChallenge`, may post a challenge bond): 3 evaluators vote; the loser can
     escalate to an arbitrator. Evaluator and arbitrator fees come out of the budget; a lost dispute
     slashes the order's stake lock (0 for us) and goes on reputation. Provider evidence is a
     manual step (skill doc `provider-dispute.md`); the worker logs and leaves it.
   - Buyer is silent: after `challengeWindowEndsAt`, `POST /orders/<id>/claim-after-timeout/prepare`
     returns `claimAfterTimeout` (permissionless, pays us like a release). Preparing early is a 400.
8. **Dispute window**: the listing's `challengeWindowHours` (we set the minimum, 24), counted
   from the delivery **deadline**, not from delivery. With `deliveryDays: 1` a silent buyer's
   payout becomes claimable ~48 h after funding however fast we deliver (observed on a live
   order: due + 48 h window + ~10 min).

## Fees and money flow

- Protocol fee: `protocolFeeBps` = 200 (2%) for both currencies, taken from the budget at
  settlement. Seen on-chain: a 22 USDC job paid 21.56 to the seller and 0.44 to the Safe. The
  API's order view shows `providerPayout` equal to the full budget, which doesn't match the chain.
- Disputes only: evaluator fee, arbitrator fee (if escalated), challenge bond to the winner.
- Payout goes to the agent owner. Checked on a live release where the owner and the
  ERC-8004 agentWallet are the same address; for 365669 both are the treasury
  (`ownerOf` = `getAgentWallet` = `0xf7Ee…67cD`), so payouts land there in BEP-20 USDT/USDC.
- Gas (BNB) is paid by whoever signs; for us that is the owner key, so payouts arrive in
  stablecoins while gas leaves in BNB. Top up BNB by hand; the worker refuses to accept an
  order when the balance can't cover accept + deliver + claim at the current price.

## Recommended price: 0.25 USDT

- Who buys: Set and Earn participants need hires of different agents across two marketplaces,
  and builders want the hire check on their own agent. Both pick cheap listings: of 719 BSC
  listings, 43 are at or under 1 USDC, 15 at or under 0.50, 10 at or under 0.25. The busiest
  of them (HoloCardMaker, 47 completed jobs) is 1 USDC.
- What it costs us: ~0.0000157 BNB gas with a claim, one to two cents at BNB between $600 and
  $1,300; the 2% fee is 0.005 USDT; the check itself is the Alchemy calls the x402 route makes.
  We keep ~0.23 USDT per order, which is worth fulfilling.
- Against our own x402 price (0.10 USDC on Base): 0.25 is higher, but a TermiX order also
  gives the buyer a Set and Earn hire and a delivered summary, and it covers two transactions
  and a claim. 0.50 halves demand from people shopping for a hire. Raise it with
  `--price` / `PATCH /api/v1/listings/<id>` if volume outruns the BNB budget.
- Listed in USDT as asked. It mostly sets the displayed price: instant-buy lets a buyer pay
  USDC instead (`currency` on the instant-buy body), and orders on other listings settle in
  both. The worker handles either escrow.

## What the worker does (the minimum to never leave a job unfulfilled)

BullMQ repeat every 2 minutes, one run at a time (Redis lock), at most
`TERMIX_MAX_JOBS_PER_RUN` (default 3) orders worked and 10x that many order reads per run.

| Status | Action |
| - | - |
| `FUNDED` / `IN_PROGRESS` | Deliver (we accepted; the clock runs). Refuses after `deliveryDueAt`. |
| `PENDING_ACCEPT` | Read the buyer's own text (note fields and their messages in the order thread, never the listing copy), parse one agent id or 0x owner address, **run the hire check first**, and only if it ran: check the BNB balance, accept, deliver in the same pass. No input: one message asking for it. Two targets: one message asking which. Unknown agent: one refusal message. Check failing: stays unaccepted, retried each run (message after 3 failures). |
| `DELIVERED` | After `challengeWindowEndsAt` + 1 min, `claimAfterTimeout`. |
| `IN_DISPUTE` | Logged once for a human. |

Never double-delivers: each tx hash is written to Redis as soon as it is sent, and the next
run checks its receipt instead of sending again; delivery artifacts are matched by sha256
before uploading; at most two deliveries per order (initial + the one redo); two reverts on an
order and it stops for a human. Every intent is checked before signing
(`checkProviderIntent`): chain 56, one of the configured escrows, value 0, the expected
selector, this order's id, exact length. An ERC-20 approve or any other call is refused.

Deliverable: `chainward-hire-check-<id>.json` (the `GET /api/risk/hires` report verbatim,
with its `method` and `limits`, plus order id, input, source URL, summary, disclaimer),
`chainward-hire-check-<id>-summary.md` (summary, counts, hirer table, method, every limit),
the one-paragraph summary as the delivery note, and the summary posted in the order thread.
Never a safety verdict. The check is the library (`runHireCheck` from `@chainward/decode`)
with the paid route's Redis cache (`hires:bsc:<target>`, 1 h), not a paid call to ourselves.

Env (indexer): `TERMIX_PROVIDER_ENABLED=true`, `TERMIX_PROVIDER_PRIVATE_KEY` (the agent
owner key), the Alchemy BNB RPC the hire check already uses (`SELLER_DEMAND_BSC_RPC_URL`
or derived from `SELLER_DEMAND_RPC_URL`), `TERMIX_BSC_RPC_URL` (chart default
`https://bsc-dataseed.bnbchain.org`), optional `TERMIX_MAX_JOBS_PER_RUN`,
`TERMIX_MAX_GAS_GWEI` (default 0.1, floor 0.05).

## Run-book (the irreversible steps are yours)

1. Dry run (prints, signs nothing):
   `TERMIX_PROVIDER_PRIVATE_KEY=… pnpm --filter @chainward/api exec tsx scripts/termix-provider.mts`
2. **Register + list** (creates the TermiX account and publishes the listing; off-chain, no gas):
   same command with `--send`. Add `--price 0.5` to change the price.
3. Merge and deploy the worker (new indexer image; `deploy.sh` deploys all three).
4. **Turn the worker on.** `deploy.sh` only sets images on Deployments, so the env goes on by hand:
   ```bash
   kubectl -n chainward get secret chainward-secrets -o json \
     | jq '.data.TERMIX_PROVIDER_PRIVATE_KEY = .data.TREASURY_PRIVATE_KEY' | kubectl apply -f -
   kubectl -n chainward set env deployment/indexer --from=secret/chainward-secrets --keys=TERMIX_PROVIDER_PRIVATE_KEY
   kubectl -n chainward set env deployment/indexer TERMIX_PROVIDER_ENABLED=true TERMIX_MAX_JOBS_PER_RUN=3 \
     TERMIX_BSC_RPC_URL=https://bsc-dataseed.bnbchain.org
   ```
   and set `termixProvider.enabled: true` in `values.yaml` so the chart agrees.
5. Watch the first order in the indexer logs (`TermiX ...` lines). The first real order is
   also the first look at where the instant-buy note lands (see ambiguities).

Turning the worker on before step 2 also signs in (so it creates the account), but it never
creates a listing; with no listing there are no orders and each run is a no-op.

What is irreversible: the first sign-in (creates the TermiX account bound to the treasury
wallet), publishing the listing (public, can be archived), every accept / delivery / claim
transaction (gas), and `--mint-handle` (a second ERC-8004 agent, forever).

Key risk: the worker needs the agent owner key, which is today the treasury key, in the
indexer pod. If that's too much blast radius, transfer agent 365669 to a dedicated hot
wallet first (ERC-721 transfer; the registry clears `agentWallet` on transfer, so set it
again), and point `TERMIX_PROVIDER_PRIVATE_KEY` at that wallet. Payouts then go to it.

## Honesty rules

- The deliverable carries the x402 check's `method` and `limits` verbatim (`HIRE_LIMITS`),
  and the summary ends: "No link found is not proven independence. This describes where
  money moved, not who controls a wallet. Not a safety verdict."
- **Board change needed:** once this listing sells, agent 365669 gets TermiX hires and shows
  up on our own Set and Earn board (`packages/decode/src/set-and-earn-board.ts`,
  `assembleSetAndEarnBoard`). Nothing there excludes it today. Exclude 365669 from
  `totals.agents_passing` (and mark its row) so the board never counts its publisher as a
  passing agent. Not done here because `feat/set-and-earn-board` is open on that file.
- A hire counts for Set and Earn at `createOrder`, before we accept. A buyer can fund our
  order, never give an input, cancel with `cancelPending`, get everything back and still have
  the hire event. Our worker can't prevent that; it only refuses to accept.

## What TermiX's docs leave ambiguous

1. **Where the buyer's instant-buy `note` goes.** The skill documents a `note` on
   `instant-buy` but also says the schema allows only `clientAgentId`. The order's `scope` is
   the listing description, not the note. The worker reads note-like order fields and the
   buyer's messages in the order thread; if the note lands somewhere else, the first order
   gets the "send an agent id" message instead. Check the first real order.
2. **Conversation message shape.** `GET /api/v1/conversations/:id/messages` is listed without
   a response schema. The worker accepts `items`/`messages`/`data` and identifies the buyer by
   `from.accountId`/`from.walletAddress` (the A2A inbox shape). Unverified until a real order.
3. **Whether the order view carries the conversation id** for the provider
   (`conversationId` or `conversation.id`). The public view doesn't.
4. **Linking an indexed agent to a new account.** TermiX lists 365669 with `accountId: ""`.
   The docs say `GET /api/v1/agents` returns "every agent the wallet owns", which should
   include it after sign-in; nothing documents an explicit claim step. The script stops if it
   doesn't show up.
5. **`acceptDeadline`** (the window to accept before the buyer can cancel) is a contract
   parameter not shown in the order view, and the docs disagree on whether `cancelPending`
   needs it to have passed.
6. **`PENDING_ACCEPT` can't be filtered** in `GET /api/v1/orders` (the enum omits it), and the
   skill's own watcher polls `status=FUNDED`, which would miss new orders. The worker lists all
   provider orders and filters itself.
7. **`providerPayout`** in the order view equals the budget, while the chain pays budget minus 2%.
8. **Payout address when owner and agentWallet differ.** Every release observed had them equal.
9. **Presence.** The agent shows ONLINE only while something polls the A2A inbox (~60 s).
   The worker doesn't, so the storefront shows offline; buyers can still instant-buy.
10. **Delivery note visibility.** `deliveryNote` is in the public order view, so the summary
    paragraph is public. The JSON and markdown artifacts are for participants only.
