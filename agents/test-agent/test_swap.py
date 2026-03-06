"""Direct swap test — uses AgentKit action provider to test SDK patches."""
import json
import os

from dotenv import load_dotenv

load_dotenv()

from coinbase_agentkit import (
    CdpEvmWalletProvider,
    CdpEvmWalletProviderConfig,
    cdp_evm_wallet_action_provider,
)

network_id = os.getenv("NETWORK_ID", "base-mainnet")
wallet_file = f"wallet_data_{network_id.replace('-', '_')}.txt"

wallet_address = None
if os.path.exists(wallet_file):
    with open(wallet_file) as f:
        data = json.load(f)
        wallet_address = data.get("address")

config = CdpEvmWalletProviderConfig(
    api_key_id=os.getenv("CDP_API_KEY_ID"),
    api_key_secret=os.getenv("CDP_API_KEY_SECRET"),
    wallet_secret=os.getenv("CDP_WALLET_SECRET") or None,
    network_id=network_id,
    address=wallet_address,
)

wallet = CdpEvmWalletProvider(config)
address = wallet.get_address()
print(f"Wallet: {address}")

balance = wallet.get_balance()
eth_balance = int(balance) / 1e18
print(f"ETH balance: {eth_balance:.6f} ETH")

# Use the action provider directly (same path as LLM agent)
provider = cdp_evm_wallet_action_provider()

USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"

# Step 1: Get swap price
print("\n--- Step 1: Swap Price ---")
price_result = provider.get_swap_price(wallet, {
    "from_token": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    "to_token": USDC_BASE,
    "from_amount": "0.0001",
})
price_data = json.loads(price_result)
print(json.dumps(price_data, indent=2))

if not price_data.get("success", True):
    print("Price check failed, aborting")
    exit(1)

# Step 2: Execute swap
print("\n--- Step 2: Execute Swap ---")
swap_result = provider.swap(wallet, {
    "from_token": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    "to_token": USDC_BASE,
    "from_amount": "0.0001",
    "slippage_bps": 200,
})
swap_data = json.loads(swap_result)
print(json.dumps(swap_data, indent=2))

if swap_data.get("success"):
    tx_hash = swap_data.get("transactionHash")
    print(f"\nSwap successful!")
    print(f"https://basescan.org/tx/{tx_hash}")
else:
    print(f"\nSwap failed: {swap_data.get('error')}")
