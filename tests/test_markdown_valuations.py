import re
import unittest
from pathlib import Path

DOC = Path(__file__).resolve().parents[1] / "sources" / "AI投研_公司估值情景汇总.md"

class MasterValuationArchiveTests(unittest.TestCase):
    def test_canonical_markdown_scenarios(self):
        text = DOC.read_text(encoding="utf-8")
        self.assertRegex(text, r"文档版本\*\*：v\d+\.\d+")
        lines = text.splitlines()
        start = next(i for i,l in enumerate(lines) if l.startswith("| 公司 | 代码 |"))
        rows=[]
        for row in lines[start+1:]:
            if not row.startswith("|"): break
            if all(c in '| -:' for c in row): continue
            cells=[x.strip().replace("**","") for x in row.strip().strip("|").split("|")]
            self.assertGreaterEqual(len(cells), 12)
            rows.append(cells)
        self.assertGreaterEqual(len(rows), 12)
        self.assertEqual(len({r[1] for r in rows}), len(rows))
        # A company can have a combined A/H section, but each security needs an entry.
        sections = re.findall(r"^###\s+\d+\.\s+.+?（([^）]+)）\s*$", text, flags=re.M)
        heading_codes = {c.strip() for group in sections for c in re.split(r"\s*/\s*", group)}
        complete=0
        for r in rows:
            code=r[1]
            self.assertRegex(code, r"^\d{5,6}\.(?:HK|SH|SZ)$")
            self.assertIn(code, heading_codes)
            vals=r[7:10]
            if all(v!="待补充" for v in vals):
                complete+=1
                for val in vals:
                    self.assertRegex(val, r"\d")
            elif any(v!="待补充" for v in vals):
                self.assertIn("待补充", vals)
        self.assertEqual(complete, len(rows))
        self.assertIn("| 中国黄金国际 | 02099.HK", text)
        self.assertNotIn("| 洛阳钼业 A |", text)
        self.assertIn("| 兴业银锡 | 000426.SZ", text)
        for row in rows:
            self.assertRegex(row[4], r"^\d{4}-\d{2}-\d{2}$")
            self.assertRegex(row[5], r"^(?:HK\$|¥)[\d,]+(?:\.\d+)?$")
            self.assertTrue(all(r"待补充" not in val and r"待核实" not in val for val in row[7:10]))
        self.assertIn("HK$189–220", text)
        self.assertNotIn("纯 UI 演示数字", text)

    def test_industry_time_order_and_source_index(self):
        content = DOC.read_text(encoding="utf-8")
        lines = content.splitlines()
        start = next(i for i, row in enumerate(lines) if row.startswith("| 公司 | 代码 |"))
        rows = []
        for row in lines[start+1:]:
            if not row.startswith("|"): break
            if all(ch in '| -:' for ch in row): continue
            rows.append([c.strip().replace("**", "") for c in row.strip("|").split("|")])
        industries = ["有色金属与矿业", "半导体与电子材料", "计算机与AI基础设施", "电力装备与电源", "新能源与储能"]
        self.assertEqual([industries.index(r[2]) for r in rows], sorted(industries.index(r[2]) for r in rows))
        for sector in industries:
            dates = [r[11] for r in rows if r[2] == sector]
            self.assertEqual(dates, sorted(dates, reverse=True))
        self.assertEqual(content.count("#### 原始聊天与研究来源"), len(set(re.findall(r"^###\s+\d+\.", content, flags=re.M))))
        self.assertGreaterEqual(content.count("#### 2.3 核心估值逻辑"), 11)
        self.assertGreaterEqual(len(re.findall(r"^####\s+\d+\.\d+\s+估值与市场预期差的核验节点", content, flags=re.M)), 11)
        self.assertIn("原始 ChatGPT 对话链接：未取得可核实的分享 URL", content)
