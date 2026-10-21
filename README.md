# Alpha Atlas · AI 投研估值与研报库

GitHub Pages 静态研究站点，先覆盖紫金矿业 A/H（601899.SH / 02899.HK）、紫金黄金国际（02259.HK）、中国黄金国际（02099.HK）。

在线地址（已启用 GitHub Pages）：https://moliq1.github.io/ai-investment-research/

## 功能
- 研究总览：逐证券展示日期、货币及收盘价来源。
- 三情景估值：悲观、基准、乐观价格可编辑，自动计算相对最近收盘价的潜在空间。
- 目标价记录：支持机构、评级、目标价、日期及来源链接。初始机构记录为空，不伪造券商观点。
- 原创研报库：初始 3 份研究提纲，后续将完整研报整理成独立 Markdown。
- 富途 OpenD 导入脚本、Yahoo 非官方行情的收盘价更新脚本、GitHub Actions 每工作日刷新与自动部署。

**数据状态：** 2026-10-16 收盘快照附来源；所有情景价格是 DEMO，不代表正式合理价值；富途真实机构数据尚未连接、验证。市场数据延迟与覆盖度取决于上游服务。

## 本地运行
```bash
python3 -m http.server 8000
# 在浏览器中访问 http://localhost:8000
```
不要直接双击 index.html；浏览器会阻止 file:// 读取 JSON。

## 发布
仓库 Settings → Pages → Build and deployment → Source 已选择 **GitHub Actions**。代码变更由 .github/workflows/pages.yml 发布；收盘价则由 .github/workflows/quotes.yml 于北京时间工作日 18:30 和 21:30 尝试更新，并在同一个工作流中重新部署网站（GitHub Actions 定时可能延迟或跳过）。如行情更新失败，页面保留以前的收盘价及日期，不会伪装为最新实时值。

## 数据同步
浏览器里修改的模型和机构数据仅保存在 localStorage，右上角可以导出 JSON；它不会自动写入 GitHub。若要更新共享数据，需要提交 data/*.json 到仓库。

```bash
pip install -r requirements.txt
python scripts/update_prices.py

# 仅在你自己的电脑运行本地 OpenD，并按富途官方 SDK 安装说明配置：
# pip install futu-api
python scripts/import_futu.py --host 127.0.0.1 --port 11111
```

富途目标价实际可否返回与 OpenD 连接、账号权限、证券覆盖有关，代码是导入适配层，并不表示当前已获得完整数据。

## 数据目录
- data/stocks.json：逐证券最后一个收盘快照。
- data/scenarios.json：演示性三情景估值。
- data/brokers.json、data/consensus.json：真实机构数据待导入。
- reports/*.md：原创研究提纲，后续按版本迭代。
- docs/DATA_SOURCES.md：数据定义与限制。

**安全与版权：** 请勿将账户持仓、交易流水、密钥、个人账户数据放入公开仓库。未获授权的付费券商 PDF 仅保存合法来源链接，不复制原文。非投资建议。
