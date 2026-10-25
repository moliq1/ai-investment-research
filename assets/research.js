/* Alpha Atlas v3 — website content is rendered solely from Markdown. */
(() => {
'use strict';
const MD='sources/AI投研_公司估值情景汇总.md';
const MARKET='data/market_quotes.json';
const QUOTE_MAX_AGE=5;
const MODEL_REVIEW_AGE=60;
const REPO='https://github.com/moliq1/ai-investment-research';
const ORIGINAL=REPO+'/blob/main/sources/AI%E6%8A%95%E7%A0%94_%E5%85%AC%E5%8F%B8%E4%BC%B0%E5%80%BC%E6%83%85%E6%99%AF%E6%B1%87%E6%80%BB.md';
const $=id=>document.getElementById(id);
const safe=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plain=s=>String(s||'').replace(/\*\*/g,'').trim();
const cells=s=>s.split('|').slice(1,-1).map(plain);
const isDivider=s=>/^\|[\s|:-]+\|?\s*$/.test(s);
const number=s=>{const m=plain(s).replace(/,/g,'').match(/\d+(?:\.\d+)?/);return m?Number(m[0]):null};
const interval=s=>{const m=plain(s).replace(/,/g,'').match(/\d+(?:\.\d+)?/g);return m?{low:Number(m[0]),high:Number(m[1]||m[0])}:null};
const format=n=>Number(n).toLocaleString('zh-CN',{maximumFractionDigits:2});
const pct=(a,b)=>(a/b-1)*100;
const percent=p=>(p>0?'+':'')+p.toFixed(1)+'%';
const rangeText=(s,key)=>s.currency+format(s[key].low)+(s[key].low===s[key].high?'':' – '+format(s[key].high));
const dayAge=(day,now=Date.now())=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day||''))return Infinity;
 const dt=Date.parse(day+'T00:00:00Z');return Number.isFinite(dt)?Math.floor((now-dt)/86400000):Infinity;
};
function parseQuotes(json,master,now=Date.now()){
 if(!json||json.schemaVersion!==1||!Array.isArray(json.quotes))throw Error('行情文件格式错误');
 const quotes=new Map(),known=new Map(master.items.map(x=>[x.code,x]));
 for(const q of json.quotes){
   const stock=known.get(q.code);if(!stock)continue;
   if(quotes.has(q.code))throw Error('重复行情：'+q.code);
   if(q.currency!==stock.currency)continue;
   const age=dayAge(q.closeDate,now);
   if(q.close==null||!Number.isFinite(Number(q.close))||Number(q.close)<=0||!Number.isFinite(age)){
     quotes.set(q.code,{...q,valid:false,close:null,reason:'尚未取得有效收盘价'});continue;
   }
   const valid=age>=0&&age<=QUOTE_MAX_AGE;
   quotes.set(q.code,{...q,valid,age,close:Number(q.close),reason:valid?'有效收盘价':'行情过期'});
 }
 return quotes;
}
function quote(item){return state.quotes.get(item.code)||null}
function quoteFresh(item){const q=quote(item);return q&&q.valid?q:null}
function labelQuote(item){const q=quote(item);return {price:q&&q.valid?item.currency+format(q.close):'—',date:q&&q.closeDate?q.closeDate+(q.valid?'':' · 过期'):'行情未覆盖'} }
function modelOld(item,now=Date.now()){const age=dayAge(item.updated,now);return age<0||age>MODEL_REVIEW_AGE}
function ratioClass(value){return value==null?'ratio-unknown':value<0?'ratio-negative':value>0?'ratio-positive':'ratio-zero'}
function benchmarkInfo(item,price){
 const baseline=(item.base.low+item.base.high)/2;
 if(!Number.isFinite(baseline)||baseline<=0||!Number.isFinite(price)||price<=0)return null;
 return {
   baseline,
   relative:(price/baseline-1)*100,
   // Low-end breach remains a separate, more conservative research signal.
   belowLower:(item.base.low-price)/item.base.low*100
 };
}
function discountInfo(item){
 const q=quoteFresh(item);
 if(!q)return {kind:'missing',relative:null,belowLower:null,reason:'暂无有效收盘价'};
 const benchmark=benchmarkInfo(item,q.close);
 if(!benchmark)return {kind:'missing',relative:null,belowLower:null,reason:'基准价或行情无效'};
 const {relative,belowLower}=benchmark;
 if(belowLower>0&&modelOld(item))return {kind:'archive',relative,belowLower,reason:'低于基准下沿，但历史模型需先复核'};
 if(belowLower>=10)return {kind:'watch',relative,belowLower,reason:'跌破基准下沿10%以上，重点核验'};
 if(belowLower>0)return {kind:'observe',relative,belowLower,reason:'跌破基准下沿，需核验'};
 if(q.close<=item.base.high)return {kind:'inrange',relative,belowLower,reason:'收盘价处于基准估值区间'};
 return {kind:'above',relative,belowLower,reason:'收盘价高于基准估值区间'};
}
const delta=(s,key)=>{const q=quoteFresh(s);if(!q)return '行情缺失或过期';return percent(pct(s[key].low,q.close))+(s[key].low===s[key].high?'':' 至 '+percent(pct(s[key].high,q.close)));};
const encode=s=>encodeURIComponent(s);
const moneySymbol=s=>s.includes('HK$')?'HK$':s.includes('¥')?'¥':'';
const icon=(name)=>{
 const paths={arrow:'M5 12h14m-6-6 6 6-6 6',back:'M19 12H5m6-6-6 6 6 6',search:'M21 21l-5-5m2-6a8 8 0 1 1-16 0 8 8 0 0 1 16 0',clock:'M12 6v6l4 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20',book:'M4 19V5a2 2 0 0 1 2-2h14v17H6a2 2 0 0 0-2 2m0-3a2 2 0 0 1 2-2h14',grid:'M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z',list:'M9 6h12M9 12h12M9 18h12M3 6h2M3 12h2M3 18h2',menu:'M4 7h16M4 12h16M4 17h16',external:'M14 4h6v6m0-6-9 9m9 0v7H4V4h7'};
 return '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="'+(paths[name]||paths.arrow)+'"/></svg>';
};
function inline(text){
 const links=[];
 let s=String(text||'').replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,(_,label,uri)=>{
   const id='ALINK'+links.length+'PLACE';
   links.push('<a href="'+safe(uri)+'" target="_blank" rel="noopener noreferrer">'+safe(label)+' <span aria-hidden="true">↗</span></a>');
   return id;
 });
 s=safe(s).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
 .replace(/\x60([^\x60]+)\x60/g,'<code>$1</code>')
 .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g,'<em>$1</em>');
 return s.replace(/ALINK(\d+)PLACE/g,(_,i)=>links[Number(i)]||'');
}
function renderMarkdown(text){
 const lines=String(text||'').split(/\r?\n/),out=[];
 const block=line=>!line||/^#{1,6} /.test(line)||line.startsWith('|')||/^[-*] /.test(line)||/^\d+[.)、]\s/.test(line)||/^> /.test(line);
 for(let i=0;i<lines.length;){
   let line=lines[i].trim();
   if(!line){i++;continue}
   if(/^#{1,6} /.test(line)){const level=Math.min(4,line.match(/^#+/)[0].length);out.push('<h'+level+'>'+inline(line.replace(/^#+\s+/,''))+'</h'+level+'>');i++;continue}
   if(line.startsWith('|')){const table=[];while(i<lines.length&&lines[i].trim().startsWith('|')){if(!isDivider(lines[i].trim()))table.push(cells(lines[i].trim()));i++}
     if(table.length)out.push('<div class="markdown-table"><table><thead><tr>'+table[0].map(v=>'<th>'+inline(v)+'</th>').join('')+'</tr></thead><tbody>'+table.slice(1).map(row=>'<tr>'+row.map(v=>'<td>'+inline(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>');continue;}
   if(/^[-*] /.test(line)||/^\d+[.)、]\s/.test(line)){const ordered=/^\d+[.)、]\s/.test(line),items=[];while(i<lines.length){const match=lines[i].trim().match(ordered?/^\d+[.)、]\s+(.+)$/:/^[-*] (.+)$/);if(!match)break;items.push('<li>'+inline(match[1])+'</li>');i++}
     out.push('<'+(ordered?'ol':'ul')+'>'+items.join('')+'</'+(ordered?'ol':'ul')+'>');continue;}
   if(/^> /.test(line)){const b=[];while(i<lines.length&&/^> /.test(lines[i].trim())){b.push(lines[i].trim().slice(2));i++}out.push('<blockquote>'+b.map(inline).join(' ')+'</blockquote>');continue}
   const p=[];while(i<lines.length&&!block(lines[i].trim())){p.push(lines[i].trim());i++}
   if(p.length)out.push('<p>'+inline(p.join(' '))+'</p>');else i++;
 }
 return out.join('');
}
function parseMarkdown(text){
 const lines=text.split(/\r?\n/);
 const first=lines.findIndex(l=>/^\|\s*公司\s*\|\s*代码\s*\|\s*行业/.test(l));
 if(first<0)throw Error('估值总表不存在，或缺少“行业”字段');
 const items=[],seen=new Set();
 for(let i=first+1;i<lines.length&&lines[i].trim().startsWith('|');i++){
   if(isDivider(lines[i].trim()))continue;
   const c=cells(lines[i].trim());
   if(c.length!==12)throw Error('估值总表字段数错误：第 '+(i+1)+' 行');
   const key=c[1].replace(/^0+(?=\d)/,'').toUpperCase();
   if(seen.has(key))throw Error('重复证券：'+c[1]);seen.add(key);
   const reference=number(c[5]),bear=interval(c[7]),base=interval(c[8]),bull=interval(c[9]);
   if(!bear||!base||!bull||reference===null)throw Error('不完整研究条目：'+c[1]);
   if(!/^\d{4}-\d{2}-\d{2}$/.test(c[4]))throw Error('参考价日期错误：'+c[1]);
   items.push({name:c[0],code:c[1],key,sector:c[2],market:c[3],closeDate:c[4],reference,referenceText:c[5],currency:moneySymbol(c[5]),horizon:c[6],bear,base,bull,method:c[10],updated:c[11]});
 }
 if(!items.length)throw Error('估值总表没有研究记录');
 // A single company section may serve A/H securities sharing the same underlying business.
 const starts=[...text.matchAll(/^###\s+\d+\.\s+(.+?)（([^）]+)）\s*$/gm)]
   .filter(m=>m[2].split(/\s*\/\s*/).every(code=>/^\d{5,6}\.(?:HK|SH|SZ)$/.test(code.trim())));
 const stop=text.indexOf('\n## 三、');
 for(const item of items){
   const i=starts.findIndex(m=>m[2].split(/\s*\/\s*/).some(code=>code.trim().replace(/^0+(?=\d)/,'').toUpperCase()===item.key));
   if(i<0)throw Error('缺失公司研究正文：'+item.code);
   const start=starts[i].index+starts[i][0].length;
   const until=starts[i+1]?.index??(stop<0?text.length:stop);
   let body=text.slice(start,until).trim();
   // The inter-company industry heading is not part of the preceding company.
   body=body.split(/^### 行业｜/m)[0].trim();
   item.raw=body;
   const headings=[...body.matchAll(/^####\s+(.+)$/gm)];
   item.intro=body.slice(0,headings[0]?.index??body.length).trim();
   item.blocks=headings.map((m,n)=>({title:m[1],raw:body.slice(m.index+m[0].length,headings[n+1]?.index??body.length).trim()}));
   const assumption=item.blocks.find(b=>/三情景参数与估值结果/.test(b.title));
   if(!assumption)throw Error('缺少参数表：'+item.code);
   const al=assumption.raw.split(/\r?\n/),at=al.findIndex(l=>/^\|\s*假设项目/.test(l));
   if(at<0)throw Error('缺少三情景参数表头：'+item.code);
   const vals=[];let after=at+1;
   while(after<al.length&&al[after].trim().startsWith('|')){if(!isDivider(al[after])){const c=cells(al[after]);if(c.length===4)vals.push({name:c[0],bear:c[1],base:c[2],bull:c[3]})}after++}
   item.params=vals;
   item.assumptionNotes=al.slice(0,at).concat(al.slice(after)).join('\n').trim();
   const row=vals.find(v=>/每股估值/.test(v.name) &&
      (!/^[AH] 股/.test(v.name) || v.name.startsWith(item.market==='A股'?'A 股':'H 股')));
   if(row)for(const mode of ['bear','base','bull']){const test=interval(row[mode]);if(test&&(Math.abs(test.low-item[mode].low)>.15||Math.abs(test.high-item[mode].high)>.15))throw Error(item.code+' 详细估值与总表不一致')}
   item.logic=item.blocks.find(b=>/核心估值逻辑/.test(b.title))?.raw||'';
   item.validation=item.blocks.find(b=>/核验节点/.test(b.title))?.raw||'';
   item.reverse=item.blocks.find(b=>/反向估值/.test(b.title))?.raw||'';
   item.sources=item.blocks.find(b=>/原始聊天与研究来源/.test(b.title))?.raw||'';
   item.extras=item.blocks.filter(b=>![assumption].includes(b)&&!/核心估值逻辑|核验节点|反向估值|原始聊天与研究来源/.test(b.title));
 }
 const sectors=[...new Set(items.map(x=>x.sector))];
 const version=(text.match(/文档版本\*\*：([^\s\n]+)/)||[])[1]||'—';
 const changes=text.split(/^## 四、变更记录\s*$/m)[1]?.trim()||'';
 const intro=text.slice(0,text.indexOf('## 一、')).replace(/^# .*\n/,'').replace(/^>\s*/gm,'').trim();
 return {items,sectors,version,changes,intro};
}
const state={db:null,quotes:new Map(),term:'',market:'全部',layout:'cards',opFilter:'all',opSector:'全部'};
const routeCompany=item=>'#/company/'+encode(item.code);
function side(route){
 const d=state.db;
 const sectorLinks=d.sectors.map((s,i)=>'<a href="#/sector/'+encode(s)+'" class="side-item '+(route.type==='sector'&&route.sector===s?'selected':'')+'"><span class="sector-mark">'+['◇','◈','✧','⬡'][i%4]+'</span><span>'+safe(s)+'</span><em>'+d.items.filter(x=>x.sector===s).length+'</em></a>').join('');
 return '<a href="#/overview" class="logo"><span class="logo-box">A<i></i></span><span><b>ALPHA ATLAS</b><small>INVESTMENT RESEARCH</small></span></a><div class="side-overline">INVESTMENT WORKSPACE</div><nav aria-label="网站导航"><span class="nav-caption">研究空间</span>'+
 '<a href="#/overview" class="side-item '+(route.type==='overview'?'selected':'')+'">'+icon('grid')+'<span>研究总览</span></a>'+
 '<a href="#/opportunities" class="side-item '+(route.type==='opportunities'?'selected':'')+'">'+icon('search')+'<span>低估发现</span></a>'+ 
 '<a href="#/companies" class="side-item '+(route.type==='companies'?'selected':'')+'">'+icon('list')+'<span>估值公司库</span><em>'+d.items.length+'</em></a>'+
 '<span class="nav-caption nav-spacer">行业聚合</span>'+sectorLinks+
 '<span class="nav-caption nav-spacer">研究档案</span><a href="#/about" class="side-item '+(route.type==='about'?'selected':'')+'">'+icon('book')+'<span>方法与变更记录</span></a></nav>'+
 '<div class="side-bottom"><div class="status-line"><i></i><div><strong>Markdown · Single Source</strong><small>研究版本 '+safe(d.version)+'</small></div></div><a href="'+ORIGINAL+'" target="_blank" rel="noopener noreferrer">GitHub 估值原文 ↗</a></div>';
}
function info(item){
 const q=quoteFresh(item);if(!q)return '缺少有效最新收盘价 · 不产生信号';
 if(q.close<item.base.low)return modelOld(item)?'历史基准区间折价 · 模型需重估':'低于基准估值下沿 · 待核验';
 if(q.close>item.base.high)return '最新收盘价高于模型基准上沿';
 return '最新收盘价处于基准估值区间';
}
function graph(item,mini=false,quoteOverride=undefined,compact=false){
 const live=quoteOverride===undefined?quoteFresh(item):quoteOverride;
 const ref=live?live.close:item.reference;
 const max=Math.max(ref,item.bear.high,item.base.high,item.bull.high)*1.13;
 const mark=Math.min(99,ref/max*100);
 const rows=['bear','base','bull'].map((k,i)=>{
  const r=item[k],left=r.low/max*100,width=Math.max(.9,(r.high-r.low)/max*100);
  const name='<span class="chart-name"><i class="tiny-dot '+k+'"></i>'+['悲观','基准','乐观'][i]+'</span>';
  const value='<strong>'+safe(rangeText(item,k))+'</strong>';
  const track='<div class="bar-track" aria-hidden="true"><i class="ref-rule" style="left:'+mark+'%"></i><i class="value-band '+k+'" style="left:'+left.toFixed(3)+'%;width:'+width.toFixed(3)+'%"></i></div>';
  return compact?'<div class="chart-line scenario-row"><div class="scenario-row-head">'+name+value+'</div>'+track+'</div>'
   :'<div class="chart-line">'+name+track+value+'</div>';
 }).join('');
 const header=compact?'<h3>三情景估值区间</h3>':'<div><span class="eyebrow">SCENARIO MAP</span><h3>价值区间分布</h3></div>';
 const caption=compact
  ?live?'竖线：最新有效收盘 '+safe(item.currency+format(live.close))+'（'+safe(live.closeDate)+'）'
       :'竖线：历史参考价 '+safe(item.referenceText)+'（'+safe(item.closeDate)+'）· 无有效收盘价'
  :'竖线为 '+(live?'最新有效收盘 '+safe(item.currency+format(live.close))+'（'+safe(live.closeDate)+'）':'Markdown 历史参考价 '+safe(item.referenceText)+'（'+safe(item.closeDate)+'，行情不可用）')+'；仅在同一公司内部按同一价格轴比较。';
 return '<div class="range-chart '+(mini?'mini':'')+(compact?' compact':'')+'"><div class="chart-title">'+header+'<span>'+safe(item.currency)+' / 股</span></div>'+rows+'<p class="graph-caption">'+caption+'</p></div>';
}
function triple(item){
 return '<div class="triple">'+[['bear','悲观情景','BEAR CASE'],['base','基准情景','BASE CASE'],['bull','乐观情景','BULL CASE']].map(([key,label,sub])=>'<div class="case-card '+key+'"><div class="case-label"><b>'+label+'</b><small>'+sub+'</small></div><strong class="case-price">'+safe(rangeText(item,key))+'</strong><div class="case-delta"><span>相对历史参考价</span><b>'+safe(delta(item,key))+'</b></div></div>').join('')+'</div>';
}
function companyTile(item,currentQuote=quoteFresh(item)){
 const q=currentQuote&&currentQuote.valid?currentQuote:null;
 const t=q?{price:item.currency+format(q.close),date:q.closeDate}:labelQuote(item);
 return '<a class="company-tile" href="'+routeCompany(item)+'" data-company data-match="'+safe((item.name+' '+item.code+' '+item.sector).toLowerCase())+'" data-market="'+safe(item.market)+'">'+
 '<div class="tile-card-head"><div class="tile-identity"><span class="tile-sector">'+safe(item.sector)+'</span><h3>'+safe(item.name)+'</h3><p>'+safe(item.code)+' <span>·</span> '+safe(item.horizon)+'</p></div>'+
 '<div class="tile-quote"><span>有效收盘价</span><strong class="tile-quote-price'+(q?'':' is-missing')+'">'+safe(t.price)+'</strong><small>'+safe(t.date)+'</small></div></div>'+
 '<div class="tile-visual">'+graph(item,true,q,true)+'</div>'+
 '<div class="tile-foot"><span>'+safe(item.updated)+' · 研究更新</span><span>研究详情 '+icon('arrow')+'</span></div></a>';
}
function sectionTitle(label,desc=''){return '<div class="section-title"><div><span class="eyebrow">ALPHA ATLAS / RESEARCH</span><h2>'+safe(label)+'</h2></div>'+(desc?'<p>'+safe(desc)+'</p>':'')+'</div>'}
function overview(db){
 const latest=[...db.items].sort((a,b)=>b.updated.localeCompare(a.updated)),focus=latest[0];
 let h='<div class="top-prelude"><span class="eyebrow">INDEPENDENT RESEARCH / A & H EQUITIES</span><span class="line"></span><span>'+safe(db.version)+'</span></div>';
 h+='<div class="hero"><div class="hero-copy"><span class="hero-tag"><i></i> Markdown 驱动的投研工作台</span><h1>让复杂的估值研究<br><em>一目了然。</em></h1><p>从完整的悲观、基准、乐观情景，到增长假设、现金流、预期差与验证节点。统一阅读，统一比较，统一追溯。</p><div class="hero-actions"><a href="#/companies" class="button-primary">探索公司估值 '+icon('arrow')+'</a><a href="'+ORIGINAL+'" target="_blank" rel="noopener noreferrer" class="button-ghost">阅读 Markdown 原文 ↗</a></div></div><div class="hero-art" aria-hidden="true"><div class="hero-art-top">ALPHA / RESEARCH <span>'+safe(db.version)+'</span></div><div class="art-rings"><div class="ring r1"></div><div class="ring r2"></div><div class="ring r3"></div><span>A</span></div><div class="hero-art-bottom"><span>THREE SCENARIOS</span><span>ONE SOURCE OF TRUTH</span></div></div></div>';
 h+='<div class="stat-row"><div><small>完整公司研究</small><strong>'+db.items.length.toString().padStart(2,'0')+'</strong><span>源于估值总表</span></div><div><small>覆盖行业</small><strong>'+db.sectors.length.toString().padStart(2,'0')+'</strong><span>按行业分组</span></div><div><small>估值情景</small><strong>'+(db.items.length*3).toString().padStart(2,'0')+'</strong><span>悲观 / 基准 / 乐观</span></div><div><small>最近研究日期</small><strong class="stat-date">'+safe(focus.updated)+'</strong><span>非行情刷新时间</span></div></div>';
 h+=sectionTitle('最新研究','以 Markdown 中的最近更新日期排序');
 h+='<div class="feature-layout"><div class="feature-card"><div class="feature-header"><span class="pill-dark">最近更新</span><span>'+safe(focus.updated)+'</span></div><div class="feature-company"><div><span class="eyebrow">'+safe(focus.sector)+' / '+safe(focus.market)+'</span><h3>'+safe(focus.name)+'</h3><p>'+safe(focus.code)+' · '+safe(focus.horizon)+'</p></div><div class="feature-icon">↗</div></div><div class="focus-reference"><span>最新有效收盘价 · '+safe(labelQuote(focus).date)+'</span><strong>'+safe(labelQuote(focus).price)+'</strong><small>'+safe(info(focus))+' · 历史参考 '+safe(focus.referenceText)+'</small></div>'+graph(focus,true)+'<a class="feature-open" href="'+routeCompany(focus)+'">查看完整研究 '+icon('arrow')+'</a></div>';
 h+='<div class="recent-card"><div class="recent-head"><h3>研究时间线</h3><span>RECENT RESEARCH</span></div>'+latest.slice(0,5).map((s,i)=>'<a href="'+routeCompany(s)+'" class="recent-row"><span class="recent-index">0'+(i+1)+'</span><div><strong>'+safe(s.name)+'</strong><small>'+safe(s.sector)+' · '+safe(s.updated)+'</small></div>'+icon('arrow')+'</a>').join('')+'<div class="recent-warning">研究日期并不等于已按最新财报重新估值。</div></div></div>';
 h+=sectionTitle('行业研究地图','分组与排序直接采用 Markdown 估值总表');
 h+='<div class="sector-grid">'+db.sectors.map((s,i)=>'<a class="sector-tile sector-'+i+'" href="#/sector/'+encode(s)+'"><div class="sector-tile-head"><span>'+['◇','◈','✧','⬡'][i%4]+'</span>'+icon('arrow')+'</div><h3>'+safe(s)+'</h3><p><b>'+db.items.filter(x=>x.sector===s).length+' 家公司</b><span>'+safe(db.items.filter(x=>x.sector===s).slice(0,2).map(x=>x.name).join(' / '))+'</span></p></a>').join('')+'</div>';
 h+='<div class="ethics"><span class="ethics-icon">i</span><p><strong>阅读提示：</strong>参考股价、利润、PE、FCFF 与估值区间全部按 Markdown 的历史研究日期展示。不同公司币种与模型期限不同，不能简单用绝对目标价排序，历史模型亦不代表实时交易建议。</p><a href="#/about">查看数据规则 →</a></div>';
 return h;
}
function catalog(db,sector=null){
 const items=sector?db.items.filter(s=>s.sector===sector):db.items;
 let h='<div class="catalog-heading"><div><span class="eyebrow">THE RESEARCH UNIVERSE</span><h1>'+safe(sector||'公司估值库')+'</h1><p>完整研究 '+items.length+' 家 · 原研究日期排序 · 所有内容以 Markdown 为准</p></div><a href="'+ORIGINAL+'" class="original-link" target="_blank" rel="noopener noreferrer">查看原始文档 ↗</a></div>';
 h+='<div class="filter-tools"><label class="searchbox">'+icon('search')+'<input id="search" type="search" placeholder="搜索公司名称、股票代码或行业..." aria-label="搜索公司" value="'+safe(state.term)+'"></label><div class="market-tabs">'+['全部','A股','港股'].map(x=>'<button data-market-filter="'+x+'" class="'+(state.market===x?'active':'')+'">'+x+'</button>').join('')+'</div><div class="layout-switch"><button data-layout="cards" class="'+(state.layout==='cards'?'active':'')+'" aria-label="卡片布局">'+icon('grid')+'</button><button data-layout="table" class="'+(state.layout==='table'?'active':'')+'" aria-label="表格布局">'+icon('list')+'</button></div></div><div class="result-summary"><strong id="visible-count">共 '+items.length+' 条研究</strong><span>百分比是模型估值与最新有效收盘价的差幅，并非预计收益</span></div>';
 for(let i=0;i<db.sectors.length;i++){
  const sec=db.sectors[i],group=items.filter(x=>x.sector===sec);if(!group.length)continue;
  h+='<section class="catalog-group" data-catalog-group><div class="group-head"><div class="group-symbol">'+['◇','◈','✧','⬡'][i%4]+'</div><div><h2>'+safe(sec)+'</h2><p>'+group.length+' 家公司 · 最近研究在前</p></div></div>';
  if(state.layout==='cards')h+='<div class="tile-grid">'+group.map(companyTile).join('')+'</div>';
  else h+='<div class="table-list"><div class="table-list-head"><span>公司</span><span>参考价</span><span>基准区间</span><span>相对差幅</span><span>研究日期</span></div>'+group.map(s=>'<a href="'+routeCompany(s)+'" class="table-list-row" data-company data-match="'+safe((s.name+' '+s.code+' '+s.sector).toLowerCase())+'" data-market="'+safe(s.market)+'"><span><b>'+safe(s.name)+'</b><small>'+safe(s.code)+'</small></span><span>'+safe(labelQuote(s).price)+'<small>'+safe(labelQuote(s).date)+'</small></span><span>'+safe(rangeText(s,'base'))+'</span><span>'+safe(delta(s,'base'))+'</span><span>'+safe(s.updated)+' →</span></a>').join('')+'</div>';
  h+='</section>';
 }
 h+='<div class="no-results" id="no-results" hidden><h3>没有找到匹配的研究</h3><p>尝试其他关键词，或清除市场筛选。</p><button data-reset>清除筛选</button></div>';
 return h;
}
function paramsTable(s){
 return '<div class="detail-table"><table><thead><tr><th>核心假设 / 模型参数</th><th><i class="tiny-dot bear"></i>悲观</th><th><i class="tiny-dot base"></i>基准</th><th><i class="tiny-dot bull"></i>乐观</th></tr></thead><tbody>'+s.params.map(r=>'<tr class="'+(/每股估值/.test(r.name)?'emphasis':'')+'"><th>'+inline(r.name)+'</th><td>'+inline(r.bear)+'</td><td>'+inline(r.base)+'</td><td>'+inline(r.bull)+'</td></tr>').join('')+'</tbody></table></div>';
}
function articleSection(id,no,tag,title,body){
 if(!body)return '';
 return '<section class="article-section" id="'+id+'"><div class="article-heading"><span class="article-num">'+no+'</span><div><small>'+tag+'</small><h2>'+title+'</h2></div></div>'+body+'</section>';
}
function detail(db,s){
 let h='<div class="breadcrumbs"><a href="#/companies">'+icon('back')+' 返回公司库</a><span>/</span><span>'+safe(s.sector)+'</span><span>/</span><b>'+safe(s.name)+'</b></div>';
 h+='<div class="company-banner"><div><span class="company-industry">'+safe(s.sector)+'</span><span class="ticker">'+safe(s.market)+' · '+safe(s.code)+'</span><h1>'+safe(s.name)+'</h1><p>'+safe(s.method)+'</p><div class="company-tags"><span>'+icon('clock')+' '+safe(s.updated)+' 更新</span><span>'+safe(s.horizon)+'</span></div></div><div class="banner-reference"><span>最新有效收盘价 · '+safe(labelQuote(s).date)+'</span><strong>'+safe(labelQuote(s).price)+'</strong><small>历史参考价 '+safe(s.referenceText)+'（'+safe(s.closeDate)+'）</small></div></div>';
 h+='<div class="position-summary"><span class="position-icon">↗</span><div><strong>'+safe(info(s))+'</strong><p>以最新有效收盘价对比历史 Markdown 模型；模型陈旧或行情过期时不生成低估信号。</p></div><small>MODEL POSITION</small></div>';
 h+='<div class="cases">'+[['bear','悲观情景','BEAR CASE'],['base','基准情景','BASE CASE'],['bull','乐观情景','BULL CASE']].map(([k,name,tag])=>'<div class="case-card '+k+'"><div class="case-heading"><span>'+name+'</span><small>'+tag+'</small></div><strong>'+safe(rangeText(s,k))+'</strong><div><span>相对最新有效收盘价</span><b>'+safe(delta(s,k))+'</b></div></div>').join('')+'</div>';
 h+='<div class="reading-layout"><div class="reading-main">';
 h+=articleSection('distribution','01','VISUAL COMPARISON','三情景价值区间','<div class="chart-panel">'+graph(s)+'</div>');
 h+=articleSection('assumptions','02','MODEL PARAMETERS','三情景参数与估值结果',paramsTable(s)+(s.assumptionNotes?'<div class="prose section-extra">'+renderMarkdown(s.assumptionNotes)+'</div>':''));
 h+=articleSection('context','03','RESEARCH CONTEXT','模型口径与估值基准',s.intro?'<div class="prose">'+renderMarkdown(s.intro)+'</div>':'');
 h+=articleSection('reverse','04','REVERSE VALUATION','反向估值与市场预期差',s.reverse?'<div class="prose highlighted-prose">'+renderMarkdown(s.reverse)+'</div>':'');
 for(const b of s.extras)h+=articleSection('extra-'+encode(b.title),'•','RESEARCH NOTES',safe(b.title),'<div class="prose">'+renderMarkdown(b.raw)+'</div>');
 h+=articleSection('logic','05','INVESTMENT THESIS','核心估值逻辑','<div class="prose logic-prose">'+renderMarkdown(s.logic)+'</div>');
 h+=articleSection('verification','06','EVIDENCE TO MONITOR','预期差的核验节点','<div class="prose">'+renderMarkdown(s.validation)+'</div>');
 h+=articleSection('sources','07','RESEARCH PROVENANCE','研究来源与原始记录','<div class="prose source-prose">'+renderMarkdown(s.sources)+'</div><a class="source-button" href="'+ORIGINAL+'" target="_blank" rel="noopener noreferrer">查看 GitHub 完整 Markdown '+icon('external')+'</a>');
 h+='</div><aside class="reading-side"><div class="side-sticky"><div class="contents-box"><span class="eyebrow">ON THIS PAGE</span><h3>研究目录</h3>'+[['distribution','价值区间图'],['assumptions','核心模型参数'],['context','估值口径'],['reverse','反向估值'],['logic','投资逻辑'],['verification','核验节点'],['sources','来源索引']].filter(x=>x[0]!=='reverse'||s.reverse).map(x=>'<button data-scroll="'+x[0]+'">'+x[1]+' <span>↗</span></button>').join('')+'</div><div class="context-box"><span class="eyebrow">DOCUMENT RECORD</span><dl><dt>研究更新时间</dt><dd>'+safe(s.updated)+'</dd><dt>价格基准日</dt><dd>'+safe(s.closeDate)+'</dd><dt>模型期间</dt><dd>'+safe(s.horizon)+'</dd><dt>文档版本</dt><dd>'+safe(db.version)+'</dd></dl><p>仅展示文档中的历史研究，未经自动重新估值。</p></div></div></aside></div>';
 h+='<div class="bottom-nav"><div><span class="eyebrow">CONTINUE EXPLORING</span><h3>继续阅读研究档案</h3></div><div>'+db.items.filter(x=>x.code!==s.code).slice(0,2).map(x=>'<a href="'+routeCompany(x)+'">'+safe(x.name)+' ↗</a>').join('')+'</div></div>';
 return h;
}

function opportunities(db){
 const rows=db.items.map(item=>({item,result:discountInfo(item),quote:quoteFresh(item)}));
 const filtered=rows.filter(x=>(state.opSector==='全部'||x.item.sector===state.opSector)&&
   (state.opFilter==='all'||state.opFilter==='below'&&['watch','observe','archive'].includes(x.result.kind)||
    state.opFilter==='review'&&x.result.kind==='archive'||state.opFilter==='missing'&&x.result.kind==='missing'));
 // Most negative price deviation first. Missing prices appear at the bottom.
 filtered.sort((a,b)=>(a.result.relative??Infinity)-(b.result.relative??Infinity)||b.item.updated.localeCompare(a.item.updated));
 const valid=rows.filter(x=>x.quote).length;
 const below=rows.filter(x=>['watch','observe'].includes(x.result.kind)).length;
 const archive=rows.filter(x=>x.result.kind==='archive').length;
 const missing=rows.filter(x=>x.result.kind==='missing').length;
 const snapshot=rows.map(x=>x.quote?.closeDate).filter(Boolean).sort().at(-1)||'暂无有效行情';
 let h='<div class="scan-hero"><div><span class="eyebrow">VALUATION OPPORTUNITY SCANNER</span><h1>低估发现<span> / Value Radar</span></h1><p>最新有效收盘价对比 Markdown 的基准估值区间中点。<strong>绿色负值表示当前价低于基准价，红色正值表示高于基准价</strong>。是否真正低估，仍需结合财报、利润和现金流判断。</p><a href="#/companies">浏览全部公司 '+icon('arrow')+'</a></div><div class="scan-visual"><span>LAST VERIFIED CLOSE DATE</span><strong>'+safe(snapshot)+'</strong><small>每只股票另列自己的交易日 · 非实时成交</small><div class="scan-visual-bars"><i></i><i></i><i></i><i></i><i></i></div></div></div>';
 h+='<div class="scan-stats"><div><span>有效收盘价</span><strong>'+valid+'<small> / '+db.items.length+'</small></strong><p>仅有效行情参与筛选</p></div><div><span>跌破基准下沿</span><strong>'+below+'</strong><p>有效行情且模型更新 ≤ 60 天</p></div><div><span>历史模型需复核</span><strong>'+archive+'</strong><p>跌破下沿但研究超过60天</p></div><div><span>无有效行情</span><strong>'+missing+'</strong><p>不生成估值比例</p></div></div>';
 h+='<div class="scan-formula"><div class="scan-formula-icon">%</div><div><strong>当前价相对基准价涨跌幅</strong><p><strong>基准价 =（Markdown 基准估值下沿 + 上沿）÷ 2</strong>；比例 =（最新有效收盘价 ÷ 基准价 − 1）× 100%。<span class="scan-legend-negative">负数（绿色）为低于基准价</span>，<span class="scan-legend-positive">正数（红色）为高于基准价</span>。另以“跌破基准下沿”判断重点核验信号；区间与利润假设仍是历史模型，不构成交易建议。</p></div></div>';
 h+='<div class="scan-section-heading"><div><span class="eyebrow">PRICE VS BASE VALUE</span><h2>当前价格 / 基准估值对比</h2><p>按相对基准价涨跌幅从低到高排列 · 未取得有效收盘价的公司列在最后</p></div><div class="scan-selector"><label>行业筛选 <select id="scan-sector"><option value="全部">全部行业</option>'+db.sectors.map(x=>'<option value="'+safe(x)+'" '+(x===state.opSector?'selected':'')+'>'+safe(x)+'</option>').join('')+'</select></label></div></div>';
 h+='<div class="scan-filters">'+[['all','全部公司'],['below','跌破基准下沿'],['review','旧模型待复核'],['missing','缺少行情']].map(([key,label])=>'<button data-op-filter="'+key+'" class="'+(state.opFilter===key?'active':'')+'">'+label+'</button>').join('')+'</div>';
 h+='<div class="scan-table"><div class="scan-table-header"><span>研究对象</span><span>最新有效收盘价</span><span>基准价（区间中点）</span><span>相对基准价</span><span>估值核验状态</span></div>';
 if(!filtered.length)h+='<div class="scan-empty">当前筛选条件下没有记录。可切换其他行业或信号分类。</div>';
 for(const {item,result,quote:q} of filtered){
   const color=result.kind==='watch'?'watch':result.kind==='observe'?'observe':result.kind==='archive'?'archive':result.kind==='missing'?'missing':'neutral';
   const badge={watch:'重点观察',observe:'跌破下沿待核验',archive:'历史模型待复核',missing:'行情不可用',inrange:'基准区间内',above:'高于基准区间'}[result.kind];
   const relative=result.relative==null?'—':(result.relative>0?'+':'')+result.relative.toFixed(1)+'%';
   const deviationClass=ratioClass(result.relative);
   const baseline=(item.base.low+item.base.high)/2;
   h+='<a href="'+routeCompany(item)+'" class="scan-row"><span class="scan-company"><b>'+safe(item.name)+'</b><small>'+safe(item.code)+' · '+safe(item.sector)+'</small></span><span class="scan-price"><b>'+safe(q?item.currency+format(q.close):'—')+'</b><small>'+safe(q?q.closeDate:quote(item)?.closeDate||'日期未知')+'</small></span><span class="scan-low"><b>'+safe(item.currency+format(baseline))+'</b><small>区间 '+safe(item.currency+format(item.base.low))+'–'+safe(format(item.base.high))+'</small></span><span class="scan-discount '+deviationClass+'">'+relative+'</span><span class="scan-signal"><span class="scan-badge '+color+'">'+badge+'</span><small>'+safe(result.reason)+'</small><small>模型更新 '+safe(item.updated)+'</small></span></a>';
 }
 h+='</div>';
 h+='<div class="scan-rules"><div><strong>收盘日期</strong><p>有效收盘日期超过5个日历日即暂时停止比较。网站展示的是最近有效收盘价，不是实时盘中价格。</p></div><div><strong>基准价与预期差</strong><p>基准价定义为原 Markdown 估值区间中点，正负比率反映当前价的位置；并不代表实际可兑现的上涨或下跌空间。</p></div><div><strong>历史模型需更新</strong><p>研究超过60个日历日，或经营与盈利假设失效时，应先重新估值；跌破下沿本身不构成买入信号。</p></div></div>';
 return h;
}

function about(db){
 return '<div class="about-banner"><span class="eyebrow">RESEARCH METHODOLOGY</span><h1>所有研究内容，<br><em>来自同一份文档。</em></h1><p>网页只负责读取、整理和展示 Markdown 中的内容，不生成额外公司数据，也不把历史股价包装成实时行情。</p><a class="button-primary" href="'+ORIGINAL+'" target="_blank" rel="noopener noreferrer">打开 Markdown 原文 ↗</a></div><div class="method-grid">'+[['01','唯一事实来源','只读取 sources 下的估值 Markdown。历史 JSON 和旧研报不再参与网页计算。'],['02','严格历史口径','三档估值、股价、财务假设和研究日期全部沿用原文，差幅仅作数学对照。'],['03','原文可追溯','研究来源和旧对话标题取自 Markdown；没有真实聊天 URL 时不编造。']].map(x=>'<div><span>'+x[0]+'</span><h3>'+x[1]+'</h3><p>'+x[2]+'</p></div>').join('')+'</div>'+sectionTitle('文档声明与变更记录','以下条目为 Markdown 文档本身的内容')+'<div class="method-reading"><div class="prose"><h3>文档说明</h3>'+renderMarkdown(db.intro)+'</div><div class="prose"><h3>历史版本</h3>'+renderMarkdown(db.changes)+'</div></div>';
}
function route(db){
 const hash=decodeURIComponent((window.location.hash||'#/overview').slice(1));
 if(hash.startsWith('/company/')){const key=hash.slice(9).replace(/^0+(?=\d)/,'').toUpperCase(),item=db.items.find(x=>x.key===key);return item?{type:'company',item}:{type:'notfound'}}
 if(hash.startsWith('/sector/')){const sector=hash.slice(8);return db.sectors.includes(sector)?{type:'sector',sector}:{type:'notfound'}}
 if(hash==='/opportunities')return {type:'opportunities'};
 if(hash==='/companies')return {type:'companies'};
 if(hash==='/about')return {type:'about'};
 return {type:'overview'};
}
function filter(){
 const cards=[...document.querySelectorAll('[data-company]')];let count=0;
 for(const card of cards){const matched=card.dataset.match.includes(state.term.toLowerCase())&&(state.market==='全部'||state.market===card.dataset.market);card.hidden=!matched;if(matched)count++}
 document.querySelectorAll('[data-catalog-group]').forEach(g=>g.hidden=![...g.querySelectorAll('[data-company]')].some(x=>!x.hidden));
 if($('visible-count'))$('visible-count').textContent='显示 '+count+' / '+cards.length+' 条研究';
 if($('no-results'))$('no-results').hidden=count!==0;
 document.querySelectorAll('[data-market-filter]').forEach(b=>b.classList.toggle('active',b.dataset.marketFilter===state.market));
}
function render(){
 if(!state.db)return;
 const d=state.db,r=route(d);
 $('sidebar').innerHTML=side(r);
 let html='';
 if(r.type==='overview')html=overview(d);
 else if(r.type==='opportunities')html=opportunities(d);
 else if(r.type==='companies')html=catalog(d);
 else if(r.type==='sector')html=catalog(d,r.sector);
 else if(r.type==='company')html=detail(d,r.item);
 else if(r.type==='about')html=about(d);
 else html='<div class="no-results"><h2>研究不存在</h2><a href="#/companies">返回公司库</a></div>';
 $('content').innerHTML=html;
 $('crumb').textContent=r.type==='company'?'公司研究 / '+r.item.name:r.type==='sector'?r.sector:r.type==='about'?'方法与记录':r.type==='opportunities'?'低估发现':r.type==='companies'?'公司估值库':'研究总览';
 $('version').textContent='DOC '+d.version;
 document.title=(r.type==='company'?r.item.name+' | ':'')+'Alpha Atlas · AI 投研工作台';
 document.body.classList.remove('mobile-open');
 if(r.type==='companies'||r.type==='sector')filter();
}
function navigate(){
 render();window.scrollTo(0,0);
}
document.addEventListener('click',event=>{
 const scroll=event.target.closest('[data-scroll]');if(scroll){const item=$(scroll.dataset.scroll);if(item)item.scrollIntoView({behavior:'smooth',block:'start'});return}
 const scan=event.target.closest('[data-op-filter]');if(scan){state.opFilter=scan.dataset.opFilter;render();return}
 const market=event.target.closest('[data-market-filter]');if(market){state.market=market.dataset.marketFilter;filter();return}
 const layout=event.target.closest('[data-layout]');if(layout){state.layout=layout.dataset.layout;render();return}
 if(event.target.closest('[data-reset]')){state.term='';state.market='全部';const input=$('search');if(input)input.value='';filter();return}
 if(event.target.closest('#mobile-menu')){document.body.classList.toggle('mobile-open');return}
 if(event.target.closest('#shade')){document.body.classList.remove('mobile-open');return}
 const link=event.target.closest('a[href^="#/"]');if(link){if(link.hash===location.hash)navigate();else{state.term='';state.market='全部'}}
});
document.addEventListener('change',event=>{if(event.target.id==='scan-sector'){state.opSector=event.target.value;render()}});
document.addEventListener('input',event=>{if(event.target.id==='search'){state.term=event.target.value.trim();filter()}});
window.addEventListener('hashchange',navigate);
async function start(){
 try{
  const response=await fetch(MD,{cache:'no-store'});if(!response.ok)throw Error('读取 Markdown 失败：HTTP '+response.status);
  state.db=parseMarkdown(await response.text());
  try{const q=await fetch(MARKET,{cache:'no-store'});if(q.ok)state.quotes=parseQuotes(await q.json(),state.db);else console.warn('行情暂不可用：HTTP '+q.status)}catch(quoteError){console.warn('行情读取失败，不影响研究内容',quoteError.message)}
  render();
 }catch(err){$('content').innerHTML='<div class="load-fail"><h1>研究数据加载失败</h1><p>'+safe(err.message)+'</p><p>请通过 GitHub Pages 或本地 HTTP 服务打开，并检查 Markdown 文档格式。</p><a href="'+ORIGINAL+'" target="_blank" rel="noopener noreferrer">打开原始文件 ↗</a></div>'}
}
window.AtlasResearch={parseMarkdown,parseQuotes,dayAge,benchmarkInfo,ratioClass,companyTile,renderMarkdown,graph,detail,catalog,overview,opportunities,discountInfo,modelOld};
start();
})();