#!/usr/bin/env python3
"""Build a static GitHub Pages site from the public research files."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / ".site"
if OUTPUT.exists():
    shutil.rmtree(OUTPUT)
OUTPUT.mkdir()
for name in ("index.html", ".nojekyll"):
    shutil.copy2(ROOT / name, OUTPUT / name)
for folder in ("assets", "data", "reports", "docs"):
    shutil.copytree(ROOT / folder, OUTPUT / folder)
print("GitHub Pages output:", OUTPUT)
