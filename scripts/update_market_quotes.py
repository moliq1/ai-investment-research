#!/usr/bin/env python3
"""Daily market-close snapshots for every company in the canonical Markdown.

Only the Markdown defines investment coverage and model estimates. This file
holds external, independently timestamped market quotes. Never edit the Markdown.
"""
from __future__ import annotations
import json
import math
from datetime import datetime, timedelta
from urllib.parse import urlencode
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "sources" / "AI投研_公司估值情景汇总.md"
OUTPUT = ROOT / "data" / "market_quotes.json"
CN_TZ = ZoneInfo("Asia/Shanghai")
MAX_SOURCE_AGE_DAYS = 14
EASTMONEY_URL = "https://push2his.eastmoney.com/api/qt/stock/kline/get"


def expected_closed_session(now):
    """Conservative weekday estimate; exchange holidays may have no close."""
    target = now.date() if now.hour >= 17 else (now - timedelta(days=1)).date()
    while target.weekday() >= 5:
        target -= timedelta(days=1)
    return target


def eastmoney_secid(symbol):
    if symbol.endswith(".SS"):
        return "1." + symbol[:-3]
    if symbol.endswith(".SZ"):
        return "0." + symbol[:-3]
    if symbol.endswith(".HK"):
        return "116." + symbol[:-3].zfill(5)
    raise ValueError("Unsupported market for fallback: " + symbol)


def parse_eastmoney_quote(payload, source_url):
    """Eastmoney unadjusted daily K-lines, same currency as the listed security."""
    data = payload.get("data") if isinstance(payload, dict) else None
    rows = data.get("klines") if isinstance(data, dict) else None
    if not isinstance(rows, list) or not rows:
        return None
    last = str(rows[-1]).split(",")
    if len(last) < 3:
        return None
    day = datetime.strptime(last[0][:10], "%Y-%m-%d").date().isoformat()
    close = float(last[2])
    if not math.isfinite(close) or close <= 0:
        return None
    previous = None
    if len(rows) >= 2:
        prior = str(rows[-2]).split(",")
        if len(prior) >= 3:
            previous = float(prior[2])
            if not math.isfinite(previous) or previous <= 0:
                previous = None
    # The exchange reference can differ from raw prior close on ex-dates.
    # If provider's own daily % differs, omit the % instead of fabricating it.
    if previous is not None and len(last) >= 9:
        try:
            provider_pct = float(last[8])
            implied_pct = (close / previous - 1) * 100
            if math.isfinite(provider_pct) and abs(implied_pct - provider_pct) > 0.08:
                print("SKIP ambiguous ex-date previous close", day, close, previous, provider_pct)
                previous = None
        except (ValueError, TypeError):
            pass
    return (day, close, previous, {}, source_url)


def fetch_eastmoney_quote(symbol, session):
    secid = eastmoney_secid(symbol)
    params = {
        "secid": secid,
        "fields1": "f1,f2,f3,f4,f5,f6",
        "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
        "klt": "101",
        "fqt": "0",
        "lmt": "10",
        "end": "20500101",
        "ut": "fa5fd1943c7b386f172d6893dbfba10b",
    }
    response = session.get(
        EASTMONEY_URL, params=params,
        headers={"User-Agent": "Mozilla/5.0", "Referer": "https://quote.eastmoney.com/"},
        timeout=(4, 7),
    )
    response.raise_for_status()
    url = getattr(response, "url", None) or EASTMONEY_URL + "?" + urlencode(params)
    return parse_eastmoney_quote(response.json(), url)


def quote_date(result):
    return datetime.strptime(str(result[0])[:10], "%Y-%m-%d").date() if result else None


def latest_available_quote(yahoo_result, fallback_result):
    """Only accept a genuinely newer daily bar; never replace with an older fallback."""
    if not fallback_result:
        return yahoo_result
    if not yahoo_result or quote_date(fallback_result) > quote_date(yahoo_result):
        return fallback_result
    return yahoo_result

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
                if len(result) not in (2, 3, 4, 5):
                    raise ValueError("Quote lookup must return 2, 3, 4 or 5 values")
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
                        source_url = (result[4] if len(result) == 5 else
                                      "https://finance.yahoo.com/quote/" + stock["symbol"] + "/history/")
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
        import requests
    except ImportError as exc:
        raise SystemExit("Install requirements.txt first") from exc
    stocks = master_stocks(MASTER.read_text("utf-8"))
    previous = json.loads(OUTPUT.read_text("utf-8")) if OUTPUT.exists() else {"quotes": []}
    now = datetime.now(CN_TZ)
    expected = expected_closed_session(now)
    session = requests.Session()
    fallback_failures = 0
    fallback_disabled = False
    fallback_used = 0

    def fetch_quote(symbol):
        nonlocal fallback_failures, fallback_disabled, fallback_used
        yahoo_quote = None
        try:
            frame = yf.Ticker(symbol).history(period="15d", interval="1d", auto_adjust=False)
            if frame is not None and not frame.empty:
                frame = frame.dropna(subset=["Close"])
                if not frame.empty:
                    previous_close = float(frame.iloc[-2]["Close"]) if len(frame) >= 2 else None
                    latest = frame.iloc[-1]
                    actions = {
                        "cashDividend": float(latest.get("Dividends", 0) or 0),
                        "stockSplit": float(latest.get("Stock Splits", 0) or 0),
                    }
                    yahoo_quote = (
                        frame.index[-1].date().isoformat(), float(latest["Close"]),
                        previous_close, actions
                    )
        except Exception as exc:
            print("Yahoo retrieval failed", symbol, type(exc).__name__, str(exc)[:120])

        # Yahoo may lag a whole A/H session while reporting no error.
        if yahoo_quote and quote_date(yahoo_quote) >= expected:
            return yahoo_quote

        if not fallback_disabled:
            try:
                secondary = fetch_eastmoney_quote(symbol, session)
                chosen = latest_available_quote(yahoo_quote, secondary)
                fallback_failures = 0
                if chosen is secondary and secondary is not None:
                    fallback_used += 1
                    print("FALLBACK Eastmoney", symbol, secondary[0], secondary[1])
                return chosen
            except Exception as exc:
                fallback_failures += 1
                print("Eastmoney fallback failed", symbol, type(exc).__name__, str(exc)[:140])
                if fallback_failures >= 4:
                    fallback_disabled = True
                    print("WARNING Eastmoney fallback temporarily disabled after 4 consecutive errors")
        return yahoo_quote

    updated, refreshed = refresh(stocks, previous, fetch_quote, now=now)
    serialized = json.dumps(updated, indent=2, ensure_ascii=False) + "\n"
    if not OUTPUT.exists() or OUTPUT.read_text("utf-8") != serialized:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(serialized, encoding="utf-8")
    latest_count = sum(q["closeDate"] == expected.isoformat() for q in updated["quotes"])
    snapshot_dates = sorted({q["closeDate"] for q in updated["quotes"] if q["closeDate"]})
    print(f"Refresh complete. {len(refreshed)} newly closed tickers / {len(stocks)} Markdown companies.")
    print(f"QUOTE HEALTH: expected session={expected}; today's coverage={latest_count}/{len(stocks)}; "
          f"Eastmoney newer={fallback_used}; latest snapshot dates={snapshot_dates[-4:]}")
    if latest_count == 0:
        print("::warning title=Market quote freshness::No quotes for expected weekday session "
              f"{expected}. Actions success must not be interpreted as current prices. "
              "This may be a market holiday or both sources may be delayed.")


if __name__ == "__main__":
    main()
