# Repository working instructions

This is the `moliq1/ai-investment-research` research dashboard. For requests to add or revise valuations, financial reports, quarterly reviews, A/H stock research, or publish website updates:

1. Read [docs/RESEARCH_UPDATE_SOP.md](docs/RESEARCH_UPDATE_SOP.md) before changing any research content.
2. Treat `sources/AI投研_公司估值情景汇总.md` as the single source of truth for research on the published website. `data/market_quotes.json` is a separately dated market-close snapshot, not a valuation model. Preserve historical research; don't insert invented prices or estimates.
3. On financial reporting updates, compare the frozen prior forecast with reported actuals, revise the same company section and A/H rows together, and write the quarterly detail in `reports/<slug>/YYYYQn.md`. Keep actuals, guidance, consensus, and internal scenarios distinct.
4. Don't silently modify unrelated companies, hardcode the number of stocks, or double-count subsidiary minority interests. Follow the exact 12-column table structure and existing Markdown parser conventions.
5. Run `python -m unittest discover -s tests -v`, `node --check assets/research.js`, `node tests/smoke_research.js`, and `python scripts/build_site.py` when local execution is available. Confirm GitHub Actions and Pages deployment status after pushing; commit success alone does not mean the website is updated.
6. Report the commit and relevant GitHub files, plus a Pages link and truthful success/failure status. If sources or verification are unavailable, label limitations and do not fabricate.
