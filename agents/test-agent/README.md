# ChainWard Test Agent

Autonomous swap agent on Base mainnet. Generates real on-chain activity
(ETH <-> USDC round-trips) for ChainWard to monitor and index.

## Quick Start

```bash
cd agents/test-agent

# Create venv (MUST be Python 3.11 — 3.14 breaks nest_asyncio)
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Apply CDP SDK patches (required — see CDP_SDK_PATCHES.md)
# ... apply all 6 patches to venv/lib/python3.11/site-packages/

# Configure
cp .env.example .env  # or create from scratch (see below)

# Run
python agent.py
```

## Wallet

| Field | Value |
|-------|-------|
| Address | `0xAf09B7fa44058D40738DaBEbD4f014ac3aBf9A53` |
| Type | CDP Server Wallet (Coinbase-managed keys, NOT MetaMask) |
| Network | Base mainnet |
| View | https://basescan.org/address/0xAf09B7fa44058D40738DaBEbD4f014ac3aBf9A53 |

This is a **separate wallet** from the user's MetaMask (`0x3cAc...`).
CDP manages the private keys server-side. You interact with it via CDP API
credentials (API key ID + secret + wallet secret).

## How It Works

Each cycle:
1. Pick a random amount between 0.00005-0.00015 ETH
2. Swap ETH -> USDC via CDP Swap API (uses 0x/Uniswap under the hood)
3. Wait 2-3 minutes (randomized cooldown)
4. Swap all received USDC back to ETH
5. Log both transaction hashes to `tx_log.jsonl`
6. Sleep 3.5-4.5 hours (randomized interval)

All randomization prevents the activity from looking mechanical on-chain.

**Gas cost:** ~0.000081 ETH (~$0.17) per round-trip cycle.
At 6 cycles/day, that's ~$1/day. Fund with $5-10 for a week of operation.

## .env Configuration

```bash
# CDP API Key (from portal.cdp.coinbase.com)
CDP_API_KEY_ID=<uuid>
CDP_API_KEY_SECRET=<base64 Ed25519 key>

# CDP Wallet Secret — DER-encoded EC key
# Get from: portal.cdp.coinbase.com/products/server-wallet/accounts
CDP_WALLET_SECRET=<base64 DER key>

# Network
NETWORK_ID=base-mainnet
```

No `ANTHROPIC_API_KEY` needed — the agent doesn't use an LLM.

## Files

| File | Purpose |
|------|---------|
| `agent.py` | Main autonomous swap loop |
| `test_swap.py` | Quick test script — runs one round-trip swap without the loop |
| `requirements.txt` | Python dependencies |
| `Dockerfile` | Container image (needs SDK patches baked in) |
| `.env` | Secrets (gitignored) |
| `wallet_data_base_mainnet.txt` | Persisted wallet address (gitignored) |
| `tx_log.jsonl` | Transaction log with timestamps + hashes (gitignored) |
| `CDP_SDK_PATCHES.md` | Detailed patch instructions for CDP SDK bugs |

## CDP SDK Patches (CRITICAL)

The CDP Python SDK (v1.39.1) has **6 bugs** that prevent swaps from working.
They are patched directly in `venv/lib/python3.11/site-packages/`.

**If you recreate the venv, you must re-apply them.**

See `CDP_SDK_PATCHES.md` for the full list with before/after code.

Summary of bugs:
1. Pydantic models declare required fields that the API returns as null
2. `liquidity_available` validator rejects Python `True` (only accepts string `'true'`)
3. `await` on a synchronous `wait_for_transaction_receipt()` method
4. Receipt status compared as string `"success"` instead of int `1`
5. ERC20 approval check relies on `QuoteSwapResult.issues` which doesn't exist
6. `encodeABI()` doesn't exist in web3 v7 (use `encode_abi()`)

## Testing

```bash
source venv/bin/activate

# Quick round-trip test (no loop, no delays)
python test_swap.py

# Check balance
python -c "
from coinbase_agentkit import CdpEvmWalletProvider, CdpEvmWalletProviderConfig
from dotenv import load_dotenv; import os; load_dotenv()
w = CdpEvmWalletProvider(CdpEvmWalletProviderConfig(
    api_key_id=os.getenv('CDP_API_KEY_ID'),
    api_key_secret=os.getenv('CDP_API_KEY_SECRET'),
    wallet_secret=os.getenv('CDP_WALLET_SECRET'),
    network_id='base-mainnet',
    address='0xAf09B7fa44058D40738DaBEbD4f014ac3aBf9A53',
))
print(f'ETH: {int(w.get_balance()) / 1e18:.6f}')
"
```

## K3s Deployment (TODO)

The Dockerfile exists but needs work:
1. Bake CDP SDK patches into the Docker image (post-install patch script)
2. Create Helm chart or K8s manifests in `deploy/helm/chainward/`
3. Store CDP credentials in K8s secret
4. Mount a PVC for `tx_log.jsonl` and `wallet_data_*.txt` persistence
5. Add to Cloudflare tunnel if external monitoring is needed

## Signals

The agent handles SIGTERM and SIGINT gracefully — it finishes the current
operation and exits cleanly. This works with K8s pod termination.

If shutdown happens during the cooldown between legs, the USDC position stays
open and will be swapped back on the next start.
