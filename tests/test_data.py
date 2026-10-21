import json
from pathlib import Path
import unittest
from datetime import date
import importlib.util

ROOT = Path(__file__).resolve().parents[1]

def get_data(name):
    return json.loads((ROOT / "data" / (name + ".json")).read_text("utf-8"))

class ResearchDataTests(unittest.TestCase):
    def test_stocks(self):
        stocks = get_data("stocks")
        self.assertTrue({"601899.SH", "2899.HK", "2259.HK", "2099.HK"}.issubset({s["id"] for s in stocks}))
        for s in stocks:
            if s["close"] is not None:
                self.assertGreater(s["close"], 0)
                self.assertLessEqual(date.fromisoformat(s["closeDate"]), date.today())
                self.assertTrue(s["closeSource"].startswith("https://"))
            else:
                self.assertIsNone(s["closeDate"])
            self.assertIn(s["currency"], ("CNY", "HKD"))

    def test_demo_scenarios(self):
        scenarios = get_data("scenarios")
        self.assertEqual({s["id"] for s in get_data("stocks")}, {s["stockId"] for s in scenarios})
        for m in scenarios:
            self.assertIn(m["status"], ("historical", "partial", "unavailable"))
            for kind in ("bear", "base", "bull"):
                lo, hi = m[kind+"Low"], m[kind+"High"]
                self.assertEqual(lo is None, hi is None)
                if lo is not None:
                    self.assertGreater(lo, 0)
                    self.assertLessEqual(lo, hi)
            self.assertEqual(m["sourceType"], "prior_chat_reconstruction")

    def test_brokers(self):
        for row in get_data("brokers"):
            self.assertGreater(row["target"], 0)
            date.fromisoformat(row["date"])

    def test_reports(self):
        for row in get_data("reports"):
            path = ROOT / row["path"]
            self.assertTrue(path.exists())
            self.assertTrue(str(path.resolve()).startswith(str(ROOT.resolve())))

    def test_future_quote_rejected(self):
        spec = importlib.util.spec_from_file_location("market_update", ROOT / "scripts/update_prices.py")
        update = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(update)
        rows = get_data("stocks")
        before = [s["close"] for s in rows]
        self.assertEqual(update.refresh(rows, lambda _: ("2030-01-01", 999)), [])
        self.assertEqual([s["close"] for s in rows], before)

if __name__ == "__main__":
    unittest.main()
