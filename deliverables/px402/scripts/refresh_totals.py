"""Aggregate px402 usage totals from Blockscout pulls, up to a snapshot block.

Usage: python3 -I refresh_totals.py DATA_DIR SNAPSHOT_BLOCK [--private]

DATA_DIR holds reserve_logs.jsonl, reserve_tt.jsonl, r1_tt.jsonl, r2_tt.jsonl
(written by bs_page.py). Prints aggregate counts only. --private additionally prints
per-reserve breakdowns with truncated identifiers, for internal reconciliation;
never paste that output into anything public.
"""
import collections
import datetime as dt
import json
import statistics
import sys
from pathlib import Path

RESERVE = "0xdd31c57e8f7cac78090a516292f0c9dea6c6119f"
RELAYERS = {
    "0x6f890cc63aa57da9695528c9f5e3434897b32b8e": "A",
    "0x47e5499c44ecf8c78da82b9b64183df1e301a0b4": "B",
}
DEPLOYER = "0xa116959ffe4f64b82e294ef2209b34423c078e9f"
T_DEPOSIT = "0xe31c7b8d08ee7db0afa68782e1028ef92305caeea8626633ad44d413e30f6b2f"
T_WITHDRAW = "0x0d2b0a4cc0c315eda197d0c2a945a0be2a2646e42af2646b2e9defac0a773383"
T_REDEEMED = "0x61d905e697374527439f5c64f060ae521e3b586e8f61ef3f160057e7150e153e"
T_PAYOUT = "0xdb2f7f81fd0cc0484d5c756e08bdb97ef44fabb4afb96d82fab60d94613606cf"
T_BONDED = "0x524384adee0b2f52827eebf00ddd616aa286978612393216724d61cdb43dc835"
T_SPENDROOT = "0x92b3c69ead1b9c5022752047df4175aa8f83447d75f79bf343811c9f088b29ce"
T_RECLAIM = "0xc377b1364cc81001a126469ccf94609fc3bc3041f20e583f39aa88713271184a"


def load(path: Path, snap: int) -> list[dict]:
    rows = [json.loads(line) for line in path.open()]
    return [r for r in rows if r["block_number"] <= snap]


def word(data: str, i: int) -> int:
    return int(data[2 + 64 * i: 2 + 64 * (i + 1)], 16)


def addr_topic(t: str) -> str:
    return "0x" + t[-40:]


def ts(s: str) -> dt.datetime:
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))


def usd(v: int) -> float:
    return v / 1e6


def main() -> None:
    data_dir, snap = Path(sys.argv[1]), int(sys.argv[2])
    private = "--private" in sys.argv
    logs = load(data_dir / "reserve_logs.jsonl", snap)
    rtt = load(data_dir / "reserve_tt.jsonl", snap)
    rel = load(data_dir / "r1_tt.jsonl", snap) + load(data_dir / "r2_tt.jsonl", snap)

    by_topic: dict[str, list[dict]] = collections.defaultdict(list)
    for log in logs:
        by_topic[log["topics"][0]].append(log)
    print("snapshot block", snap, "reserve logs", len(logs))
    print("log counts by topic:", {k[:10]: len(v) for k, v in by_topic.items()})

    deposits = by_topic[T_DEPOSIT]
    dep_reserves = {addr_topic(d["topics"][1]) for d in deposits}
    dep_funders = {addr_topic(d["topics"][2]) for d in deposits}
    dep_total = sum(word(d["data"], 0) for d in deposits)
    print(f"deposits {len(deposits)} total ${usd(dep_total):.3f} reserves {len(dep_reserves)} funders {len(dep_funders)}")
    print("deposit days (UTC):", sorted(collections.Counter(d["block_timestamp"][:10] for d in deposits).items()))

    wds = by_topic[T_WITHDRAW]
    wd_reserves = {addr_topic(w["topics"][2]) for w in wds}
    wd_total = sum(word(w["data"], 0) for w in wds)
    print(f"withdrawals {len(wds)} total ${usd(wd_total):.3f} reserves {len(wd_reserves)}")

    red = by_topic[T_REDEEMED]
    red_total = sum(word(r["data"], 0) for r in red)
    red_amounts = collections.Counter(word(r["data"], 0) for r in red)
    print(f"redeemed events {len(red)} total ${usd(red_total):.3f} amounts {dict(red_amounts)}")
    print("PayoutRecorded", len(by_topic[T_PAYOUT]), "SpendRootCommitted", len(by_topic[T_SPENDROOT]),
          "BalanceReclaimed", len(by_topic[T_RECLAIM]), "Bonded", len(by_topic[T_BONDED]))
    if by_topic[T_SPENDROOT]:
        last = max(by_topic[T_SPENDROOT], key=lambda x: x["block_number"])
        print("last SpendRootCommitted", last["block_number"], last["block_timestamp"], last["transaction_hash"],
              "snapId", word(last["data"], 0) if len(last["topics"]) == 1 else int(last["topics"][1], 16),
              "data words", [word(last["data"], i) for i in range((len(last["data"]) - 2) // 64)])

    # Reserve USDC flows
    r_in = [t for t in rtt if t["to"]["hash"].lower() == RESERVE]
    r_out = [t for t in rtt if t["from"]["hash"].lower() == RESERVE]
    print(f"reserve USDC in {len(r_in)} ${usd(sum(int(t['total']['value']) for t in r_in)):.3f}; "
          f"out {len(r_out)} ${usd(sum(int(t['total']['value']) for t in r_out)):.3f}")
    print("reserve out recipients:", collections.Counter(RELAYERS.get(t["to"]["hash"].lower(), "other") for t in r_out))

    # Relayer payments: USDC out of a relayer to anyone except the reserve (bond)
    seen = set()
    pays, other_out, rel_in = [], [], []
    for t in rel:
        key = (t["transaction_hash"], t["log_index"])
        if key in seen:
            continue
        seen.add(key)
        f, to = t["from"]["hash"].lower(), t["to"]["hash"].lower()
        if f in RELAYERS and to == RESERVE:
            other_out.append(("bond", t))
        elif f in RELAYERS and to in RELAYERS:
            other_out.append(("relayer-to-relayer", t))
        elif f in RELAYERS:
            pays.append(t)
        elif to in RELAYERS:
            rel_in.append(t)
    vals = [int(p["total"]["value"]) for p in pays]
    payto = collections.Counter(p["to"]["hash"].lower() for p in pays)
    print(f"payments {len(pays)} total ${usd(sum(vals)):.3f} prices {dict(collections.Counter(vals))} distinct payTo {len(payto)}")
    print("payments by relayer:", collections.Counter(RELAYERS[p["from"]["hash"].lower()] for p in pays))
    print("payment methods:", collections.Counter(p.get("method") for p in pays))
    print("other relayer outflows:", [(k, t["to"]["hash"][:10], int(t["total"]["value"])) for k, t in other_out])
    print("relayer inflows by source:", collections.Counter(
        "reserve" if t["from"]["hash"].lower() == RESERVE else ("deployer" if t["from"]["hash"].lower() == DEPLOYER else "other")
        for t in rel_in))
    print("relayer inflow non-reserve detail:", [(t["from"]["hash"][:10], int(t["total"]["value"]), t["timestamp"])
                                                 for t in rel_in if t["from"]["hash"].lower() != RESERVE])
    top = payto.most_common(5)
    print("top payTo share:", round(top[0][1] / len(pays), 3), "top5 share:", round(sum(c for _, c in top) / len(pays), 3),
          "paid once:", sum(1 for c in payto.values() if c == 1))

    days = collections.defaultdict(lambda: collections.Counter())
    for p in pays:
        d = p["timestamp"][:10]
        days[d]["n"] += 1
        days[d]["usd"] += int(p["total"]["value"])
    for w in wds:
        days[w["block_timestamp"][:10]]["wd"] += 1
        days[w["block_timestamp"][:10]]["wd_usd"] += word(w["data"], 0)
    for d in deposits:
        days[d["block_timestamp"][:10]]["dep"] += 1
        days[d["block_timestamp"][:10]]["dep_usd"] += word(d["data"], 0)
    for r in red:
        days[r["block_timestamp"][:10]]["melt"] += 1
        days[r["block_timestamp"][:10]]["melt_usd"] += word(r["data"], 0)
    print("day | dep | dep$ | wd | wd$ | pays | pay$ | payTo | melts | melt$")
    for d in sorted(days):
        c = days[d]
        n_payto = len({p["to"]["hash"].lower() for p in pays if p["timestamp"][:10] == d})
        print(d, c["dep"], f"{usd(c['dep_usd']):.2f}", c["wd"], f"{usd(c['wd_usd']):.3f}", c["n"], f"{usd(c['usd']):.3f}",
              n_payto, c["melt"], f"{usd(c['melt_usd']):.3f}")

    pt = sorted(ts(p["timestamp"]) for p in pays)
    gaps = [(b - a).total_seconds() for a, b in zip(pt, pt[1:])]
    print("first payment", pt[0], "last payment", pt[-1], "median gap s", statistics.median(gaps) if gaps else None)
    since_15 = [g for a, g in zip(pt, gaps) if a >= dt.datetime(2026, 10, 15, tzinfo=dt.UTC)]
    print("median gap s since Oct 15", statistics.median(since_15) if since_15 else None)

    # Anonymity-set measures
    wd_times = sorted((ts(w["block_timestamp"]), addr_topic(w["topics"][2])) for w in wds)
    upper, day_window = collections.Counter(), collections.Counter()
    since_last = []
    for p in pt:
        prior = {r for t, r in wd_times if t <= p}
        upper[len(prior)] += 1
        recent = {r for t, r in wd_times if p - dt.timedelta(hours=24) <= t <= p}
        day_window[len(recent)] += 1
        last = max((t for t, _ in wd_times if t <= p), default=None)
        if last is not None:
            since_last.append((p - last).total_seconds())
    print("payer-set upper bound (reserves withdrawn before payment):", dict(upper))
    print("reserves withdrawn in prior 24h:", dict(day_window))
    print("secs since latest withdrawal: median", statistics.median(since_last), "within 10 min",
          sum(1 for s in since_last if s <= 600), "within 1h", sum(1 for s in since_last if s <= 3600))

    dep_wd = []
    for d in sorted(deposits, key=lambda x: x["block_number"]):
        r = addr_topic(d["topics"][1])
        t0 = ts(d["block_timestamp"])
        nxt = min((t for t, rr in wd_times if rr == r and t >= t0), default=None)
        if nxt is not None:
            dep_wd.append((nxt - t0).total_seconds())
    print("deposit -> next same-reserve withdrawal, seconds:", dep_wd)

    if private:
        labels = {r: f"R{i}" for i, r in enumerate(sorted(dep_reserves | wd_reserves))}
        print("[private] per-reserve deposits:", collections.Counter(labels[addr_topic(d["topics"][1])] for d in deposits))
        print("[private] per-reserve withdrawals:", {
            labels[r]: (sum(1 for w in wds if addr_topic(w["topics"][2]) == r),
                        usd(sum(word(w["data"], 0) for w in wds if addr_topic(w["topics"][2]) == r)))
            for r in wd_reserves})
        print("[private] reserve labels (truncated):", {v: k[:8] for k, v in labels.items()})
        print("[private] payment txs after block 52818898:",
              len({p["transaction_hash"] for p in pays if p["block_number"] > 52818898}))
        tail = sorted({p["transaction_hash"] for p in pays if p["block_number"] > 52818898})
        (data_dir / "tail_payment_hashes.json").write_text(json.dumps(tail))
        (data_dir / "all_payment_hashes.json").write_text(json.dumps(sorted({p["transaction_hash"] for p in pays})))


if __name__ == "__main__":
    main()
