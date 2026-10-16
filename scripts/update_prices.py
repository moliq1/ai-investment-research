#!/usr/bin/env python3
"""Best-effort daily quote refresh; never silently overwrite with bad data."""
from __future__ import annotations
import json
from pathlib import Path
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "data" / "stocks.json"
TZ = ZoneInfo("Asia/Shanghai")

def refresh(stocks, lookup, now=None):
    now = now or datetime.now(TZ)
    today = now.date()
    changed = []
    for stock in stocks:
        symbol = stock["quoteSymbol"]
        try:
            item = lookup(symbol)
            if not item:
                print("SKIP no quote", symbol)
                continue
            day, price = item
            day = datetime.strptime(str(day)[:10], "%Y-%m-%d").date()
            price = float(price)
            if not (0 < price < 1000000) or not (today - timedelta(days=10) <= day <= today):
                print("SKIP invalid/stale/future", symbol, day)
                continue
            # A fresh intraday daily candle may not yet be the official close.
            if day == today and now.hour < 17:
                print("SKIP intraday / market not closed", symbol)
                continue
            if day.isoformat() <= stock["closeDate"]:
                print("UNCHANGED", symbol, day)
                continue
            stock["close"] = round(price, 4)
            stock["closeDate"] = day.isoformat()
            stock["closeSource"] = "https://finance.yahoo.com/quote/" + symbol + "/history/"
            changed.append(symbol)
            print("UPDATED", symbol, day, price)
        except Exception as exc:
            print("SKIP", symbol, type(exc).__name__, str(exc)[:120])
    return changed

def main():
    try:
        import yfinance as yf
    except ImportError as exc:
        raise SystemExit("Install requirements first") from exc

    def lookup(symbol):
        frame = yf.Ticker(symbol).history(period="12d", interval="1d", auto_adjust=False)
        if frame is None or frame.empty:
            return None
        frame = frame.dropna(subset=["Close"])
        if frame.empty:
            return None
        row = frame.iloc[-1]
        return frame.index[-1].date().isoformat(), float(row["Close"])

    stocks = json.loads(PATH.read_text(encoding="utf-8"))
    changed = refresh(stocks, lookup)
    if changed:
        PATH.write_text(json.dumps(stocks, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Updated", len(changed), "out of", len(stocks), "securities")

if __name__ == "__main__":
    main()
