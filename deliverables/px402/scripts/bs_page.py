"""Paginate a Blockscout v2 list endpoint to JSONL. Usage: bs_page.py URL out.jsonl [max_pages]"""
import json, sys, time, urllib.request, urllib.parse
url, out = sys.argv[1], sys.argv[2]
max_pages = int(sys.argv[3]) if len(sys.argv) > 3 else 400
H = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
     "Accept": "application/json, text/plain, */*", "Accept-Language": "en-US,en;q=0.9", "Referer": "https://base.blockscout.com/"}
def get(u):
    for attempt in range(6):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=60))
        except Exception as e:
            if attempt == 5: raise
            time.sleep(2 * (attempt + 1))
base, _, qs = url.partition("?")
params = dict(urllib.parse.parse_qsl(qs))
n = 0
with open(out, "w") as f:
    for page in range(max_pages):
        d = get(base + "?" + urllib.parse.urlencode(params))
        items = d.get("items", [])
        for it in items:
            f.write(json.dumps(it) + "\n"); n += 1
        nxt = d.get("next_page_params")
        if not nxt or not items: break
        params.update({k: str(v) for k, v in nxt.items()})
        time.sleep(0.4)
print(out, "items", n, "pages", page + 1, file=sys.stderr)
