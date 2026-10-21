#!/usr/bin/env python3
"""Publish only the Markdown-driven research UI and its canonical source."""
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

(OUTPUT / "sources").mkdir()
shutil.copy2(
    ROOT / "sources" / "AI投研_公司估值情景汇总.md",
    OUTPUT / "sources" / "AI投研_公司估值情景汇总.md",
)
print("Markdown-only website output:", OUTPUT)
