"""ChainWard Test Agent — Autonomous round-trip swap agent on Base mainnet.

Executes randomized ETH<->USDC swap cycles to generate organic-looking
on-chain activity for ChainWard to monitor. No LLM needed — direct CDP calls.
"""

import json
import logging
import os
import random
import signal
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from coinbase_agentkit import (
    CdpEvmWalletProvider,
    CdpEvmWalletProviderConfig,
    cdp_evm_wallet_action_provider,
)
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("chainward-agent")

# --- Constants ---
USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
MIN_ETH_BALANCE = 0.0002  # Stop if balance drops below this
SWAP_AMOUNT_MIN = 0.00005
SWAP_AMOUNT_MAX = 0.00015
INTERVAL_MIN_HOURS = 1.0
INTERVAL_MAX_HOURS = 2.0
COOLDOWN_MIN_SECONDS = 120   # 2 minutes
COOLDOWN_MAX_SECONDS = 180   # 3 minutes
TX_LOG_FILE = Path("tx_log.jsonl")
MAX_CYCLES = int(os.getenv("MAX_CYCLES", "10"))  # 0 = unlimited

# Graceful shutdown
shutdown_requested = False


def handle_signal(signum: int, frame) -> None:
    global shutdown_requested
    log.info("Shutdown signal received, finishing current cycle...")
    shutdown_requested = True


signal.signal(signal.SIGTERM, handle_signal)
signal.signal(signal.SIGINT, handle_signal)


def log_tx(direction: str, tx_hash: str, amount: str, from_token: str, to_token: str) -> None:
    """Append transaction to JSONL log file."""
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "direction": direction,
        "tx_hash": tx_hash,
        "amount": amount,
        "from_token": from_token,
        "to_token": to_token,
    }
    with open(TX_LOG_FILE, "a") as f:
        f.write(json.dumps(entry) + "\n")
    log.info("TX [%s] %s | amount=%s | https://basescan.org/tx/%s", direction, tx_hash, amount, tx_hash)


def init_wallet() -> tuple[CdpEvmWalletProvider, str]:
    """Initialize wallet provider, load or create wallet."""
    network_id = os.getenv("NETWORK_ID", "base-mainnet")
    wallet_file = Path(f"wallet_data_{network_id.replace('-', '_')}.txt")

    wallet_address = None
    if wallet_file.exists():
        try:
            data = json.loads(wallet_file.read_text())
            wallet_address = data.get("address")
            log.info("Loaded wallet: %s", wallet_address)
        except (json.JSONDecodeError, KeyError):
            log.warning("Invalid wallet data, creating new wallet")

    if not wallet_address:
        wallet_address = os.getenv("ADDRESS")

    config = CdpEvmWalletProviderConfig(
        api_key_id=os.getenv("CDP_API_KEY_ID"),
        api_key_secret=os.getenv("CDP_API_KEY_SECRET"),
        wallet_secret=os.getenv("CDP_WALLET_SECRET") or None,
        network_id=network_id,
        address=wallet_address,
        idempotency_key=os.getenv("IDEMPOTENCY_KEY") if not wallet_address else None,
    )

    wallet = CdpEvmWalletProvider(config)
    address = wallet.get_address()

    # Persist wallet
    wallet_file.write_text(json.dumps({
        "address": address,
        "network_id": network_id,
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }, indent=2))

    return wallet, address


def get_eth_balance(wallet: CdpEvmWalletProvider) -> float:
    """Get ETH balance in human-readable units."""
    balance_wei = int(wallet.get_balance())
    return balance_wei / 1e18


def do_swap(provider, wallet: CdpEvmWalletProvider, from_token: str, to_token: str, amount: str, slippage: int = 200) -> dict | None:
    """Execute a single swap, return parsed result or None on failure."""
    result_json = provider.swap(wallet, {
        "from_token": from_token,
        "to_token": to_token,
        "from_amount": amount,
        "slippage_bps": slippage,
    })
    result = json.loads(result_json)

    if result.get("success"):
        return result
    else:
        log.error("Swap failed: %s", result.get("error", "unknown"))
        return None


def run_cycle(provider, wallet: CdpEvmWalletProvider, cycle_num: int) -> bool:
    """Execute one round-trip swap cycle. Returns True if successful."""
    # Check balance
    eth_balance = get_eth_balance(wallet)
    log.info("Cycle %d | ETH balance: %.6f", cycle_num, eth_balance)

    if eth_balance < MIN_ETH_BALANCE:
        log.warning("Balance too low (%.6f < %.4f). Need funding at %s",
                     eth_balance, MIN_ETH_BALANCE, wallet.get_address())
        return False

    # Randomize swap amount
    swap_amount = random.uniform(SWAP_AMOUNT_MIN, SWAP_AMOUNT_MAX)
    swap_amount_str = f"{swap_amount:.5f}"
    log.info("Cycle %d | Swapping %s ETH -> USDC", cycle_num, swap_amount_str)

    # --- Leg 1: ETH -> USDC ---
    result = do_swap(provider, wallet, ETH_ADDRESS, USDC_BASE, swap_amount_str)
    if not result:
        return False

    log_tx("ETH->USDC", result["transactionHash"], swap_amount_str, "ETH", "USDC")
    usdc_received = result.get("toAmount", "?")
    log.info("Cycle %d | Received %s USDC", cycle_num, usdc_received)

    # --- Cooldown: wait 2-3 minutes ---
    cooldown = random.uniform(COOLDOWN_MIN_SECONDS, COOLDOWN_MAX_SECONDS)
    log.info("Cycle %d | Waiting %.0fs before swap-back...", cycle_num, cooldown)

    # Check for shutdown during cooldown (poll every 10s)
    elapsed = 0.0
    while elapsed < cooldown:
        if shutdown_requested:
            log.info("Shutdown during cooldown — USDC position open, will swap back next start")
            return True
        sleep_chunk = min(10.0, cooldown - elapsed)
        time.sleep(sleep_chunk)
        elapsed += sleep_chunk

    # --- Leg 2: USDC -> ETH ---
    log.info("Cycle %d | Swapping %s USDC -> ETH", cycle_num, usdc_received)
    result2 = do_swap(provider, wallet, USDC_BASE, ETH_ADDRESS, usdc_received)
    if not result2:
        log.warning("Swap-back failed, USDC position still open")
        return False

    log_tx("USDC->ETH", result2["transactionHash"], usdc_received, "USDC", "ETH")

    # Final balance
    final_balance = get_eth_balance(wallet)
    gas_cost = eth_balance - final_balance
    log.info("Cycle %d | Complete. Balance: %.6f ETH (gas cost: ~%.6f ETH)",
             cycle_num, final_balance, gas_cost)

    return True


def main() -> None:
    log.info("Initializing ChainWard test agent...")
    wallet, address = init_wallet()
    provider = cdp_evm_wallet_action_provider()

    eth_balance = get_eth_balance(wallet)

    print()
    print("=" * 60)
    print("  ChainWard Test Agent")
    print(f"  Network:  {os.getenv('NETWORK_ID', 'base-mainnet')}")
    print(f"  Wallet:   {address}")
    print(f"  Balance:  {eth_balance:.6f} ETH")
    print(f"  Swap:     {SWAP_AMOUNT_MIN}-{SWAP_AMOUNT_MAX} ETH/cycle")
    print(f"  Interval: {INTERVAL_MIN_HOURS}-{INTERVAL_MAX_HOURS}h (randomized)")
    print(f"  Max:      {MAX_CYCLES} cycles (0=unlimited)")
    print(f"  Cooldown: {COOLDOWN_MIN_SECONDS}-{COOLDOWN_MAX_SECONDS}s between legs")
    print(f"  TX Log:   {TX_LOG_FILE}")
    print("=" * 60)
    print()

    if eth_balance < MIN_ETH_BALANCE:
        log.error("Insufficient balance. Fund wallet: %s", address)
        sys.exit(1)

    cycle = 0
    while not shutdown_requested and (MAX_CYCLES == 0 or cycle < MAX_CYCLES):
        cycle += 1
        try:
            success = run_cycle(provider, wallet, cycle)
            if not success and get_eth_balance(wallet) < MIN_ETH_BALANCE:
                log.error("Out of funds. Shutting down.")
                break
        except Exception:
            log.exception("Cycle %d failed with exception", cycle)

        if shutdown_requested:
            break

        # Randomize next interval
        interval_hours = random.uniform(INTERVAL_MIN_HOURS, INTERVAL_MAX_HOURS)
        interval_seconds = interval_hours * 3600
        next_time = datetime.now(timezone.utc).timestamp() + interval_seconds
        next_str = datetime.fromtimestamp(next_time, tz=timezone.utc).strftime("%H:%M:%S UTC")
        log.info("Next cycle in %.1fh (at ~%s)", interval_hours, next_str)

        # Sleep in chunks so we can catch shutdown signals
        elapsed = 0.0
        while elapsed < interval_seconds and not shutdown_requested:
            sleep_chunk = min(30.0, interval_seconds - elapsed)
            time.sleep(sleep_chunk)
            elapsed += sleep_chunk

    log.info("Agent stopped. Total cycles: %d / %d", cycle, MAX_CYCLES)


if __name__ == "__main__":
    main()
