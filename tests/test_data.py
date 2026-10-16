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
        self.assertEqual({s["id"] for s in stocks}, {"601899.SH", "2899.HK", "2259.HK", "2099.HK"})
        for s in stocks:
            self.assertGreater(s["close"], 0)
            self.assertIn(s["currency"], ("CNY", "HKD"))
            self.assertLessEqual(date.fromisoformat(s["closeDate"]), date.today())
            self.assertTrue(s["closeSource"].startswith("https://"))

    def test_demo_scenarios(self):
        scenarios = get_data("scenarios")
        self.assertEqual({s["id"] for s in get_data("stocks")}, {s["stockId"] for s in scenarios})
        for m in scenarios:
            self.assertEqual(m["status"], "demo")
            self.assertTrue(m["bear"] < m["base"] < m["bull"])

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
