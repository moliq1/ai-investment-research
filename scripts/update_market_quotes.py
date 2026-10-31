#!/usr/bin/env python3
"""Daily market-close snapshots for every company in the canonical Markdown.

Only the Markdown defines investment coverage and model estimates. This file
holds external, independently timestamped market quotes. Never edit the Markdown.
"""
from __future__ import annotations
import json
import math
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
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

def reference_close(raw_prior, action, market):
    """Use an A-share cash-dividend ex-date reference, not yesterday's raw close.

    Without corporate actions, the prior daily close is the comparison basis.
    Splits/rights and non-A-share cash actions require an independently verified
    exchange reference; omit the percentage rather than imply a wrong direction.
    """
    if raw_prior is None:
        return None
    prior = float(raw_prior)
    if not math.isfinite(prior) or prior <= 0:
        return None
    action = action or {}
    dividend = float(action.get("cashDividend") or 0)
    split = float(action.get("stockSplit") or 0)
    if not math.isfinite(dividend) or not math.isfinite(split) or dividend < 0:
        return None
    if split != 0:
        return None
    if dividend == 0:
        return round(prior, 4)
    if market != "A股" or dividend >= prior:
        return None
    # A-shares trade in ¥0.01 ticks. E.g. 25.98 - 0.887 = 25.093
    # becomes the ¥25.09 ex-dividend reference published by the exchange.
    adjusted = (Decimal(str(prior)) - Decimal(str(dividend))).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    return float(adjusted)


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
        action_data = {key: last[key] for key in ("rawPreviousClose", "cashDividend")
                       if valid_old and key in last}
        try:
            result = lookup(stock["symbol"])
            if result:
                # (date, close, raw_prior, corporate_actions). Preserve older
                # two/three-field adapters for test clients.
                if len(result) not in (2, 3, 4):
                    raise ValueError("Quote lookup must return 2, 3 or 4 values")
                day_value, price_value = result[:2]
                prior_value = result[2] if len(result) >= 3 else None
                action = result[3] if len(result) == 4 else {}
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
                same_close = (valid and date == day_text and close is not None and
                              abs(round(price, 4) - float(close)) < 0.00005)
                reference = reference_close(prior_value, action, stock["market"])
                dividend = float((action or {}).get("cashDividend") or 0)
                # If Yahoo now supplies a dividend event, repair a previously
                # published same-day percentage without changing the close.
                is_correction = (same_close and dividend > 0 and reference is not None
                                 and previous_close != reference)
                is_backfill = same_close and (previous_close is None or change_percent is None)
                if is_new or is_backfill or is_correction:
                    if is_new:
                        close = round(price, 4)
                        date = day_text
                        source_url = "https://finance.yahoo.com/quote/" + stock["symbol"] + "/history/"
                        refreshed.append(code)
                        print("UPDATED", code, stock["symbol"], date, close)
                    previous_close = reference
                    change_percent = (round((float(close) / reference - 1) * 100, 2)
                                      if reference is not None else None)
                    has_change_fields = True
                    action_data = {}
                    if dividend > 0 and reference is not None:
                        action_data = {"cashDividend": round(dividend, 6),
                                       "rawPreviousClose": round(float(prior_value), 4)}
                    if is_correction:
                        print("CORRECTED ex-dividend change", code, date, change_percent)
                    elif is_backfill:
                        print("ENRICHED daily change", code, date, change_percent)
                elif not valid:
                    print("SKIP invalid/intraday/stale quote", stock["symbol"], day)
        except Exception as exc:
            print("SKIP quote retrieval error", stock["symbol"], type(exc).__name__, str(exc)[:140])
        entry = {**stock, "close": close, "closeDate": date, "sourceUrl": source_url}
        if has_change_fields:
            entry["previousClose"] = previous_close
            entry["changePercent"] = change_percent
            entry.update(action_data)
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
        latest = frame.iloc[-1]
        actions = {
            "cashDividend": float(latest.get("Dividends", 0) or 0),
            "stockSplit": float(latest.get("Stock Splits", 0) or 0),
        }
        return (frame.index[-1].date().isoformat(),
                float(latest["Close"]), previous_close, actions)

    updated, refreshed = refresh(stocks, previous, fetch_quote)
    serialized = json.dumps(updated, indent=2, ensure_ascii=False) + "\n"
    if not OUTPUT.exists() or OUTPUT.read_text("utf-8") != serialized:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(serialized, encoding="utf-8")
    print(f"Refresh complete. {len(refreshed)} newly closed tickers / {len(stocks)} Markdown companies.")

if __name__ == "__main__":
    main()
