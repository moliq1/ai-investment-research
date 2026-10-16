'use strict';
const $=id=>document.getElementById(id);
const H=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url=v=>{try{let u=new URL(v);return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}};
const F=n=>(n==null||!Number.isFinite(Number(n)))?'—':Number(n).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
const P=(t,c)=>Number(c)>0&&Number.isFinite(Number(t))?100*(Number(t)/Number(c)-1):null;
const PS=p=>p===null?'—':(p>0?'+':'')+p.toFixed(1)+'%';
const tone=p=>p===null?'':p>=0?'up':'down';
const titleMap={home:['研究总览','聚合收盘价、情景估值与研究报告，不混淆 A/H 股票及货币单位。'],valuation:['三情景估值','编辑悲观、基准、乐观的假设价格，即时查看相对收盘价的空间。'],brokers:['券商目标价','按机构、股票代码、评级日期和出处整理目标价格。'],reports:['研究报告库','公司研究与机构资料索引；当前为原创研究提纲。'],sources:['数据与说明','区分价格快照、模型假设、券商数据与授权边界。']};
let data={},view='home',active='601899.SH',selectedReport=null;
const key='alpha-atlas-edits-v1';let local={scenarios:{},brokers:[]};
try{const v=JSON.parse(localStorage.getItem(key)||'{}');local.scenarios=v.scenarios||{};local.brokers=Array.isArray(v.brokers)?v.brokers:[]}catch{}
function persist(){try{localStorage.setItem(key,JSON.stringify(local))}catch{toast('无法写入本地浏览器存储')}}
function toast(msg){$('toast').textContent=msg;$('toast').classList.add('visible');setTimeout(()=>$('toast').classList.remove('visible'),2400)}
function st(id){return data.stocks.find(x=>x.id===id)}
function model(id){return Object.assign({},data.scenarios.find(x=>x.stockId===id),local.scenarios[id]||{})}
function brokerRows(){return [...data.brokers,...local.brokers]}
function navigate(p){if(!titleMap[p])return;view=p;selectedReport=null;document.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('selected',b.dataset.nav===p));$('breadcrumb').textContent=titleMap[p][0];$('pageTitle').textContent=titleMap[p][0];$('pageSubtitle').textContent=titleMap[p][1];render();window.scrollTo(0,0)}
function cardMetric(label,value,desc){return '<div class="metric"><small>'+H(label)+'</small><strong>'+H(value)+'</strong><em>'+H(desc)+'</em></div>'}
function home(){
 let linked=brokerRows().filter(x=>url(x.url)).length;
 let html='<div class="cards">'+cardMetric('研究公司','03','矿业、贵金属')+cardMetric('跟踪代码','04','紫金矿业 A/H 分开')+cardMetric('附来源目标价',linked,'并非人工核验')+cardMetric('研究资料',data.reports.length,'研究提纲，可持续迭代')+'</div>';
 html+='<div class="section-head"><div><h2>核心公司观察池</h2><p>每只股票保留独立的市场、货币和来源</p></div><button class="button" data-action="valuation">查看三情景估值 →</button></div>';
 html+='<div class="card table-wrap"><table><thead><tr><th>公司 / 代码</th><th>收盘价格</th><th>市场</th><th>估值</th><th>行情来源</th></tr></thead><tbody>';
 for(const s of data.stocks){html+='<tr><td><a href="#" data-stock="'+H(s.id)+'"><b>'+H(s.short)+'</b></a><span class="cell-sub">'+H(s.id)+' · '+H(s.sector)+'</span></td><td><span class="price">'+H(s.currencySymbol)+F(s.close)+'</span><span class="cell-sub">'+H(s.closeDate)+' 收盘</span></td><td>'+H(s.market)+'<span class="cell-sub">'+H(s.currency)+'</span></td><td><span class="tag amber">演示模型</span></td><td><a target="_blank" rel="noopener noreferrer" href="'+H(url(s.closeSource))+'">查看来源 ↗</a></td></tr>'}
 html+='</tbody></table></div><div class="columns" style="margin-top:20px"><div class="card pad"><h3>研究流程</h3><div class="steps"><div><b>01 / 市场快照</b><br><span>记录日期、交易所、来源与原币价格</span></div><div><b>02 / 独立估值</b><br><span>基于未来盈利、矿产量与估值假设研究三种情景</span></div><div><b>03 / 券商对照</b><br><span>把机构目标价格与独立研究放在同一页面</span></div></div></div><div class="card pad"><h3>首批覆盖</h3><p>紫金矿业：金铜双主业、产量与 A/H 市场差异。</p><p>紫金黄金国际：海外金矿、归母权益、成本与产量。</p><p>中国黄金国际：矿山生产、复产进度与金铜价格敏感度。</p><button class="button" data-action="reports">打开研究库 →</button></div></div>';
 return html;
}
function valuation(){
 const s=st(active)||data.stocks[0],m=model(s.id);
 let html='<div class="section-head" style="margin-top:0"><div><h2>情景估值工作台</h2><p>初版目标价格为未建模的演示数字，不代表我们的投资结论</p></div><span class="tag amber">DEMO · NOT VERIFIED</span></div><div class="tickers">';
 for(const t of data.stocks)html+='<button class="ticker '+(t.id===s.id?'selected':'')+'" data-ticker="'+H(t.id)+'"><b>'+H(t.short)+'</b><small>'+H(t.id)+'</small></button>';
 html+='</div><div class="company-head"><div><small class="eyebrow">'+H(s.theme)+'</small><h2>'+H(s.short)+'</h2><p>'+H(s.note)+'</p></div><div class="spot"><small>最后记录的收盘价 · '+H(s.currency)+'</small><strong>'+H(s.currencySymbol)+F(s.close)+'</strong><span>'+H(s.closeDate)+' · '+H(s.market)+'</span></div></div><div class="scenarios">';
 const rows=[['bear','悲观情景','不利条件 / 低估值'],['base','基准情景','中性增长 / 中性估值'],['bull','乐观情景','业务超预期 / 高估值']];
 for(const [id,label,desc] of rows){let p=P(m[id],s.close);html+='<div class="card scenario '+id+'"><label for="scenario-'+id+'">'+label+'</label><strong>'+H(s.currencySymbol)+F(m[id])+'</strong><span class="impact '+tone(p)+'">'+PS(p)+'</span><small>相对最近收盘价 · '+H(desc)+'</small><input id="scenario-'+id+'" data-scenario="'+id+'" type="number" min="0.01" step="0.01" value="'+H(m[id])+'" aria-label="'+label+'目标价"></div>'}
 html+='</div><div class="columns" style="margin-top:18px"><div class="card pad"><h3>价格对照</h3><p class="subtle">以下价格全部以 '+H(s.currency)+' 计价；不跨币种直接比较</p>';
 let values=[['收盘',s.close,'#8399b9'],['悲观',m.bear,'#ff8794'],['基准',m.base,'#5c8dff'],['乐观',m.bull,'#4ac8b3']];let max=Math.max(1,...values.map(x=>Number(x[1])||0));
 for(const [label,n,color] of values){let w=Math.min(100,100*n/max);html+='<div class="bar-row"><span>'+H(label)+'</span><div class="bar"><div class="fill" style="width:'+w+'%;background:'+color+'"></div></div><span class="right">'+H(s.currencySymbol)+F(n)+'</span></div>'}
 html+='</div><div class="card pad"><h3>模型假设与研究备注</h3><p class="subtle">'+H(m.method)+'</p><div class="form-group"><label for="notes">当前假设</label><textarea id="notes">'+H(m.assumptions)+'</textarea></div><div class="actions"><button class="button primary" data-action="save-notes">保存到本机</button></div><p class="subtle">保存后的修改只在当前浏览器生效。可以在顶部导出 JSON。</p></div></div>';
 const b=brokerRows().filter(x=>x.stockId===s.id);
 html+='<div class="card pad" style="margin-top:18px"><h3>机构目标价</h3><p>'+ (b.length?'已存档 '+b.length+' 条机构记录，可在券商页面查看。':'目前没有导入这个证券的券商目标价，不填造假数字。')+'</p><button data-action="brokers" class="button">查看券商记录 →</button></div>';
 return html;
}
function brokers(){
 const items=brokerRows().slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 let html='<div class="section-head" style="margin-top:0"><div><h2>机构目标价与评级</h2><p>行情自动对比，以机构记录中的对应证券本币计算空间</p></div><span class="tag">Futu OpenAPI 待接入</span></div>';
 html+='<div class="card pad"><h3>录入券商目标价（保存于当前浏览器）</h3><form id="brokerForm"><div class="form-grid"><div class="form-group"><label>股票<select name="stock" required>';
 for(const s of data.stocks)html+='<option value="'+H(s.id)+'">'+H(s.short)+' · '+H(s.currency)+'</option>';
 html+='</select></label></div><div class="form-group"><label>券商机构<input name="institution" required maxlength="100" placeholder="例如：某券商"></label></div><div class="form-group"><label>目标价<input name="target" required type="number" min="0.01" step="0.01" placeholder="证券本币"></label></div><div class="form-group"><label>评级日期<input type="date" name="date" required></label></div><div class="form-group"><label>评级<select name="rating"><option>买入</option><option>增持</option><option>中性</option><option>减持</option><option>卖出</option><option>未评级</option></select></label></div><div class="form-group field-wide"><label>来源 URL<input type="url" name="url" placeholder="https://...（可留空，标记待核实）"></label></div></div><div class="actions"><button class="button primary" type="submit">保存目标价</button></div></form></div>';
 html+='<div class="section-head"><div><h2>机构目标价格</h2><p>有原文链接不等于机构内容已人工核验</p></div></div><div class="card table-wrap"><table><thead><tr><th>机构</th><th>证券</th><th>评级</th><th>目标价</th><th>相对收盘价</th><th>日期</th><th>来源</th><th></th></tr></thead><tbody>';
 for(const b of items){const s=st(b.stockId);if(!s)continue;const p=P(b.target,s.close);const link=url(b.url);html+='<tr><td>'+H(b.institution)+'</td><td>'+H(b.stockId)+'</td><td>'+H(b.rating)+'</td><td class="price">'+H(s.currencySymbol)+F(b.target)+'</td><td class="'+tone(p)+'">'+PS(p)+'</td><td>'+H(b.date)+'</td><td>'+(link?'<a href="'+H(link)+'" target="_blank" rel="noopener noreferrer">原文链接 ↗</a>':'<span class="tag amber">待核实</span>')+'</td><td>'+(String(b.uid||'').startsWith('local-')?'<button class="button small" data-del="'+H(b.uid)+'">删除</button>':'')+'</td></tr>'}
 html+='</tbody></table>'+(items.length?'':'<p class="empty">暂未导入真实机构目标价。可手动录入，或使用本地富途 OpenD 导入脚本。</p>')+'</div>';
 html+='<div class="card pad" style="margin-top:18px"><h3>机构一致预期</h3>';
 if(data.consensus.length){for(const c of data.consensus)html+='<p>'+H(st(c.stockId)?.short||c.stockId)+'：最低 '+F(c.lowest)+' / 平均 '+F(c.average)+' / 最高 '+F(c.highest)+'（'+H(c.date||'日期未提供')+'；'+H(c.origin||'数据源未注明')+'）</p>'}
 else html+='<p>暂无一致预期数据。富途 API 已预留导入脚本，但尚未验证账户访问权限及股票覆盖。</p>';
 return html+'</div>';
}
function reports(){
 let html='<div class="section-head" style="margin-top:0"><div><h2>独立研究报告</h2><p>当前 3 份是原创研究提纲，并非已迁移的完整 ChatGPT 历史研报</p></div><span class="tag amber">研究提纲 · 后续补充</span></div><div class="report-grid">';
 for(const r of data.reports)html+='<article class="card report-card"><small>'+H(r.date)+' · '+H(r.type)+'</small><h3>'+H(r.title)+'</h3><p>'+H(r.summary)+'</p><button class="button" data-report="'+H(r.id)+'">阅读报告 →</button></article>';
 html+='</div><div class="card pad" style="margin-top:19px" id="reportReader"><h3>报告阅读</h3><div class="report-body" id="reportText">选择上方报告阅读。</div></div><div class="card pad" style="margin-top:19px"><h3>外部研报来源</h3><p><a href="https://data.eastmoney.com/report/stock.jshtml" target="_blank" rel="noopener noreferrer">东方财富个股研报 ↗</a>　 <a href="https://www.hkexnews.hk/" target="_blank" rel="noopener noreferrer">港交所公告 ↗</a>　 <a href="https://www.cninfo.com.cn/" target="_blank" rel="noopener noreferrer">巨潮资讯 ↗</a></p><p>未获授权的券商付费 PDF 不上传至公开仓库，只记录标题、机构、时间与合法原文链接。</p></div>';
 return html;
}
function sources(){return '<div class="source-grid"><div class="card"><h3>行情快照</h3><p>2026-10-16 的收盘价格作为首版基线，每条证券都有交易所、币种、日期与来源。自动更新失败时保持旧值和旧日期，不能作为实时行情。</p></div><div class="card"><h3>模型估值</h3><p>三情景目标价均为 DEMO，用于演示交互。正式建模需要矿产金/铜产量、价格、AISC、CAPEX、税率、股本与 PE/NAV 假设。</p></div><div class="card"><h3>券商目标价</h3><p>可手工保存机构记录，初始券商目标价及一致预期为空。富途 OpenD 接口需在有权限的电脑上运行并实际验证。</p></div><div class="card"><h3>内容与版权</h3><p>原创报告以 Markdown 版本化保存。外部机构研报默认只存元数据、公开摘要和合法来源链接；不转载无授权 PDF。</p></div></div><div class="card pad" style="margin-top:18px"><h3>有关本地编辑</h3><p>页面上的数据输入只写入浏览器 localStorage，不会自动提交到 GitHub。顶部按钮可以导出 JSON，用于后续合并到仓库的研究数据。</p><p>参阅仓库 <a href="https://github.com/moliq1/ai-investment-research/blob/main/docs/DATA_SOURCES.md">数据来源与格式规范 ↗</a>。</p></div>'}
function render(){$('view').innerHTML=({home,valuation,brokers,reports,sources})[view]()}
async function readReport(id){const r=data.reports.find(x=>x.id===id);if(!r||!/^reports\/[a-z0-9-]+\.md$/.test(r.path))return;const el=$('reportText');if(!el)return;el.textContent='正在读取…';try{const res=await fetch(r.path);if(!res.ok)throw Error('HTTP '+res.status);el.textContent=await res.text();el.scrollIntoView({behavior:'smooth',block:'start'})}catch(e){el.textContent='暂时无法加载研究内容：'+e.message}}
document.addEventListener('click',e=>{const btn=e.target.closest('[data-nav],[data-action],[data-stock],[data-ticker],[data-report],[data-del]');if(!btn)return;if(btn.dataset.nav){navigate(btn.dataset.nav)}else if(btn.dataset.action){if(btn.dataset.action==='save-notes'){local.scenarios[active]=Object.assign({},local.scenarios[active],{assumptions:$('notes').value,status:'demo'});persist();toast('研究备注已保存在本机')}else navigate(btn.dataset.action)}else if(btn.dataset.stock){e.preventDefault();active=btn.dataset.stock;navigate('valuation')}else if(btn.dataset.ticker){active=btn.dataset.ticker;render()}else if(btn.dataset.report){readReport(btn.dataset.report)}else if(btn.dataset.del){local.brokers=local.brokers.filter(x=>x.uid!==btn.dataset.del);persist();render();toast('已移除本地记录')}});
document.addEventListener('change',e=>{if(e.target.matches('[data-scenario]')){const value=Number(e.target.value);if(!Number.isFinite(value)||value<=0){toast('价格应大于零');render();return}local.scenarios[active]=Object.assign({},local.scenarios[active],{[e.target.dataset.scenario]:value,status:'demo'});persist();render()}});
document.addEventListener('submit',e=>{if(e.target.id!=='brokerForm')return;e.preventDefault();const d=new FormData(e.target),t=Number(d.get('target')),u=String(d.get('url')||'').trim();if(!st(String(d.get('stock')))||!Number.isFinite(t)||t<=0||(u&&!url(u))){toast('请检查目标价和来源链接');return}local.brokers.push({uid:'local-'+Date.now(),stockId:String(d.get('stock')),institution:String(d.get('institution')).trim(),target:t,date:String(d.get('date')),rating:String(d.get('rating')),url:url(u),origin:'手工录入'});persist();render();toast('已保存到当前浏览器')});
$('export').onclick=()=>{const obj={date:new Date().toISOString(),disclaimer:'情景估值示范数字，非经过验证的目标价',...local};const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});const a=document.createElement('a');const u=URL.createObjectURL(blob);a.href=u;a.download='alpha-atlas-user-edits.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),2000)};
async function start(){try{const names=['stocks','scenarios','brokers','reports','consensus'];const entries=await Promise.all(names.map(async x=>{const r=await fetch('data/'+x+'.json',{cache:'no-cache'});if(!r.ok)throw Error('data/'+x+'.json · HTTP '+r.status);return await r.json()}));names.forEach((k,i)=>data[k]=entries[i]);if(!data.stocks.length)throw Error('股票数据为空');$('latestDate').textContent=data.stocks.map(s=>s.closeDate).sort().slice(-1)[0]||'—';render()}catch(e){$('notice').textContent='加载数据失败：'+e.message+'。请通过 GitHub Pages 或本地 HTTP 服务打开，不要直接双击源码 index.html。';$('view').innerHTML='<p class="empty">数据未能加载，请检查网络或 GitHub Pages 部署状态。</p>'}}
start();
