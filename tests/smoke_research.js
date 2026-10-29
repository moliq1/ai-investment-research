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

assert.ok(html.includes('id="theme-mode"'));
assert.ok(html.includes('<option value="system">跟随系统</option>'));
assert.ok(html.includes('<option value="light">浅色</option>'));
assert.ok(html.includes('<option value="dark">深色</option>'));
assert.ok(html.indexOf('<script>')<html.indexOf('assets/research.css'),'Theme bootstrap must run before CSS');
const themeSource=(html.match(/<script>([\s\S]*?)<\/script>/)||[])[1];
assert.ok(themeSource,'Theme bootstrap script missing');
const themeCss=fs.readFileSync(path.join(root,'assets','research.css'),'utf8');
assert.ok(themeCss.includes(':root[data-theme="dark"]'))

/* Regression for white detail banners with almost-white text in dark mode. */
assert.match(themeCss,/:root\[data-theme="dark"\] \.company-banner\s*\{[^}]*background:linear-gradient\([^}]*#1d304c[^}]*\)/);
assert.match(themeCss,/:root\[data-theme="dark"\] \.company-banner h1,\s*:root\[data-theme="dark"\] \.banner-reference strong\s*\{color:#f3f7ff\}/);
assert.match(themeCss,/:root\[data-theme="dark"\] \.breadcrumbs b\s*\{color:#dfebfc\}/);
assert.match(themeCss,/:root\[data-theme="dark"\] \.company-industry\s*\{[^}]*background:#304c73;[^}]*color:#bfd7ff/);
;for(const selector of ['.company-tile','.article-section','.scan-table','.range-chart.mini.compact']){
  assert.ok(themeCss.includes(selector),'Dark palette is missing '+selector);
}
function themeHarness(saved,dark,blockStorage=false,legacyMedia=false){
  const handlers={};
  const mediaHandlers={};
  const root={dataset:{},style:{}};
  const select={value:'system',addEventListener:(event,handler)=>handlers[event]=handler};
  const meta={content:null,setAttribute:(name,value)=>{if(name==='content')meta.content=value}};
  const store={
    value:saved,
    getItem(){if(blockStorage)throw Error('Storage unavailable');return this.value},
    setItem(key,value){if(blockStorage)throw Error('Storage unavailable');this.value=value},
  };
  const media={matches:dark,addEventListener:(event,handler)=>mediaHandlers[event]=handler,
    addListener(handler){mediaHandlers.change=handler}};
  const doc={
    documentElement:root,
    querySelector:query=>query==='meta[name="theme-color"]'?meta:null,
    getElementById:id=>id==='theme-mode'?select:null,
    addEventListener:(event,handler)=>handlers[event]=handler,
  };
  const win={localStorage:store,matchMedia:query=>{
    assert.equal(query,'(prefers-color-scheme: dark)');
    if(legacyMedia)media.addEventListener=undefined;
    return media;
  }};
  vm.runInNewContext(themeSource,{window:win,document:doc});
  assert.equal(typeof win.AtlasTheme.getMode,'function');
  handlers.DOMContentLoaded();
  return {window:win,root,media,meta,store,select,handlers,mediaHandlers};
}
const following=themeHarness(null,true);
assert.equal(following.window.AtlasTheme.getMode(),'system');
assert.equal(following.root.dataset.theme,'dark');
assert.equal(following.meta.content,'#0d1524');
following.media.matches=false;following.mediaHandlers.change();
assert.equal(following.root.dataset.theme,'light','System changes should apply automatically');
following.select.value='dark';following.handlers.change();
assert.equal(following.store.value,'dark','Manual mode must persist');
assert.equal(following.root.dataset.theme,'dark');
following.media.matches=false;following.mediaHandlers.change();
assert.equal(following.root.dataset.theme,'dark','Manual mode must override system events');
following.select.value='system';following.handlers.change();
assert.equal(following.root.dataset.theme,'light','Switching back to system should re-enable matching');
const savedLight=themeHarness('light',true);
assert.equal(savedLight.root.dataset.theme,'light','Saved preference must win on reload');
assert.equal(savedLight.select.value,'light');
const inaccessible=themeHarness(null,true,true,true);
assert.equal(inaccessible.root.dataset.theme,'dark','Unavailable storage must not break initial theme');
inaccessible.select.value='light';inaccessible.handlers.change();
assert.equal(inaccessible.root.dataset.theme,'light','Unavailable storage must not break manual switch');
inaccessible.select.value='system';inaccessible.handlers.change();
inaccessible.media.matches=true;inaccessible.mediaHandlers.change();
assert.equal(inaccessible.root.dataset.theme,'dark','Legacy media listener should still work');

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
const detailPreview=app.detail(data,data.items.find(x=>x.code==='000426.SZ'));
assert.ok(detailPreview.includes('class="company-banner"'),'Company detail must include a themed banner');
assert.ok(detailPreview.includes('class="banner-reference"'),'Detail price must use the themed contrast rules');

const tableRows=markdown.split(/\r?\n/).filter(line=>/^\|\s*[^|]+\s*\|\s*\d{5,6}\.(?:HK|SH|SZ)\s*\|/.test(line));
assert.equal(data.items.length,tableRows.length);
assert.ok(data.items.length>=12);
assert.ok(data.items.some(x=>x.code==='601899.SH'),'Zijin A stock missing');
assert.ok(data.items.some(x=>x.code==='02899.HK'),'Zijin H stock missing');
assert.equal(data.sectors.length,new Set(data.items.map(x=>x.sector)).size);
assert.ok(data.sectors.includes('计算机与AI基础设施'));
assert.ok(data.items.some(x=>x.code==='00992.HK'),'Lenovo first coverage missing');
assert.ok(data.items.some(x=>x.code==='000426.SZ'),'Xingye Silver & Tin first coverage missing');
assert.equal(data.version,(markdown.match(/文档版本\*\*：(v\d+\.\d+)/)||[])[1]);
assert.equal(new Set(data.items.map(x=>x.code)).size,data.items.length);
const cgi=data.items.find(x=>x.code==='02099.HK');
assert.ok(cgi,'China Gold International record must remain intact');
assert.equal(cgi.reference,201.60);
assert.equal(cgi.base.low,189);
assert.equal(cgi.base.high,220);
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
assert.ok(Math.abs(app.benchmarkInfo(centered,120).relative-(-20))<1e-9);
assert.ok(Math.abs(app.benchmarkInfo(centered,180).relative-20)<1e-9);
assert.equal(app.benchmarkInfo(centered,150).relative,0);
const radarHtml=app.opportunities(data);
assert.ok(radarHtml.includes('基准价（区间中点）'));
assert.ok(radarHtml.includes('相对基准价'));
assert.equal(app.ratioClass(-20),'ratio-negative');
assert.equal(app.ratioClass(20),'ratio-positive');
assert.equal(app.ratioClass(0),'ratio-zero');
assert.equal(app.ratioClass(null),'ratio-unknown');
assert.ok(radarHtml.includes('绿色')&&radarHtml.includes('红色'));

// Cards use two-tier scenario rows: each track spans the full card width.
const sectorPage=app.catalog(data,data.sectors[0]);
assert.ok(sectorPage.includes('三情景估值区间'));
const stylesheet=fs.readFileSync(path.join(root,'assets','research.css'),'utf8');
assert.ok(stylesheet.includes('.range-chart.mini.compact .bar-track{display:block;width:100%'));
assert.ok(stylesheet.includes('.range-chart.mini.compact .scenario-row{display:flex;flex-direction:column'))
assert.ok(stylesheet.includes('.scenario-row{display:flex;flex-direction:column;align-items:stretch;'),'The chart row must not inherit align-items:center from the shared detail chart');
assert.ok(stylesheet.includes('.scenario-row-head{position:relative;width:100%;align-self:stretch;'),'The caption head must use the same coordinate width as its full-width price track');
;
assert.ok(!stylesheet.includes('grid-template-columns:38px minmax(0,1fr) 128px;'));
// Card titles always open Tonghuashun; HK stockpage symbols have >=4 digits.
const aLink=app.marketPage({code:'600183.SH'});
assert.equal(aLink,'https://stockpage.10jqka.com.cn/600183/');
assert.equal(app.marketPage({code:'000807.SZ'}),'https://stockpage.10jqka.com.cn/000807/');
const hkMarketPage=code=>'https://stockpage.10jqka.com.cn/HK'+String(Number(code)).padStart(4,'0')+'/';
for(const code of ['00522','00992','02099','02899','00005','10000']){
  assert.equal(app.marketPage({code:code+'.HK'}),hkMarketPage(code));
}
assert.equal(app.marketPage({code:'00522.HK'}),'https://stockpage.10jqka.com.cn/HK0522/');
assert.equal(app.marketPage({code:'00992.HK'}),'https://stockpage.10jqka.com.cn/HK0992/');
assert.equal(app.marketPage({code:'bad'}),null);
const pct={valid:true,close:101.23,previousClose:100};
assert.ok(Math.abs(app.quoteDailyChange(pct)-1.23)<1e-8);
assert.ok(Math.abs(app.quoteDailyChange({valid:true,close:98,previousClose:100})+2)<1e-8);
assert.equal(app.quoteDailyChange({valid:true,close:100}),null);
assert.equal(app.quoteDailyChange({valid:false,close:98,previousClose:100}),null);
const modelCompany=data.items.find(x=>x.code==='02099.HK');
const negativeCard=app.companyTile(modelCompany,{close:180,closeDate:'2026-10-22',valid:true});
const positiveCard=app.companyTile(modelCompany,{close:250,closeDate:'2026-10-22',valid:true});
const missingCard=app.companyTile(modelCompany,null);
assert.ok(negativeCard.includes('class="tile-card-head"'));
assert.ok(negativeCard.indexOf('class="tile-quote"')<negativeCard.indexOf('class="tile-visual"'));
assert.ok(negativeCard.includes('class="tile-quote-price">HK$180</strong>'));
assert.ok(negativeCard.includes('href="https://stockpage.10jqka.com.cn/HK2099/"'));
assert.ok(negativeCard.includes('target="_blank" rel="noopener noreferrer"'));
assert.ok(negativeCard.includes('同花顺行情'));
for(const code of ['00522.HK','00992.HK']){
  const item=data.items.find(x=>x.code===code);
  assert.ok(item,'Missing regression ticker: '+code);
  const card=app.companyTile(item,null);
  assert.ok(card.includes('href="'+hkMarketPage(code.slice(0,5))+'"'));
  assert.ok(card.includes('同花顺行情'));
}
assert.ok(negativeCard.includes('class="tile-detail-link" href="#/company/02099.HK"'));
assert.ok(negativeCard.startsWith('<article class="company-tile"'));
assert.ok(negativeCard.includes('日涨跌 —'));
assert.ok(negativeCard.includes('2026-10-22'));
assert.ok(positiveCard.includes('class="tile-quote-price">HK$250</strong>'));
assert.equal((negativeCard.match(/class="chart-line scenario-row"/g)||[]).length,3);
assert.equal((negativeCard.match(/class="scenario-row-head align-/g)||[]).length,3);
assert.equal((negativeCard.match(/class="scenario-row-label"/g)||[]).length,3);
const alignedLabels=[...negativeCard.matchAll(/class="scenario-row-head (align-left|align-center|align-right)" style="--label-position:([\d.]+)%"/g)];
assert.deepEqual(Array.from(alignedLabels,m=>m[1]),['align-left','align-center','align-right']);
const axisMax=Math.max(180,modelCompany.bear.high,modelCompany.base.high,modelCompany.bull.high)*1.13;
const expectedLabelPositions=[
  modelCompany.bear.low/axisMax*100,
  (modelCompany.base.low+modelCompany.base.high)/2/axisMax*100,
  modelCompany.bull.high/axisMax*100
];
for(let i=0;i<3;i++)assert.ok(Math.abs(Number(alignedLabels[i][2])-expectedLabelPositions[i])<0.001,'Caption anchors must follow the valuation bands');
assert.ok(stylesheet.includes('.scenario-row-head.align-left .scenario-row-label{left:clamp(0%'));
assert.ok(stylesheet.includes('.scenario-row-head.align-center .scenario-row-label{left:clamp(35%'));
assert.ok(stylesheet.includes('.scenario-row-head.align-right .scenario-row-label{right:clamp(0%'));
assert.ok(stylesheet.includes(':root[data-theme="dark"] .company-tile .range-chart.mini.compact .scenario-row-label>strong'));
for(const label of ['悲观','基准','乐观'])assert.ok(negativeCard.includes(label));
assert.ok(negativeCard.includes('竖线：最新有效收盘 HK$180（2026-10-22）'));
assert.ok(positiveCard.includes('竖线：最新有效收盘 HK$250（2026-10-22）'));
const marks=[...negativeCard.matchAll(/class="ref-rule" style="left:([^%]+)%"/g)].map(x=>Number(x[1]));
assert.equal(marks.length,3);
assert.ok(marks.every(m=>m===marks[0]),'Every track must use exactly the same reference coordinate');
assert.notEqual(marks[0],Number(positiveCard.match(/class="ref-rule" style="left:([^%]+)%"/)[1]));
assert.ok(missingCard.includes('class="tile-quote-price is-missing">—</strong>'));
assert.ok(missingCard.includes('竖线：历史参考价 HK$201.6'));
assert.ok(missingCard.includes('无有效收盘价'));
assert.ok(!negativeCard.includes('BASE / 基准估值区间'));
assert.ok(!negativeCard.includes('基准价（区间中点）'));
assert.ok(!negativeCard.includes('tile-benchmark'));
assert.ok(negativeCard.includes('HK$'+modelCompany.base.low));
const detailGraph=app.graph(modelCompany,false,{valid:true,close:180,closeDate:'2026-10-22'});
assert.ok(detailGraph.includes('SCENARIO MAP'));
assert.ok(!detailGraph.includes('scenario-row-head'),'The full-size detail chart is unchanged');
assert.ok(!detailGraph.includes('scenario-row-label'),'Detail chart must retain its original layout');
const shengyi=data.items.find(x=>x.code==='600183.SH');
const shengyiCard=app.companyTile(shengyi,{valid:true,close:75,closeDate:'2026-10-26',previousClose:72});
assert.ok(shengyiCard.includes('href="https://stockpage.10jqka.com.cn/600183/"'));
assert.ok(shengyiCard.includes('日涨跌 +4.17%'));
const downCard=app.companyTile(shengyi,{valid:true,close:70,closeDate:'2026-10-26',previousClose:72});
assert.ok(downCard.includes('tile-day-change down'));
assert.ok(downCard.includes('日涨跌 -2.78%'));
const aStock=data.items.find(x=>x.code==='601899.SH');
assert.ok(app.companyTile(aStock,null).includes('¥ / 股'));

// Regression: Array.map must not pass its index as companyTile's quote parameter.
// In the live catalogue the header, marker and caption must use ONE quote.
assert.match(script,/group\.map\(item=>companyTile\(item\)\)/);
assert.doesNotMatch(script,/group\.map\(companyTile\)/);
const withLiveQuote=script.replace('window.AtlasResearch={',
  "state.quotes.set('02099.HK',{valid:true,close:183.2,closeDate:'2026-10-23',previousClose:181});window.AtlasResearch={");
assert.notEqual(withLiveQuote,script,'Unable to inject regression quote');
const liveWindow={addEventListener:()=>{},location:{hash:'#/companies'}};
vm.runInNewContext(withLiveQuote,{
  window:liveWindow,document,fetch:()=>new Promise(()=>{}),console,location:liveWindow.location
});
const liveApp=liveWindow.AtlasResearch;
const liveCatalog=liveApp.catalog(data,modelCompany.sector);
const cardPath='href="#/company/02099.HK"';
const cardAt=liveCatalog.indexOf(cardPath);
assert.ok(cardAt>=0,'Live China Gold International card missing');
const liveCard=liveCatalog.slice(liveCatalog.lastIndexOf('<article class="company-tile"',cardAt),liveCatalog.indexOf('</article>',cardAt)+10);
assert.ok(liveCard.includes('class="tile-quote-price">HK$183.2</strong>'),'Header must show actual valid close');
assert.ok(liveCard.includes('竖线：最新有效收盘 HK$183.2（2026-10-23）'),'Chart and header must share the quote');
assert.ok(liveCard.includes('日涨跌 +1.22%'),'Daily change must match the displayed close and prior close');
assert.ok(!liveCard.includes('竖线：历史参考价'),'Live card must not silently use historical quote');
const markerOffsets=[...liveCard.matchAll(/class="ref-rule" style="left:([^%]+)%"/g)].map(m=>Number(m[1]));
assert.equal(markerOffsets.length,3);
assert.ok(markerOffsets.every(x=>x===markerOffsets[0]),'Scenario reference lines must remain aligned');
const baseBand=liveCard.match(/class="value-band base" style="left:([^%]+)%/);
assert.ok(baseBand,'Base valuation range missing');
assert.ok(markerOffsets[0]<Number(baseBand[1]),'HK$183.2 must plot LEFT of HK$189 base lower bound');
const explicitMissing=liveApp.companyTile(modelCompany,null);
assert.ok(explicitMissing.includes('class="tile-quote-price is-missing">—</strong>'));
assert.ok(explicitMissing.includes('竖线：历史参考价 HK$201.6'));
assert.ok(!explicitMissing.includes('class="tile-quote-price">HK$183.2</strong>'),'A missing quote must not leak a different source into header');
