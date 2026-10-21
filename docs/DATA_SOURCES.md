# 数据与来源规范

## 研究与估值数据
- stocks.json 按证券代码区分 A / H，包含收盘价、closeDate、币种及 closeSource，不把交易日收盘价写成盘中实时价。
- scenarios.json 记录此前聊天可恢复的历史估值区间：bearLow/bearHigh、baseLow/baseHigh、bullLow/bullHigh。字段可为空表示未找回；status=historical 为历史模型，status=partial 表示仅找到部分历史结果。sourceType=prior_chat_reconstruction 表示对话检索摘要重建，**不等于原文的完整再现**。
- brokers.json 保存机构、证券代码、目标价、评级、日期、来源 URL、origin。只有原文 URL 不代表已经实质核验。
- consensus.json 为富途接口返回的一致预期，不能与自己的三情景估值混同。
- valuation_history.json 存放其他时间/条件的独立模型。reports.json 是研究索引，reports/*.md 是从历史对话的可恢复摘要编写的研究笔记，并非完整历史 ChatGPT 原文。

## 初始收盘快照（历史基线，最新看 data/stocks.json）
证券 | 价格 | 原币 | 来源
---|---:|---|---
601899.SH | 29.92 | CNY | https://cn.investing.com/equities/zijin-mining-historical-data
2899.HK | 31.96 | HKD | https://cn.investing.com/equities/zijin-mining-group-historical-data
2259.HK | 148.40 | HKD | https://cn.investing.com/equities/zijin-gold-international-historical-data
2099.HK | 214.00 | HKD | https://ca.investing.com/equities/china-gold-international-res.-corp-historical-data?cid=990854

## 更新逻辑
GitHub Actions 尝试于北京时间每个工作日 18:30 与 21:30 各执行一次更新，依赖非官方 yfinance 日 K。每次执行完成后，**在同一个工作流中部署 GitHub Pages**，避免 GITHUB_TOKEN 自动提交不能触发其他 push 工作流的问题。GitHub 定时执行可能延迟或被跳过；服务失败、没有有效新日期或出现异常值时跳过更新并保留原价和日期。并不保证每个交易日都成功或与交易所官方收盘价完全一致，正式交易用途应额外核实。

## 券商信息获取
- 富途官方 API: https://openapi.futunn.com/futu-api-doc/en/quote/get-research-analyst-consensus.html
- 富途逐机构评级: https://openapi.futunn.com/futu-api-doc/en/quote/get-research-rating-summary.html
- 东方财富研究入口: https://data.eastmoney.com/report/stock.jshtml
- 公开市场报告不等于可直接复制 PDF。请遵守数据和著作权许可。

富途 OpenD 需要用户自行在本地授权，脚本不向 GitHub 保存账号凭据。SDK 返回格式可能随版本变化，接入时须实际调试。

## 历史独立模型与新研究
在发布正式估值之前，需补齐金铜价格、权益产量、AISC/成本、资本支出、少数股东权益、债务、股本、汇率与适用 PE/NAV 估值框架，同时记录模型时间、失效条件与原始证据。

## 2026-10-21 清理与迁移记录
- 原始虚构三情景样例已删除，所有已恢复数值均注明对应的旧研究日期。未确认完整模型的留空，不用虚构“基准价”填补。
- 旧浏览器中的 alpha-atlas-edits-v1 不再被载入，改用 alpha-atlas-edits-v2。新的用户个人试算不会修改研究历史档案。
- 新加入六只证券的 close、closeDate、closeSource 初始为 null，行情脚本下次成功查询后写回。页面明确显示“待抓取”。
- 对于历史旧文中混用的股价与目标价，重新分类为参考收盘、历史独立模型、条件模型或券商目标价；不确定的部分不展示在正式三情景。
- 历史聊天的完整原文与附件未批量获得，因此文档统一标明“检索摘要重建”，细节仍待核查。
