#!/usr/bin/env node
/* Dependency-free smoke test for the GitHub Pages Markdown research UI. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const markdown=fs.readFileSync(path.join(root,'sources','AI投研_公司估值情景汇总.md'),'utf8');
const script=fs.readFileSync(path.join(root,'assets','research.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert.match(html,/assets\/research\.js/);
assert.match(html,/assets\/research\.css/);
assert.doesNotMatch(html,/assets\/app\.js|assets\/master\.js/);
assert.match(script,/const MD='sources\/AI投研_公司估值情景汇总\.md'/);
assert.match(script,/data\/market_quotes\.json/);
assert.doesNotMatch(script,/fetch\(['"]data\/stocks/);
const fake={innerHTML:'',textContent:''};
const document={getElementById:()=>fake,addEventListener:()=>{},querySelectorAll:()=>[]};
const window={addEventListener:()=>{},location:{hash:'#/overview'}};
vm.runInNewContext(script,{window,document,fetch:()=>new Promise(()=>{}),console,location:window.location});
const app=window.AtlasResearch;
assert.ok(app,'The UI parser must be exposed for validation');
const data=app.parseMarkdown(markdown);
assert.equal(data.items.length,12);
assert.equal(data.sectors.length,4);
assert.equal(data.version,'v2.2');
assert.equal(new Set(data.items.map(x=>x.code)).size,data.items.length);
const first=data.items[0];
assert.equal(first.code,'02099.HK');
assert.equal(first.reference,201.60);
assert.equal(first.base.low,189);
assert.equal(first.base.high,220);
for(const entry of data.items){
  assert.ok(entry.assumptionNotes!=null);
  assert.ok(entry.params.length>=6,entry.code+' lost model parameters');
  assert.ok(entry.logic.length>30,entry.code+' lost investment logic');
  assert.ok(entry.validation.length>30,entry.code+' lost evidence checklist');
  assert.ok(entry.sources.includes('原研究对话'),entry.code+' lost provenance');
  const detail=app.detail(data,entry);
  assert.ok(detail.includes(entry.name)&&detail.includes(entry.code));
  assert.ok(detail.includes('核心估值逻辑')&&detail.includes('核验节点'));
  assert.ok(detail.includes('原始记录'));
  assert.ok(detail.includes(entry.referenceText));
  assert.ok(detail.includes('Markdown'));
  const graph=app.graph(entry);
  assert.ok(graph.includes(entry.referenceText));
}
const catalog=app.catalog(data);
for(const x of data.items)assert.ok(catalog.includes(x.name),'Missing company in catalog: '+x.name);
assert.ok(app.overview(data).includes(data.items[0].name));
assert.ok(app.renderMarkdown('**加粗** [参考](https://example.com/)').includes('href="https://example.com/"'));
assert.ok(!app.renderMarkdown('<script>alert(1)</script>').includes('<script>'));
console.log('Research website smoke PASS: '+data.items.length+' companies, '+data.sectors.length+' sectors, '+data.version);

// Quote fixtures: fresh, stale, missing, and future candles must remain distinct.
const fixture={schemaVersion:1,quotes:[{code:'02099.HK',currency:'HK$',close:180,closeDate:'2026-10-21',sourceUrl:'https://finance.yahoo.com/quote/2099.HK/history/'},{code:'300274.SZ',currency:'¥',close:90,closeDate:'2026-08-01'}]};
const date=Date.parse('2026-10-22T14:00:00Z');
const quotes=app.parseQuotes(fixture,data,date);
assert.equal(quotes.get('02099.HK').valid,true);
assert.equal(quotes.get('300274.SZ').valid,false);
assert.equal(app.dayAge('2030-01-01',date)<0,true);
assert.ok(app.opportunities(data).includes('低估发现'));

// Signed comparison uses the MIDPOINT of the base valuation, not its lower bound.
const centered={base:{low:100,high:200}};
assert.equal(app.benchmarkInfo(centered,120).baseline,150);
assert.equal(app.benchmarkInfo(centered,120).relative,-20);
assert.equal(app.benchmarkInfo(centered,180).relative,20);
assert.equal(app.benchmarkInfo(centered,150).relative,0);
const radarHtml=app.opportunities(data);
assert.ok(radarHtml.includes('基准价（区间中点）'));
assert.ok(radarHtml.includes('相对基准价'));
assert.equal(app.ratioClass(-20),'ratio-negative');
assert.equal(app.ratioClass(20),'ratio-positive');
assert.equal(app.ratioClass(0),'ratio-zero');
assert.equal(app.ratioClass(null),'ratio-unknown');
assert.ok(radarHtml.includes('绿色')&&radarHtml.includes('红色'));
