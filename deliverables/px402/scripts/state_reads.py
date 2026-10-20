"""Read px402 reserve state at a fixed block via eth_call.

Usage: python3 -I state_reads.py RPC_URL BLOCK DATA_DIR
Prints protocol-side values in full. Per-reserve slots are printed under truncated
labels only (internal reconciliation; never publish them).
"""
import json
import sys
import urllib.request
from pathlib import Path

RESERVE = "0xdd31c57e8f7cac78090a516292f0c9dea6c6119f"
USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
RELAYERS = {"A": "0x6f890cc63aa57da9695528c9f5e3434897b32b8e", "B": "0x47e5499c44ecf8c78da82b9b64183df1e301a0b4"}
T_DEPOSIT = "0xe31c7b8d08ee7db0afa68782e1028ef92305caeea8626633ad44d413e30f6b2f"
SEL = {"totalBonded": "0x44d96e95", "redeemed": "0xe231bff0", "finalizedDebits": "0xcf2ec124",
       "relayerCount": "0xcf1a7a21", "issuer": "0x1d143848", "registry": "0x7b103999"}


def call(rpc: str, block: int, to: str, data: str) -> str:
    body = json.dumps({"jsonrpc": "2.0", "method": "eth_call", "id": 1,
                       "params": [{"to": to, "data": data}, hex(block)]}).encode()
    req = urllib.request.Request(rpc, data=body, headers={"Content-Type": "application/json", "User-Agent": "cw-research"})
    res = json.load(urllib.request.urlopen(req, timeout=60))
    if "error" in res:
        raise RuntimeError(res["error"])
    return res["result"]


def pad(addr: str) -> str:
    return addr[2:].lower().rjust(64, "0")


def main() -> None:
    rpc, block, data_dir = sys.argv[1], int(sys.argv[2]), Path(sys.argv[3])
    print("block", block, "rpc", rpc)
    for name, sel in SEL.items():
        r = call(rpc, block, RESERVE, sel)
        v = int(r, 16)
        print(name, ("0x" + r[-40:]) if name in ("issuer", "registry") else (v, v / 1e6))
    for label, a in [("reserve", RESERVE), *RELAYERS.items()]:
        v = int(call(rpc, block, USDC, "0x70a08231" + pad(a)), 16)
        print("USDC balanceOf", label, v, f"${v / 1e6:.6f}")
    for i in range(3):
        try:
            r = call(rpc, block, RESERVE, "0x11162be7" + hex(i)[2:].rjust(64, "0"))
            print("relayerList", i, "0x" + r[-40:])
        except RuntimeError as e:
            print("relayerList", i, "reverts", str(e)[:80])
    reserves = sorted({"0x" + json.loads(l)["topics"][1][-40:] for l in (data_dir / "reserve_logs.jsonl").open()
                       if json.loads(l)["topics"][0] == T_DEPOSIT})
    for i, r in enumerate(reserves):
        raw = call(rpc, block, RESERVE, "0xd66bd524" + pad(r))
        words = [int(raw[2 + 64 * k: 2 + 64 * (k + 1)], 16) for k in range((len(raw) - 2) // 64)]
        print(f"[private] reserve slot R{i} ({r[:8]}): words {words}")


if __name__ == "__main__":
    main()
