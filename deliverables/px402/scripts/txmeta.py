"""from / to / selector / block for a list of tx hashes, via JSON-RPC batches.
Usage: txmeta.py RPC_URL hashes.json [batch_size] > meta.jsonl   (hashes.json: a JSON list of hashes)"""
import json, sys, time, urllib.request

rpc_url, hashes = sys.argv[1], json.load(open(sys.argv[2]))
chunk_size = int(sys.argv[3]) if len(sys.argv) > 3 else 25

def batch(calls: list) -> list:
    body = json.dumps([{"jsonrpc": "2.0", "method": m, "params": p, "id": i} for i, (m, p) in enumerate(calls)]).encode()
    for attempt in range(6):
        try:
            req = urllib.request.Request(rpc_url, data=body, headers={"Content-Type": "application/json", "User-Agent": "cw-research"})
            res = sorted(json.load(urllib.request.urlopen(req, timeout=120)), key=lambda x: x["id"])
            return [x.get("result") for x in res]
        except Exception:
            if attempt == 5:
                raise
            time.sleep(3 * (attempt + 1))

for i in range(0, len(hashes), chunk_size):
    chunk = hashes[i:i + chunk_size]
    for h, t in zip(chunk, batch([("eth_getTransactionByHash", [h]) for h in chunk])):
        if t is None:
            print(json.dumps({"tx": h, "missing": True}))
            continue
        print(json.dumps({"tx": h, "block": int(t["blockNumber"], 16), "from": t["from"].lower(),
                          "to": (t["to"] or "").lower(), "sel": t["input"][:10]}))
    sys.stdout.flush()
