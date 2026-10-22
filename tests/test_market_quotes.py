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

    def test_markdown_controls_coverage(self):
        self.assertEqual(len(self.universe), 12)
        self.assertEqual(len(self.current["quotes"]), len(self.universe))
        self.assertEqual(
            {x["code"] for x in self.universe},
            {x["code"] for x in self.current["quotes"]},
        )
        mapping = {x["code"]: x["symbol"] for x in self.universe}
        self.assertEqual(mapping["02099.HK"], "2099.HK")
        self.assertEqual(mapping["01378.HK"], "1378.HK")
        self.assertEqual(mapping["688012.SH"], "688012.SS")
        self.assertEqual(mapping["000807.SZ"], "000807.SZ")

    def test_invalid_future_quotes_cannot_overwrite(self):
        earlier = json.loads(json.dumps(self.current))
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
        older = json.loads(json.dumps(self.current))
        result, updated = mod.refresh(self.universe, older, lambda _: ("2026-10-22", 190), fixed)
        self.assertEqual(updated, [])
        self.assertEqual(result["quotes"], older["quotes"])
        fixed = datetime(2026, 10, 22, 20, 0, tzinfo=TZ)
        result, updated = mod.refresh(self.universe, older, lambda _: ("2026-09-01", 190), fixed)
        self.assertEqual(updated, [])
        self.assertEqual(result["quotes"], older["quotes"])


if __name__ == "__main__":
    unittest.main()
