#!/usr/bin/env python3
"""Daily market-close snapshots for every company in the canonical Markdown.

Only the Markdown defines investment coverage and model estimates. This file
holds external, independently timestamped market quotes. Never edit the Markdown.
"""
from __future__ import annotations
import json
import math
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "sources" / "AI投研_公司估值情景汇总.md"
OUTPUT = ROOT / "data" / "market_quotes.json"
CN_TZ = ZoneInfo("Asia/Shanghai")
MAX_SOURCE_AGE_DAYS = 14

def master_stocks(markdown: str):
    lines = markdown.splitlines()
    index = next((i for i, line in enumerate(lines)
                  if line.startswith("| 公司 | 代码 | 行业 |")), None)
    if index is None:
        raise ValueError("Master markdown valuation table not found")
    stocks = []
    for line in lines[index + 1:]:
        if not line.startswith("|"):
            break
        if all(char in "| :-" for char in line):
            continue
        columns = [x.strip().replace("**", "") for x in line.strip().strip("|").split("|")]
        if len(columns) != 12:
            raise ValueError("Malformed valuation master table")
        name, code, _, market, _, ref, *_ = columns
        if code.endswith(".HK"):
            # Yahoo uses at least four digits for HK tickers (00522 -> 0522).
            # Strip only surplus leading zeros; preserve padding for 1-3 digit codes.
            symbol = str(int(code.split(".")[0])).zfill(4) + ".HK"
            unit = "HK$"
        elif code.endswith(".SH"):
            symbol = code[:-3] + ".SS"
            unit = "¥"
        elif code.endswith(".SZ"):
            symbol = code
            unit = "¥"
        else:
            raise ValueError("Unknown ticker: " + code)
        if not ref.startswith(unit):
            raise ValueError(f"Currency mismatch for {code}")
        stocks.append({"code": code, "name": name, "market": market,
                       "symbol": symbol, "currency": unit})
    if not stocks:
        raise ValueError("No eligible valuation entries found")
    if len({s["code"] for s in stocks}) != len(stocks):
        raise ValueError("Duplicate ticker in master")
    return stocks

def refresh(master_entries, existing, lookup, now=None):
    now = now or datetime.now(CN_TZ)
    today = now.date()
    old_map = {item["code"]: item for item in existing.get("quotes", [])}
    quotes = []
    refreshed = []
    for stock in master_entries:
        code = stock["code"]
        last = old_map.get(code, {})
        # Accept snapshots written by the former, over-aggressive HK zero
        # stripping rule so a temporary Yahoo outage cannot erase valid closes.
        compatible_symbols = {stock["symbol"]}
        if code.endswith(".HK"):
            compatible_symbols.add(str(int(code.split(".")[0])) + ".HK")
        valid_old = (last.get("symbol") in compatible_symbols and
                     last.get("currency") == stock["currency"])
        close = last.get("close") if valid_old else None
        date = last.get("closeDate") if valid_old else None
        source_url = last.get("sourceUrl") if valid_old else None
        previous_close = last.get("previousClose") if valid_old else None
        change_percent = last.get("changePercent") if valid_old else None
        has_change_fields = valid_old and ("previousClose" in last or "changePercent" in last)
        try:
            result = lookup(stock["symbol"])
            if result:
                # Two values remain accepted for older clients; new fetchers return
                # (latest closed trading day, unadjusted close, prior daily close).
                if len(result) not in (2, 3):
                    raise ValueError("Quote lookup must return two or three values")
                day_value, price_value = result[:2]
                prior_value = result[2] if len(result) == 3 else None
                day = datetime.strptime(str(day_value)[:10], "%Y-%m-%d").date()
                price = float(price_value)
                valid = (math.isfinite(price) and 0 < price < 1_000_000 and
                         today - timedelta(days=MAX_SOURCE_AGE_DAYS) <= day <= today)
                # An unfinished daily bar must never masquerade as a close.
                valid = valid and not (day == today and now.hour < 17)
                day_text = day.isoformat()
                is_new = valid and (date is None or day_text > date)
                # Backfill the percentage on a verified SAME-DAY bar without
                # overwriting the published price from a different source.
                is_backfill = (valid and date == day_text and close is not None and
                               abs(round(price, 4) - float(close)) < 0.00005 and
                               (previous_close is None or change_percent is None))
                if is_new or is_backfill:
                    prior = None
                    if prior_value is not None:
                        candidate = float(prior_value)
                        if math.isfinite(candidate) and 0 < candidate < 1_000_000:
                            prior = round(candidate, 4)
                    if is_new:
                        close = round(price, 4)
                        date = day_text
                        source_url = "https://finance.yahoo.com/quote/" + stock["symbol"] + "/history/"
                        refreshed.append(code)
                        print("UPDATED", code, stock["symbol"], date, close)
                    if prior is not None:
                        previous_close = prior
                        change_percent = round((float(close) / prior - 1) * 100, 2)
                        has_change_fields = True
                        if is_backfill:
                            print("ENRICHED daily change", code, date, change_percent)
                    elif is_new:
                        # A new daily close must not inherit the previous day's change.
                        previous_close, change_percent = None, None
                        has_change_fields = True
                elif not valid:
                    print("SKIP invalid/intraday/stale quote", stock["symbol"], day)
        except Exception as exc:
            print("SKIP quote retrieval error", stock["symbol"], type(exc).__name__, str(exc)[:140])
        entry = {**stock, "close": close, "closeDate": date, "sourceUrl": source_url}
        if has_change_fields:
            entry["previousClose"] = previous_close
            entry["changePercent"] = change_percent
        quotes.append(entry)
    return {"schemaVersion": 1, "quotes": quotes}, refreshed

def main():
    try:
        import yfinance as yf
    except ImportError as exc:
        raise SystemExit("Install requirements.txt first") from exc
    stocks = master_stocks(MASTER.read_text("utf-8"))
    previous = json.loads(OUTPUT.read_text("utf-8")) if OUTPUT.exists() else {"quotes": []}

    def fetch_quote(symbol):
        frame = yf.Ticker(symbol).history(period="15d", interval="1d", auto_adjust=False)
        if frame is None or frame.empty:
            return None
        frame = frame.dropna(subset=["Close"])
        if frame.empty:
            return None
        previous_close = float(frame.iloc[-2]["Close"]) if len(frame) >= 2 else None
        return frame.index[-1].date().isoformat(), float(frame.iloc[-1]["Close"]), previous_close

    updated, refreshed = refresh(stocks, previous, fetch_quote)
    serialized = json.dumps(updated, indent=2, ensure_ascii=False) + "\n"
    if not OUTPUT.exists() or OUTPUT.read_text("utf-8") != serialized:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(serialized, encoding="utf-8")
    print(f"Refresh complete. {len(refreshed)} newly closed tickers / {len(stocks)} Markdown companies.")

if __name__ == "__main__":
    main()
