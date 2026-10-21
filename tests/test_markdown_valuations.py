import re
import unittest
from pathlib import Path

DOC = Path(__file__).resolve().parents[1] / "sources" / "AI投研_公司估值情景汇总.md"

class MasterValuationArchiveTests(unittest.TestCase):
    def test_canonical_markdown_scenarios(self):
        text = DOC.read_text(encoding="utf-8")
        self.assertIn("文档版本**：v2.0", text)
        lines = text.splitlines()
        start = next(i for i,l in enumerate(lines) if l.startswith("| 公司 | 代码 |"))
        rows=[]
        for row in lines[start+1:]:
            if not row.startswith("|"): break
            if re.fullmatch(r"[| \-:]+", row): continue
            cells=[x.strip().replace("**","") for x in row.strip().strip("|").split("|")]
            self.assertGreaterEqual(len(cells), 11)
            rows.append(cells)
        self.assertGreaterEqual(len(rows), 40)
        self.assertEqual(len({r[1] for r in rows}), len(rows))
        complete=0
        for r in rows:
            code=r[1]
            self.assertRegex(code, r"^\d{5,6}\.(?:HK|SH|SZ)$")
            self.assertRegex(text, re.escape("（"+code+"）"))
            vals=r[6:9]
            if all(v!="待补充" for v in vals):
                complete+=1
                for val in vals:
                    self.assertRegex(val, r"\d")
            elif any(v!="待补充" for v in vals):
                self.assertIn("待补充", vals)
        self.assertGreaterEqual(complete, 18)
        self.assertIn("| 中国黄金国际 | 02099.HK", text)
        self.assertIn("HK$189–220", text)
        self.assertNotIn("纯 UI 演示数字", text)
