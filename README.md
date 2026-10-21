# Alpha Atlas · AI 投研工作台

以 **[AI投研_公司估值情景汇总.md](sources/AI投研_公司估值情景汇总.md)** 为唯一研究内容来源的静态 GitHub Pages 网站。

**在线访问：** https://moliq1.github.io/ai-investment-research/

## v3 页面设计

- **研究总览**：文档中的研究公司数量、行业、三档情景数量、最近研究日期，以及最近研究与行业浏览。
- **公司估值库**：按 Markdown 原始行业分组与研究日期排列；支持公司/代码搜索、A/港股筛选、卡片与表格切换。
- **公司深度页**：每公司单独路由 `#/company/02099.HK`，可直接分享；完整展示三情景估值、参考价、独立区间图、原文参数表、模型补充说明、反向估值、原文逻辑、核验节点、研究来源与计算附注。
- **方法与变更记录**：展示 Markdown 文档中的免责声明、收录标准及历史变更记录。
- **移动端**：自适应导航与横向滚动参数表；无需外部框架/CDN/账号。

**数据口径**：所有公司、证券代码、行业、历史参考价、研究时间、价格区间、经营参数、原始逻辑、核验节点和来源均实时读取仓库的同一份 Markdown。网页仅计算各情景与**原始历史参考价**之间的百分比差幅，以及用于同一公司内部对照的图形刻度；不会编造现价、预测利润或未公开的来源链接。

### 为什么不用原来的 JSON？

`data/stocks.json`、`data/scenarios.json`、`data/valuation_history.json`、`reports/*.md` 等文件仍保留于仓库，供旧版本回溯；**v3 网页不读取这些数据文件**。原有每日行情采集流程保留，但其输出不进入 v3 网站，避免自动刷新行情污染历史模型价格基准。

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
