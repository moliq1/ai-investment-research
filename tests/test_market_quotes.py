import importlib.util
import json
import unittest
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
MARKET = ROOT / "data" / "market_quotes.json"
MD = ROOT / "sources" / "AI投研_公司估值情景汇总.md"
spec = importlib.util.spec_from_file_location("market_quotes_update", ROOT / "scripts" / "update_market_quotes.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
TZ = ZoneInfo("Asia/Shanghai")


class MarketQuoteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.universe = mod.master_stocks(MD.read_text("utf-8"))
        cls.current = json.loads(MARKET.read_text("utf-8"))

    def canonical_snapshot(self):
        snapshot = json.loads(json.dumps(self.current))
        mapping = {stock["code"]: stock["symbol"] for stock in self.universe}
        for quote in snapshot["quotes"]:
            quote["symbol"] = mapping[quote["code"]]
        return snapshot

    def test_markdown_controls_coverage(self):
        self.assertGreaterEqual(len(self.universe), 12)
        self.assertEqual(len(self.current["quotes"]), len(self.universe))
        self.assertEqual(
            {x["code"] for x in self.universe},
            {x["code"] for x in self.current["quotes"]},
        )
        mapping = {x["code"]: x["symbol"] for x in self.universe}
        self.assertEqual(mapping["02099.HK"], "2099.HK")
        self.assertEqual(mapping["01378.HK"], "1378.HK")
        self.assertEqual(mapping["00522.HK"], "0522.HK")
        self.assertEqual(mapping["00992.HK"], "0992.HK")
        self.assertEqual(mapping["688012.SH"], "688012.SS")
        self.assertEqual(mapping["000807.SZ"], "000807.SZ")
        self.assertEqual(mapping["000426.SZ"], "000426.SZ")

    def test_legacy_short_hk_symbols_preserve_closes_when_lookup_fails(self):
        earlier = self.canonical_snapshot()
        legacy = {"00522.HK": ("522.HK", 121.7),
                  "00992.HK": ("992.HK", 22.64)}
        for quote in earlier["quotes"]:
            if quote["code"] in legacy:
                quote["symbol"], quote["close"] = legacy[quote["code"]]
                quote["closeDate"] = "2026-10-23"
        result, refreshed = mod.refresh(
            self.universe, earlier, lambda _: None,
            datetime(2026, 10, 26, 20, 0, tzinfo=TZ),
        )
        self.assertEqual(refreshed, [])
        quotes = {q["code"]: q for q in result["quotes"]}
        for code, (old_symbol, old_close) in legacy.items():
            self.assertNotEqual(quotes[code]["symbol"], old_symbol)
            self.assertEqual(quotes[code]["symbol"], "0" + old_symbol)
            self.assertEqual(quotes[code]["close"], old_close)
            self.assertEqual(quotes[code]["closeDate"], "2026-10-23")

    def test_legacy_short_hk_symbols_fetch_new_close(self):
        earlier = self.canonical_snapshot()
        for quote in earlier["quotes"]:
            if quote["code"] in ("00522.HK", "00992.HK"):
                quote["symbol"] = str(int(quote["code"].split(".")[0])) + ".HK"
                quote["closeDate"] = "2026-10-23"
        fetches = {"0522.HK": ("2026-10-26", 100.0, 110.0),
                   "0992.HK": ("2026-10-26", 90.0, 100.0)}
        result, refreshed = mod.refresh(
            self.universe, earlier, fetches.get,
            datetime(2026, 10, 26, 20, 0, tzinfo=TZ),
        )
        self.assertEqual(set(refreshed), {"00522.HK", "00992.HK"})
        by_code = {q["code"]: q for q in result["quotes"]}
        self.assertEqual(by_code["00522.HK"]["close"], 100.0)
        self.assertEqual(by_code["00522.HK"]["changePercent"], -9.09)
        self.assertEqual(by_code["00992.HK"]["close"], 90.0)
        self.assertEqual(by_code["00992.HK"]["changePercent"], -10.0)
        self.assertEqual(by_code["00992.HK"]["sourceUrl"],
                         "https://finance.yahoo.com/quote/0992.HK/history/")

    def test_unrelated_hk_symbol_cannot_reuse_close(self):
        earlier = self.canonical_snapshot()
        row = next(q for q in earlier["quotes"] if q["code"] == "00522.HK")
        row.update(symbol="9999.HK", close=123.0, closeDate="2026-10-23")
        result, _ = mod.refresh(
            self.universe, earlier, lambda _: None,
            datetime(2026, 10, 26, 20, 0, tzinfo=TZ),
        )
        actual = next(q for q in result["quotes"] if q["code"] == "00522.HK")
        self.assertEqual(actual["symbol"], "0522.HK")
        self.assertIsNone(actual["close"])
        self.assertIsNone(actual["closeDate"])


    def test_invalid_future_quotes_cannot_overwrite(self):
        earlier = self.canonical_snapshot()
        fixed = datetime(2026, 10, 22, 20, 0, tzinfo=TZ)
        newer, updated = mod.refresh(self.universe, earlier, lambda _: ("2030-01-01", 9999), fixed)
        self.assertEqual(updated, [])
        self.assertEqual(newer["quotes"], earlier["quotes"])

    def test_valid_new_close_updates_only_its_ticker(self):
        earlier = json.loads(json.dumps(self.current))
        fixed = datetime(2026, 10, 22, 20, 0, tzinfo=TZ)
        def lookup(symbol):
            return ("2026-10-22", 195.1) if symbol == "2099.HK" else None
        for entry in earlier["quotes"]:
            if entry["code"] == "02099.HK":
                # The live archive may already have updated to Oct 22; test a past snapshot.
                entry["closeDate"] = "2026-10-21"
                entry["close"] = 194.9
        newer, updated = mod.refresh(self.universe, earlier, lookup, fixed)
        self.assertEqual(updated, ["02099.HK"])
        first = next(x for x in newer["quotes"] if x["code"] == "02099.HK")
        self.assertEqual(first["closeDate"], "2026-10-22")
        self.assertEqual(first["close"], 195.1)
        self.assertEqual(first["currency"], "HK$")
        self.assertIn("2099.HK", first["sourceUrl"])

    def test_intraday_and_old_candles_rejected(self):
        fixed = datetime(2026, 10, 22, 14, 0, tzinfo=TZ)
        older = self.canonical_snapshot()
        result, updated = mod.refresh(self.universe, older, lambda _: ("2026-10-22", 190), fixed)
        self.assertEqual(updated, [])
        self.assertEqual(result["quotes"], older["quotes"])
        fixed = datetime(2026, 10, 22, 20, 0, tzinfo=TZ)
        result, updated = mod.refresh(self.universe, older, lambda _: ("2026-09-01", 190), fixed)
        self.assertEqual(updated, [])
        self.assertEqual(result["quotes"], older["quotes"])


    def test_new_close_includes_previous_trading_close_and_day_change(self):
        earlier = json.loads(json.dumps(self.current))
        fixed = datetime(2026, 10, 22, 20, 0, tzinfo=TZ)
        target = next(entry for entry in earlier["quotes"] if entry["code"] == "02099.HK")
        target.update(close=180, closeDate="2026-10-21")
        result, refreshed = mod.refresh(
            self.universe, earlier,
            lambda symbol: ("2026-10-22", 183.2, 181.0) if symbol == "2099.HK" else None,
            fixed,
        )
        row = next(x for x in result["quotes"] if x["code"] == "02099.HK")
        self.assertIn("02099.HK", refreshed)
        self.assertEqual(row["close"], 183.2)
        self.assertEqual(row["previousClose"], 181.0)
        self.assertEqual(row["changePercent"], 1.22)

    def test_same_day_backfills_change_without_overwriting_close(self):
        earlier = json.loads(json.dumps(self.current))
        fixed = datetime(2026, 10, 22, 20, 0, tzinfo=TZ)
        target = next(x for x in earlier["quotes"] if x["code"] == "02099.HK")
        target.update(closeDate="2026-10-22", close=183.2)
        target.pop("previousClose", None)
        target.pop("changePercent", None)
        result, refreshed = mod.refresh(
            self.universe, earlier,
            lambda symbol: ("2026-10-22", 183.2, 181.0) if symbol == "2099.HK" else None,
            fixed,
        )
        row = next(x for x in result["quotes"] if x["code"] == "02099.HK")
        self.assertEqual(refreshed, [])
        self.assertEqual(row["close"], 183.2)
        self.assertEqual(row["closeDate"], "2026-10-22")
        self.assertEqual(row["previousClose"], 181)
        self.assertEqual(row["changePercent"], 1.22)

    def test_stale_change_is_not_used_for_a_new_close_without_previous_data(self):
        earlier = json.loads(json.dumps(self.current))
        fixed = datetime(2026, 10, 22, 20, 0, tzinfo=TZ)
        target = next(x for x in earlier["quotes"] if x["code"] == "02099.HK")
        target.update(closeDate="2026-10-21", close=180,
                      previousClose=170, changePercent=5.88)
        result, refreshed = mod.refresh(
            self.universe, earlier,
            lambda symbol: ("2026-10-22", 183.2) if symbol == "2099.HK" else None,
            fixed,
        )
        row = next(x for x in result["quotes"] if x["code"] == "02099.HK")
        self.assertEqual(refreshed, ["02099.HK"])
        self.assertIsNone(row["previousClose"])
        self.assertIsNone(row["changePercent"])

    def test_mismatched_same_day_bar_does_not_fabricate_day_change(self):
        earlier = json.loads(json.dumps(self.current))
        fixed = datetime(2026, 10, 22, 20, 0, tzinfo=TZ)
        target = next(x for x in earlier["quotes"] if x["code"] == "02099.HK")
        target.update(closeDate="2026-10-22", close=183.2)
        target.pop("previousClose", None)
        target.pop("changePercent", None)
        result, refreshed = mod.refresh(
            self.universe, earlier,
            lambda symbol: ("2026-10-22", 184.0, 181.0) if symbol == "2099.HK" else None,
            fixed,
        )
        row = next(x for x in result["quotes"] if x["code"] == "02099.HK")
        self.assertEqual(refreshed, [])
        self.assertEqual(row["close"], 183.2)
        self.assertNotIn("previousClose", row)
        self.assertNotIn("changePercent", row)


    def test_cash_dividend_reference_reproduces_yunlu_2026_10_30(self):
        # Company filing: RMB 8.87 per 10 shares; 2026-10-30 ex-dividend.
        # Official exchange reference: 25.98 - 0.887 -> 25.09 (fen precision).
        action = {"cashDividend": 0.887, "stockSplit": 0}
        self.assertEqual(mod.reference_close(25.98, action, "A股"), 25.09)
        previous = self.canonical_snapshot()
        target = next(q for q in previous["quotes"] if q["code"] == "000807.SZ")
        target.update(close=25.98, closeDate="2026-10-29",
                      previousClose=25.91, changePercent=0.27)
        result, updated = mod.refresh(
            self.universe, previous,
            lambda symbol: ("2026-10-30", 25.36, 25.98, action)
            if symbol == "000807.SZ" else None,
            datetime(2026, 10, 30, 20, 0, tzinfo=TZ),
        )
        self.assertIn("000807.SZ", updated)
        row = next(q for q in result["quotes"] if q["code"] == "000807.SZ")
        self.assertEqual(row["close"], 25.36)
        self.assertEqual(row["previousClose"], 25.09)
        self.assertEqual(row["changePercent"], 1.08)
        self.assertEqual(row["rawPreviousClose"], 25.98)
        self.assertEqual(row["cashDividend"], 0.887)

    def test_dividend_correction_replaces_prior_wrong_same_day_ratio(self):
        previous = self.canonical_snapshot()
        target = next(q for q in previous["quotes"] if q["code"] == "000807.SZ")
        target.update(close=25.36, closeDate="2026-10-30",
                      previousClose=25.98, changePercent=-2.39)
        target.pop("cashDividend", None)
        target.pop("rawPreviousClose", None)
        result, updated = mod.refresh(
            self.universe, previous,
            lambda symbol: ("2026-10-30", 25.36, 25.98,
                            {"cashDividend": 0.887, "stockSplit": 0})
            if symbol == "000807.SZ" else None,
            datetime(2026, 10, 30, 20, 0, tzinfo=TZ),
        )
        self.assertEqual(updated, [])
        row = next(q for q in result["quotes"] if q["code"] == "000807.SZ")
        self.assertEqual(row["previousClose"], 25.09)
        self.assertEqual(row["changePercent"], 1.08)

    def test_corporate_action_without_exchange_reference_hides_percentage(self):
        self.assertIsNone(mod.reference_close(25.98, {"stockSplit": 2}, "A股"))
        self.assertIsNone(mod.reference_close(100, {"cashDividend": 1}, "港股"))
        self.assertIsNone(mod.reference_close(1, {"cashDividend": 2}, "A股"))
        previous = self.canonical_snapshot()
        target = next(q for q in previous["quotes"] if q["code"] == "000807.SZ")
        target.update(close=25.98, closeDate="2026-10-29",
                      previousClose=25.91, changePercent=0.27)
        result, updated = mod.refresh(
            self.universe, previous,
            lambda symbol: ("2026-10-30", 25.36, 25.98,
                            {"stockSplit": 2, "cashDividend": 0})
            if symbol == "000807.SZ" else None,
            datetime(2026, 10, 30, 20, 0, tzinfo=TZ),
        )
        self.assertIn("000807.SZ", updated)
        row = next(q for q in result["quotes"] if q["code"] == "000807.SZ")
        self.assertIsNone(row["previousClose"])
        self.assertIsNone(row["changePercent"])

    def test_verified_oct_30_snapshot_is_not_clobbered_by_missing_action(self):
        # Keeping a corrected exchange reference is safer than accepting
        # Yahoo's raw previous close when action metadata is missing.
        previous = self.canonical_snapshot()
        target = next(q for q in previous["quotes"] if q["code"] == "000807.SZ")
        target.update(close=25.36, closeDate="2026-10-30",
                      previousClose=25.09, changePercent=1.08,
                      cashDividend=0.887, rawPreviousClose=25.98)
        result, updated = mod.refresh(
            self.universe, previous,
            lambda symbol: ("2026-10-30", 25.36, 25.98)
            if symbol == "000807.SZ" else None,
            datetime(2026, 10, 30, 20, 0, tzinfo=TZ),
        )
        row = next(q for q in result["quotes"] if q["code"] == "000807.SZ")
        self.assertEqual(updated, [])
        self.assertEqual(row["previousClose"], 25.09)
        self.assertEqual(row["changePercent"], 1.08)


    def test_eastmoney_market_codes_and_latest_session(self):
        self.assertEqual(mod.eastmoney_secid("601899.SS"), "1.601899")
        self.assertEqual(mod.eastmoney_secid("300750.SZ"), "0.300750")
        self.assertEqual(mod.eastmoney_secid("2899.HK"), "116.02899")
        self.assertEqual(mod.eastmoney_secid("0522.HK"), "116.00522")
        self.assertEqual(mod.expected_closed_session(
            datetime(2026, 11, 13, 0, 6, tzinfo=TZ)).isoformat(), "2026-11-12")
        self.assertEqual(mod.expected_closed_session(
            datetime(2026, 11, 16, 12, 0, tzinfo=TZ)).isoformat(), "2026-11-13")

    def test_eastmoney_unadjusted_daily_bar_parsing_and_selection(self):
        payload = {"rc": 0, "data": {"klines": [
            "2026-11-11,27.50,27.86,27.95,27.18,123,456,1,-1.14,-0.32",
            "2026-11-12,27.31,26.78,27.51,26.70,321,654,1,-3.88,-1.08",
        ]}}
        em = mod.parse_eastmoney_quote(payload, "https://example.com/eastmoney")
        self.assertEqual(em[:3], ("2026-11-12", 26.78, 27.86))
        self.assertEqual(em[4], "https://example.com/eastmoney")
        yahoo = ("2026-11-11", 27.86, 28.18, {})
        self.assertIs(mod.latest_available_quote(yahoo, em), em)
        self.assertIs(mod.latest_available_quote(em, yahoo), em)
        self.assertEqual(mod.latest_available_quote(None, em), em)
        newer = ("2026-11-13", 27.11, 26.78, {})
        self.assertIs(mod.latest_available_quote(newer, em), newer)

    def test_eastmoney_ambiguous_exdate_and_bad_payload(self):
        payload = {"data": {"klines": [
            "2026-10-29,25.00,25.98,26,25,123,456,1,1.00",
            "2026-10-30,25.10,25.36,26,25,123,456,1,1.08",
        ]}}
        quote = mod.parse_eastmoney_quote(payload, "https://example.com")
        self.assertEqual(quote[:2], ("2026-10-30", 25.36))
        self.assertIsNone(quote[2], "Ex-date raw prior is not the exchange reference")
        self.assertIsNone(mod.parse_eastmoney_quote({"data": {"klines": []}}, "https://example.com"))
        self.assertIsNone(mod.parse_eastmoney_quote({"data": None}, "https://example.com"))

    def test_eastmoney_quote_fetch_uses_unadjusted_klines(self):
        class Response:
            url = "https://example.com/kline?secid=116.02899"
            def raise_for_status(self): pass
            def json(self):
                return {"data": {"klines": [
                    "2026-11-11,28.91,28.94,29.1,28.8,100,50,1,-0.62",
                    "2026-11-12,28.0,27.88,28.1,27.7,100,50,1,-3.66"
                ]}}
        class Session:
            def get(self, url, params, headers, timeout):
                self.params = params
                self.timeout = timeout
                return Response()
        session = Session()
        quote = mod.fetch_eastmoney_quote("2899.HK", session)
        self.assertEqual(session.params["secid"], "116.02899")
        self.assertEqual(session.params["fqt"], "0")
        self.assertEqual(session.params["klt"], "101")
        self.assertEqual(quote[0], "2026-11-12")

    def test_fallback_source_url_is_preserved_in_snapshot(self):
        previous = self.canonical_snapshot()
        target = next(x for x in previous["quotes"] if x["code"] == "601899.SH")
        target.update(closeDate="2026-11-11", close=27.86)
        source = "https://example.com/kline?secid=1.601899"
        result, updated = mod.refresh(
            self.universe, previous,
            lambda symbol: ("2026-11-12", 26.78, 27.86, {}, source)
            if symbol == "601899.SS" else None,
            datetime(2026, 11, 12, 20, 0, tzinfo=TZ),
        )
        self.assertIn("601899.SH", updated)
        row = next(x for x in result["quotes"] if x["code"] == "601899.SH")
        self.assertEqual(row["close"], 26.78)
        self.assertEqual(row["sourceUrl"], source)
        self.assertEqual(row["previousClose"], 27.86)


    def test_tencent_ticker_mapping_and_daily_close(self):
        self.assertEqual(mod.tencent_symbol("601899.SS"), "sh601899")
        self.assertEqual(mod.tencent_symbol("300750.SZ"), "sz300750")
        self.assertEqual(mod.tencent_symbol("2899.HK"), "hk02899")
        self.assertEqual(mod.tencent_symbol("0522.HK"), "hk00522")
        response = {"data": {"hk02899": {"qfqday": [
            ["2026-11-11", "29.1", "28.94", "29.5", "28.5", "100"],
            ["2026-11-12", "28.0", "27.94", "28.2", "27.8", "150"],
        ]}}}
        close = mod.parse_tencent_quote(response, "hk02899", "https://example.com/tencent")
        self.assertEqual(close[:3], ("2026-11-12", 27.94, 28.94))
        self.assertEqual(close[4], "https://example.com/tencent")
        self.assertIsNone(mod.parse_tencent_quote({"data": {}}, "hk02899", "https://example.com"))

    def test_tencent_http_json_and_jsonp_parsing(self):
        class Response:
            url = "https://example.com/tencent?param=sh601899"
            text = json.dumps({"data": {"sh601899": {"day": [
                ["2026-11-11", "27.5", "27.86", "27.9", "27.1", "100"],
                ["2026-11-12", "27.31", "26.78", "27.51", "26.70", "200"],
            ]}}})
            def raise_for_status(self): pass
        class Session:
            def get(self, url, params, headers, timeout):
                self.params = params
                return Response()
        session = Session()
        result = mod.fetch_tencent_quote("601899.SS", session)
        self.assertEqual(session.params["param"], "sh601899,day,,,10,qfq")
        self.assertEqual(result[:3], ("2026-11-12", 26.78, 27.86))
        Response.text = "kline_dayqfq=" + Response.text + ";"
        self.assertEqual(mod.fetch_tencent_quote("601899.SS", session)[:2],
                         ("2026-11-12", 26.78))


if __name__ == "__main__":
    unittest.main()
