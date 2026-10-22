#!/usr/bin/env python3
"""Daily market-close snapshots for every company in the canonical Markdown.

Only the Markdown defines investment coverage and model estimates. This file
holds external, independently timestamped market quotes. Never edit the Markdown.
"""
from __future__ import annotations
import json
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
            # Yahoo HK tickers do not preserve 5-digit zero padding.
            symbol = str(int(code.split(".")[0])) + ".HK"
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
        valid_old = (last.get("symbol") == stock["symbol"] and
                     last.get("currency") == stock["currency"])
        close = last.get("close") if valid_old else None
        date = last.get("closeDate") if valid_old else None
        source_url = last.get("sourceUrl") if valid_old else None
        try:
            result = lookup(stock["symbol"])
            if result:
                day_value, price_value = result
                day = datetime.strptime(str(day_value)[:10], "%Y-%m-%d").date()
                price = float(price_value)
                valid = (price > 0 and price < 1_000_000 and
                         today - timedelta(days=MAX_SOURCE_AGE_DAYS) <= day <= today)
                # An unfinished daily bar must never masquerade as a close.
                valid = valid and not (day == today and now.hour < 17)
                if valid and (date is None or day.isoformat() > date):
                    close = round(price, 4)
                    date = day.isoformat()
                    source_url = "https://finance.yahoo.com/quote/" + stock["symbol"] + "/history/"
                    refreshed.append(code)
                    print("UPDATED", code, stock["symbol"], date, close)
                elif not valid:
                    print("SKIP invalid/intraday/stale quote", stock["symbol"], day)
        except Exception as exc:
            print("SKIP quote retrieval error", stock["symbol"], type(exc).__name__, str(exc)[:140])
        quotes.append({**stock, "close": close, "closeDate": date, "sourceUrl": source_url})
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
        return frame.index[-1].date().isoformat(), float(frame.iloc[-1]["Close"])

    updated, refreshed = refresh(stocks, previous, fetch_quote)
    serialized = json.dumps(updated, indent=2, ensure_ascii=False) + "\n"
    if not OUTPUT.exists() or OUTPUT.read_text("utf-8") != serialized:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(serialized, encoding="utf-8")
    print(f"Refresh complete. {len(refreshed)} newly closed tickers / {len(stocks)} Markdown companies.")

if __name__ == "__main__":
    main()
