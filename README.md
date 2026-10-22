# Alpha Atlas · AI 投研工作台

以 **[AI投研_公司估值情景汇总.md](sources/AI投研_公司估值情景汇总.md)** 为唯一研究内容来源的静态 GitHub Pages 网站。

**在线访问：** https://moliq1.github.io/ai-investment-research/

## v3 页面设计

- **研究总览**：文档中的研究公司数量、行业、三档情景数量、最近研究日期，以及最近研究与行业浏览。
- **公司估值库**：按 Markdown 原始行业分组与研究日期排列；支持公司/代码搜索、A/港股筛选、卡片与表格切换。
- **公司深度页**：每公司单独路由 `#/company/02099.HK`，可直接分享；完整展示三情景估值、参考价、独立区间图、原文参数表、模型补充说明、反向估值、原文逻辑、核验节点、研究来源与计算附注。
- **方法与变更记录**：展示 Markdown 文档中的免责声明、收录标准及历史变更记录。
- **移动端**：自适应导航与横向滚动参数表；无需外部框架/CDN/账号。

**数据口径**：所有公司、行业、历史参考价、模型假设、估值区间、经营参数、投资逻辑、核验节点均只读取同一份 Markdown。**最新有效收盘价**独立读取 `data/market_quotes.json`（每日自动抓取，带证券、币种、日期与来源）。网页版估值百分比优先按有效最新收盘价计算，不改变 Markdown 内的历史参考价；没有有效收盘价则暂停计算与筛选。

### 为什么不用原来的 JSON？

`data/stocks.json`、`data/scenarios.json`、`data/valuation_history.json`、`reports/*.md` 等旧数据文件仍保留供回溯。新站只读取 Markdown 和独立的 `data/market_quotes.json`，不读取旧行情 JSON 或其他模型。每天收盘后刷新的是**市场收盘价和基准估值差幅**，不是每日重新预测公司净利润、PE 或 DCF。

## 修改研究数据

1. 编辑 `sources/AI投研_公司估值情景汇总.md`。
2. 在「一、估值总表」增加完整记录，包含公司、证券代码、行业、市场、价格基准日、历史参考价、估值年份、悲观/基准/乐观估值、估值方法与最近更新。
3. 在「二、分公司假设」增加同一代码的 `### N. 公司名称（证券代码）` 小节，至少包括 `#### 三情景参数与估值结果` 及规范的四列表格；可继续添加模型口径、反向估值、投资逻辑、核验事项、来源链接及计算说明。
4. 按行业分组、行业内研究最近更新日期倒序排列；缺少完整三情景的公司不应提前添加为占位内容。
5. 推送到 `main`，GitHub Actions 会执行 Python 文档校验和 Node 浏览器渲染冒烟测试后发布到 GitHub Pages。

**原始聊天链接**：只有 Markdown 中真的提供了可访问的分享 URL，才会在网页展示为链接。已有的 GitHub 历史摘要与原聊天不应混同。

## 本地预览

```bash
python3 -m http.server 8000
# 浏览 http://localhost:8000
```

浏览器通常会拦截 `file://` 下读取 Markdown 的请求，因此不要直接双击 `index.html`。构建/验证：

```bash
python3 -m unittest discover -s tests -v
node --check assets/research.js
node tests/smoke_research.js
python3 scripts/build_site.py
```

## 当前目录结构

```text
index.html                     网站入口
assets/research.js             Markdown 解析、路由和界面渲染
assets/research.css            页面布局、主题及移动端适配
sources/AI投研_公司估值情景汇总.md 唯一研究主数据源
tests/smoke_research.js        无第三方依赖的页面数据/渲染测试
tests/test_markdown_valuations.py Markdown 结构与内容校验
scripts/build_site.py         只发布新版静态资源与 sources
.github/workflows/pages.yml   GitHub Pages 自动发布
```

旧版 `assets/app.js`、`assets/master.js`、`assets/styles.css` 和其他结构化数据文件留在 Git 历史和仓库中，但不会被 v3 页面加载。

**研究边界**：本网站保留旧聊天中的独立历史情景，不是最新证券研报、券商一致目标价或确定的买卖建议。研究时间和股价基准日是不同概念。重要投资决策前需重新核实公告、财报和财务假设。


## v3.1 · 最新收盘价与低估发现

1. **行情清单自动同步**：`scripts/update_market_quotes.py` 直接读取 Markdown 总表，生成覆盖全部证券的 `data/market_quotes.json`；A股沪市映射 Yahoo `.SS`，深市 `.SZ`，港股删除前导零映射 `.HK`。
2. **每日收盘后更新**：`.github/workflows/quotes.yml` 计划在北京时间工作日 **18:30** 和 **21:30** 尝试更新行情，使用非官方 Yahoo Finance / yfinance 数据源。两次执行是首次及重试，并不保证数据供应商当日提供所有证券。
3. **行情和模型分层**：实时展示的是“最近有效交易日收盘价”，**不是实时盘口价**。最新价有独立日期与来源；原 Markdown 历史参考价永久保留。刷新行情后网站会自动重新部署。
4. **低估发现 `#/opportunities`**：默认展示最新有效收盘价相对**基准估值区间中点**的涨跌幅：`(当前价 / ((基准下沿 + 基准上沿) / 2) - 1) × 100%`。负值**绿色**表示低于基准价，正值**红色**表示高于基准价，按比例从低到高排序；不再把基准下沿折价率当作显示指标。
5. **信号分类仍独立**：仅当价格低于基准估值区间的下沿才进入“跌破下沿”观察，低于下沿10%以上为重点核验；该条件不等于上面的区间中点涨跌幅。
6. **信号保守处理**：收盘快照超过 **5 个日历日**、日期错误或缺数据时不生成低估结论；估值研究距今超过 **60 个日历日**，只能显示“历史模型折价，需重估”，不能当作重点观察。无数据时显示空缺，不填假行情。
7. **时效边界**：A/H 长假、Yahoo 接口延迟或停用、股票停牌均可能导致无法及时更新。这个页面属于**研究验证优先级清单，不是买入信号或独立估值模型**。

本地可运行离线测试：`python -m unittest discover -s tests -v` 以及 `node tests/smoke_research.js`。

## 2026-10-22 收盘行情补录与比率颜色更新

- 补齐此前空缺的5只证券截至2026-10-21可复核的收盘价（华友钴业、源杰科技、生益科技、三环集团、麦格米特）。2026-10-22当天收盘价若行情源已提供，由CI刷新并覆盖；每条股票独立显示真实的 `closeDate`。
- 低估发现的表头调整为：最新有效收盘价 / 基准价（区间中点） / 相对基准价。绿负红正，排序从最低比例到最高比例。
- Push 触发的 Pages workflow 会先尝试重新抓取所有Markdown公司最近有效收盘价，并将更新写回 `data/market_quotes.json`，再构建、部署；原计划任务仍在工作日18:30和21:30尝试刷新。
