#!/usr/bin/env python3
"""Verify that the published GitHub Pages price JSON matches the built snapshot.

A successful Pages deployment status is not enough to prove that the public CDN
already serves the new file. Retry through the brief publication delay and make
a stale public site an actionable workflow failure.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_FILE = ROOT / "data" / "market_quotes.json"
PAGE_QUOTES_URL = "https://moliq1.github.io/ai-investment-research/data/market_quotes.json"
MAX_ATTEMPTS = 18
RETRY_SECONDS = 8


def compare_snapshots(expected: dict, live: dict) -> list[str]:
    if expected.get("schemaVersion") != 1 or live.get("schemaVersion") != 1:
        return ["invalid schemaVersion"]
    if not isinstance(expected.get("quotes"), list) or not isinstance(live.get("quotes"), list):
        return ["missing quotes array"]
    original = {q["code"]: q for q in expected["quotes"]}
    published = {q["code"]: q for q in live["quotes"]}
    return [code for code in sorted(set(original) | set(published))
            if original.get(code) != published.get(code)]


def verify_published_quotes(expected: dict, base_url=PAGE_QUOTES_URL,
                            max_attempts=MAX_ATTEMPTS, wait=RETRY_SECONDS) -> None:
    run_id = os.environ.get("GITHUB_RUN_ID", "manual")
    for attempt in range(1, max_attempts + 1):
        url = f"{base_url}?verify={run_id}-{time.time_ns()}"
        try:
            request = Request(
                url, headers={"Cache-Control": "no-cache", "Pragma": "no-cache",
                              "User-Agent": "AI-Investment-Research-Pages-Verification/1.0"}
            )
            with urlopen(request, timeout=12) as response:
                live = json.load(response)
            differences = compare_snapshots(expected, live)
            if not differences:
                dates = sorted({q.get("closeDate") for q in live["quotes"] if q.get("closeDate")})
                print(f"LIVE SITE VERIFIED: {len(live['quotes'])} quote records, "
                      f"latest date {dates[-1] if dates else 'none'}, exact match")
                return
            print(f"Attempt {attempt}/{max_attempts}: public Pages JSON differs for "
                  f"{len(differences)} tickers (first: {differences[:6]})", flush=True)
        except (HTTPError, URLError, TimeoutError, ValueError, KeyError) as exc:
            print(f"Attempt {attempt}/{max_attempts}: public Pages check failed: "
                  f"{type(exc).__name__}: {str(exc)[:200]}", flush=True)
        if attempt < max_attempts:
            time.sleep(wait)
    raise SystemExit(
        "::error::The public website does not match data/market_quotes.json after "
        f"{max_attempts} checks. Pages CDN/deployment is stale; do not report this run as published."
    )


if __name__ == "__main__":
    verify_published_quotes(json.loads(EXPECTED_FILE.read_text(encoding="utf-8")))
