#!/usr/bin/env python3
"""Publish Markdown research plus independent dated daily market snapshots."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / ".site"
if OUTPUT.exists():
    shutil.rmtree(OUTPUT)
OUTPUT.mkdir(parents=True)

for name in ("index.html", ".nojekyll"):
    shutil.copy2(ROOT / name, OUTPUT / name)

(OUTPUT / "assets").mkdir()
for name in ("research.js", "research.css"):
    shutil.copy2(ROOT / "assets" / name, OUTPUT / "assets" / name)

(OUTPUT / "data").mkdir()
shutil.copy2(ROOT / "data" / "market_quotes.json", OUTPUT / "data" / "market_quotes.json")
(OUTPUT / "sources").mkdir()
shutil.copy2(
    ROOT / "sources" / "AI投研_公司估值情景汇总.md",
    OUTPUT / "sources" / "AI投研_公司估值情景汇总.md",
)
print("Markdown research + market snapshots:", OUTPUT)
