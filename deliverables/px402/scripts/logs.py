"""eth_getLogs over a block range in fixed steps, one JSON line per log.
Usage: logs.py RPC_URL FROM TO STEP ADDRESS_OR_- 'TOPICS_JSON' > out.jsonl
ADDRESS '-' means any address. TOPICS_JSON is the eth_getLogs topics array, e.g.
'["0xddf2...", null, ["0xpadded..."]]'."""
import json, sys, time, urllib.request

rpc_url, start, end, step = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
address, topics = sys.argv[5], json.loads(sys.argv[6])

def rpc(method: str, params: list) -> object:
    body = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    for attempt in range(8):
        try:
            req = urllib.request.Request(rpc_url, data=body, headers={"Content-Type": "application/json", "User-Agent": "cw-research"})
            res = json.load(urllib.request.urlopen(req, timeout=300))
            if "error" in res:
                raise RuntimeError(res["error"])
            return res["result"]
        except Exception:
            if attempt == 7:
                raise
            time.sleep(2 * (attempt + 1))

b = start
while b <= end:
    e = min(b + step - 1, end)
    flt = {"fromBlock": hex(b), "toBlock": hex(e), "topics": topics}
    if address != "-":
        flt["address"] = address
    for l in rpc("eth_getLogs", [flt]):
        print(json.dumps({"block": int(l["blockNumber"], 16), "tx": l["transactionHash"], "li": int(l["logIndex"], 16),
                          "addr": l["address"].lower(), "topics": l["topics"], "data": l["data"]}))
    sys.stdout.flush()
    b = e + 1
