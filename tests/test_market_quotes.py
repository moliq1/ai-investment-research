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


if __name__ == "__main__":
    unittest.main()
