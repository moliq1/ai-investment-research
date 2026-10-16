# 数据与来源规范

## 研究与估值数据
- stocks.json 按证券代码区分 A / H，包含收盘价、closeDate、币种及 closeSource，不把交易日收盘价写成盘中实时价。
- scenarios.json 记录悲观、基准、乐观假设，status=demo 一律解释为**演示数据而非合理价值**。
- brokers.json 保存机构、证券代码、目标价、评级、日期、来源 URL、origin。只有原文 URL 不代表已经实质核验。
- consensus.json 为富途接口返回的一致预期，不能与自己的三情景估值混同。
- reports.json 是研究档案索引，reports/*.md 是原创研究提纲，尚未迁移历史 ChatGPT 完整文章。

## 2026-10-16 收盘快照
证券 | 价格 | 原币 | 来源
---|---:|---|---
601899.SH | 29.92 | CNY | https://cn.investing.com/equities/zijin-mining-historical-data
2899.HK | 31.96 | HKD | https://cn.investing.com/equities/zijin-mining-group-historical-data
2259.HK | 148.40 | HKD | https://cn.investing.com/equities/zijin-gold-international-historical-data
2099.HK | 214.00 | HKD | https://ca.investing.com/equities/china-gold-international-res.-corp-historical-data?cid=990854

## 更新逻辑
GitHub Actions 尝试于北京时间每个工作日 18:00 执行一次更新，依赖非官方 yfinance 日 K。服务失败、没有有效新日期或出现异常值时跳过更新并保留原价和日期。并不保证每个交易日均成功或一定与官方交易所收盘价一致；正式交易用途应额外核实。

## 券商信息获取
- 富途官方 API: https://openapi.futunn.com/futu-api-doc/en/quote/get-research-analyst-consensus.html
- 富途逐机构评级: https://openapi.futunn.com/futu-api-doc/en/quote/get-research-rating-summary.html
- 东方财富研究入口: https://data.eastmoney.com/report/stock.jshtml
- 公开市场报告不等于可直接复制 PDF。请遵守数据和著作权许可。

富途 OpenD 需要用户自行在本地授权，脚本不向 GitHub 保存账号凭据。SDK 返回格式可能随版本变化，接入时须实际调试。

## 从演示到正式估值
在发布正式估值之前，需补齐金铜价格、权益产量、AISC/成本、资本支出、少数股东权益、债务、股本、汇率与适用 PE/NAV 估值框架，同时记录模型时间、失效条件与原始证据。
