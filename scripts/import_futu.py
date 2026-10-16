#!/usr/bin/env python3
"""Optional: import real analyst prices through YOUR local Futu OpenD.

Requires a local authenticated OpenD and a compatible futu-api SDK. Missing
coverage or unsupported SDK shapes result in no imported prices, never DEMO rows.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
LABELS = {0: "未知", 1: "卖出", 2: "减持", 3: "持有", 4: "买入", 5: "强烈买入"}

def read(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))

def save(name, rows):
    (DATA / name).write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def code_from_stock(symbol):
    ticker, exchange = symbol.split(".")
    if exchange == "SH":
        return "SH." + ticker
    if exchange == "HK":
        return "HK." + ticker.zfill(5)
    raise ValueError("Unsupported exchange: " + exchange)

def normalize(stock_id, group):
    info = group.get("institution_info") or {}
    name = info.get("institution_name") or info.get("institution_en_name")
    if not name:
        return []
    output = []
    for row in group.get("rating_item_list", []):
        try:
            target = float(row.get("target_price") or 0)
        except (TypeError, ValueError):
            continue
        day = row.get("recommendation_date_str")
        if target <= 0 or not day:
            continue
        link = row.get("rating_url") or ""
        if not link.startswith(("https://", "http://")):
            link = ""
        identity = stock_id + "|" + str(name) + "|" + str(day) + "|" + str(target) + "|" + link
        output.append({
            "uid": "futu-" + hashlib.sha256(identity.encode()).hexdigest()[:20],
            "stockId": stock_id,
            "institution": name,
            "target": target,
            "rating": LABELS.get(row.get("rating"), "未知"),
            "date": str(day)[:10],
            "url": link,
            "origin": "Futu OpenAPI"
        })
    return output

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=11111)
    args = parser.parse_args()
    from futu import OpenQuoteContext, RET_OK
    quote = OpenQuoteContext(host=args.host, port=args.port)
    index = {x["uid"]: x for x in read("brokers.json")}
    consensus = {x["stockId"]: x for x in read("consensus.json")}
    try:
        for stock in read("stocks.json"):
            code = code_from_stock(stock["id"])
            print("LOOKUP", code)
            try:
                ret, result = quote.get_research_analyst_consensus(code)
                if ret == RET_OK and isinstance(result, dict) and result.get("total"):
                    consensus[stock["id"]] = {
                        "stockId": stock["id"], "highest": result.get("highest"),
                        "lowest": result.get("lowest"), "average": result.get("average"),
                        "total": result.get("total"), "date": result.get("update_time_str", ""),
                        "origin": "Futu OpenAPI"
                    }
                else:
                    print("No supported consensus response", code)
            except Exception as exc:
                print("Consensus unsupported", code, str(exc)[:150])
            try:
                next_key = None
                seen = set()
                for _ in range(20):
                    kwargs = {"rating_dimension_type": 1, "num": 20}
                    if next_key:
                        kwargs["next_key"] = next_key
                    ret, result = quote.get_research_rating_summary(code, **kwargs)
                    if ret != RET_OK or not isinstance(result, dict):
                        print("No supported institution response", code)
                        break
                    for group in result.get("inst_rating_summary_list", []):
                        for entry in normalize(stock["id"], group):
                            index[entry["uid"]] = entry
                    next_key = result.get("next_key")
                    if not next_key or str(next_key) == "-1" or next_key in seen:
                        break
                    seen.add(next_key)
            except Exception as exc:
                print("Institution ratings unsupported", code, str(exc)[:150])
    finally:
        quote.close()
    save("brokers.json", sorted(index.values(), key=lambda x: (x["stockId"], x["institution"], x["date"])))
    save("consensus.json", sorted(consensus.values(), key=lambda x: x["stockId"]))
    print("Saved valid available rows; missing original URLs stay visibly unverified.")

if __name__ == "__main__":
    main()
