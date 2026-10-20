"""Every log the px402 reserve emitted, from its deploy block to a given block.
Usage: reserve_logs.py RPC_URL FROM TO [step] > logs.jsonl
Runs on cw-sentinel against http://localhost:8545 (or a public RPC with a 500-block step)."""
import json, sys, time, urllib.request
RESERVE = "0xdd31c57e8f7cac78090a516292f0c9dea6c6119f"
rpc_url, start, end = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
step = int(sys.argv[4]) if len(sys.argv) > 4 else 10000

def rpc(method: str, params: list) -> object:
    body = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    for attempt in range(6):
        try:
            req = urllib.request.Request(rpc_url, data=body, headers={"Content-Type": "application/json", "User-Agent": "cw-research"})
            res = json.load(urllib.request.urlopen(req, timeout=120))
            if "error" in res:
                raise RuntimeError(res["error"])
            return res["result"]
        except Exception as e:
            if attempt == 5:
                raise
            time.sleep(2 * (attempt + 1))

b = start
while b <= end:
    e = min(b + step - 1, end)
    logs = rpc("eth_getLogs", [{"address": RESERVE, "fromBlock": hex(b), "toBlock": hex(e)}])
    for l in logs:
        print(json.dumps({"block": int(l["blockNumber"], 16), "tx": l["transactionHash"], "li": int(l["logIndex"], 16),
                          "topics": l["topics"], "data": l["data"]}))
    sys.stdout.flush()
    b = e + 1
