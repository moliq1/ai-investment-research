'use strict';
const $=id=>document.getElementById(id);
const H=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url=v=>{try{let u=new URL(v);return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}};
const F=n=>(n==null||n===''||!Number.isFinite(Number(n)))?'—':Number(n).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
const P=(t,c)=>t!=null&&t!==''&&c!=null&&Number(c)>0&&Number.isFinite(Number(t))?100*(Number(t)/Number(c)-1):null;
const PS=p=>p===null?'—':(p>0?'+':'')+p.toFixed(1)+'%';
const tone=p=>p===null?'':p>=0?'up':'down';
const titleMap={home:['研究总览','聚合收盘价、情景估值与研究报告，不混淆 A/H 股票及货币单位。'],valuation:['三情景估值','编辑悲观、基准、乐观的假设价格，即时查看相对收盘价的空间。'],brokers:['券商目标价','按机构、股票代码、评级日期和出处整理目标价格。'],reports:['研究报告库','公司研究与机构资料索引；当前为原创研究提纲。'],sources:['数据与说明','区分价格快照、模型假设、券商数据与授权边界。']};
let data={},view='home',active='601899.SH',selectedReport=null;
const key='alpha-atlas-edits-v2';let local={scenarios:{},brokers:[]};
try{const v=JSON.parse(localStorage.getItem(key)||'{}');local.scenarios=v.scenarios||{};local.brokers=Array.isArray(v.brokers)?v.brokers:[]}catch{}
function persist(){try{localStorage.setItem(key,JSON.stringify(local))}catch{toast('无法写入本地浏览器存储')}}
function toast(msg){$('toast').textContent=msg;$('toast').classList.add('visible');setTimeout(()=>$('toast').classList.remove('visible'),2400)}
function st(id){return data.stocks.find(x=>x.id===id)}
function model(id){return Object.assign({},data.scenarios.find(x=>x.stockId===id),local.scenarios[id]||{})}
function brokerRows(){return [...data.brokers,...local.brokers]}
function fmtRange(lo,hi,symbol=''){return lo==null||hi==null?'待补充':symbol+(lo===hi?F(lo):F(lo)+'–'+F(hi))}
function moveRange(lo,hi,close){const a=P(lo,close),b=P(hi,close);return a==null||b==null?'待更新行情':a===b?PS(a):PS(a)+' 至 '+PS(b)}
function stockDate(s){return s.closeDate||'待自动抓取'}
function modelStatus(s){const m=data.scenarios.find(x=>x.stockId===s.id);if(!m)return '待补充';return m.status==='historical'?'历史估值':m.status==='partial'?'部分恢复':'待补充'}
function navigate(p){if(!titleMap[p])return;view=p;selectedReport=null;document.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('selected',b.dataset.nav===p));$('breadcrumb').textContent=titleMap[p][0];$('pageTitle').textContent=titleMap[p][0];$('pageSubtitle').textContent=titleMap[p][1];render();window.scrollTo(0,0)}
function cardMetric(label,value,desc){return '<div class="metric"><small>'+H(label)+'</small><strong>'+H(value)+'</strong><em>'+H(desc)+'</em></div>'}
function home(){
 const linked=brokerRows().filter(x=>url(x.url)).length;
 const countCompanies=new Set(data.stocks.map(x=>x.company)).size;
 const quantified=data.scenarios.filter(x=>x.status==='historical').length;
 let html='<div class="cards">'+cardMetric('研究公司',String(countCompanies).padStart(2,'0'),'历史报告摘要归档')+cardMetric('跟踪证券',String(data.stocks.length).padStart(2,'0'),'A/H 分别计价')+cardMetric('三情景已恢复',String(quantified).padStart(2,'0'),'独立模型历史版本')+cardMetric('带来源券商记录',String(linked).padStart(2,'0'),'尚未正式导入富途')+'</div>';
 html+='<div class="section-head"><div><h2>公司研究与估值索引</h2><p>估值数字源自此前对话的可恢复摘要，模型时点与价格时点不同</p></div><button class="button" data-action="valuation">查看情景估值 →</button></div>';
 html+='<div class="card table-wrap"><table><thead><tr><th>公司 / 代码</th><th>记录的收盘价格</th><th>估值研究日期</th><th>历史模型状态</th><th>行情来源</th></tr></thead><tbody>';
 for(const s of data.stocks){const m=data.scenarios.find(x=>x.stockId===s.id);html+='<tr><td><a href="#" data-stock="'+H(s.id)+'"><b>'+H(s.short)+'</b></a><span class="cell-sub">'+H(s.id)+' · '+H(s.sector)+'</span></td><td><span class="price">'+(s.close==null?'待抓取':H(s.currencySymbol)+F(s.close))+'</span><span class="cell-sub">'+H(stockDate(s))+'</span></td><td>'+H(m?.asOf||'—')+'</td><td><span class="tag '+(m?.status==='historical'?'green':'amber')+'">'+H(modelStatus(s))+'</span></td><td>'+(url(s.closeSource)?'<a target="_blank" rel="noopener noreferrer" href="'+H(url(s.closeSource))+'">查看来源 ↗</a>':'尚无收盘快照')+'</td></tr>'}
 html+='</tbody></table></div><div class="columns" style="margin-top:20px"><div class="card pad"><h3>数字来源分层</h3><div class="steps"><div><b>01 / 当日市场行情</b><br><span>独立获取收盘价与日期；不把行情当目标价</span></div><div><b>02 / 历史独立模型</b><br><span>存储当时的估值年份、区间与假设；缺失则留空</span></div><div><b>03 / 机构估值</b><br><span>只有能核验机构及来源时才纳入券商列表</span></div></div></div><div class="card pad"><h3>研究档案</h3><p>已从其他聊天中恢复部分摘要：紫金矿业、紫金黄金国际、中国黄金国际、中国宏桥、云铝股份、哈尔滨电气、阳光电源、中微公司、宁德时代。</p><p>每份文档都注明研究日期与复原范围；这不是对所有旧聊天的完整逐字导出。</p><button class="button" data-action="reports">进入报告库 →</button></div></div>';
 return html;
}
function valuation(){
 const s=st(active)||data.stocks[0],m=model(s.id),localRow=local.scenarios[active]||{};
 let html='<div class="section-head" style="margin-top:0"><div><h2>历史独立估值</h2><p>基于此前聊天检索结果重建；不填补无法恢复的目标价格</p></div><span class="tag '+(m.status==='historical'?'green':'amber')+'">'+H(modelStatus(s))+'</span></div><div class="tickers">';
 for(const t of data.stocks)html+='<button class="ticker '+(t.id===s.id?'selected':'')+'" data-ticker="'+H(t.id)+'"><b>'+H(t.short)+'</b><small>'+H(t.id)+'</small></button>';
 html+='</div><div class="company-head"><div><small class="eyebrow">'+H(s.theme)+'</small><h2>'+H(s.short)+'</h2><p>'+H(s.note)+'</p></div><div class="spot"><small>最后记录的收盘价 · '+H(s.currency)+'</small><strong>'+(s.close==null?'暂未抓取':H(s.currencySymbol)+F(s.close))+'</strong><span>'+H(stockDate(s))+' · '+H(s.market)+'</span></div></div>';
 html+='<div class="card pad" style="margin-bottom:17px"><div class="tag">'+H(m.asOf)+' 历史研究</div>　<span class="tag">'+H(m.horizon)+'</span><p>'+H(m.method)+'</p><p class="subtle">区间反映历史模型假设，不能直接视为最新券商目标价，也不保证仍适用。</p></div>';
 html+='<div class="scenarios">';
 const rows=[['bear','悲观情景','不利条件 / 估值较低'],['base','基准情景','中性假设 / 估值中枢'],['bull','乐观情景','经营超预期 / 估值较高']];
 for(const [id,label,desc] of rows){const lo=m[id+'Low'],hi=m[id+'High'];const saved=localRow[id];const pct=moveRange(lo,hi,s.close);html+='<div class="card scenario '+id+'"><label>'+label+'</label><strong style="font-size:23px">'+(lo==null?'待补充':fmtRange(lo,hi,s.currencySymbol))+'</strong><span class="impact" style="font-size:16px">'+H(pct)+'</span><small>'+H(desc)+' · 历史估值</small><div class="form-group"><label for="trial-'+id+'">个人试算价（另存，不更改历史数据）</label><input id="trial-'+id+'" data-scenario="'+id+'" type="number" min="0.01" step="0.01" placeholder="自行输入" value="'+H(saved??'')+'"></div>'+(saved!=null?'<p class="subtle">个人试算：'+H(s.currencySymbol)+F(saved)+' / '+PS(P(saved,s.close))+'</p>':'')+'</div>'}
 html+='</div><div class="columns" style="margin-top:18px"><div class="card pad"><h3>历史区间结构</h3><p class="subtle">原币：'+H(s.currency)+' · 无模型则不画柱状图</p>';
 let values=[['收盘价',s.close,'#8399b9'],['悲观估值上限',m.bearHigh,'#ff8794'],['基准估值上限',m.baseHigh,'#5c8dff'],['乐观估值上限',m.bullHigh,'#4ac8b3']];let max=Math.max(1,...values.map(x=>Number(x[1])||0));
 for(const [label,n,color] of values){const valid=n!=null&&Number(n)>0;const w=valid?Math.min(100,100*n/max):0;html+='<div class="bar-row"><span style="font-size:11px">'+H(label)+'</span><div class="bar"><div class="fill" style="width:'+w+'%;background:'+color+'"></div></div><span class="right">'+(valid?H(s.currencySymbol)+F(n):'—')+'</span></div>'}
 html+='</div><div class="card pad"><h3>历史假设和个人笔记</h3><p>'+H(m.assumptions||'相关历史假设尚未恢复。')+'</p><div class="form-group"><label for="notes">我的笔记（仅保存本机）</label><textarea id="notes" placeholder="记录新的核查事项">'+H(localRow.notes||'')+'</textarea></div><div class="actions"><button class="button primary" data-action="save-notes">保存个人笔记</button></div></div></div>';
 const records=(data.valuation_history||[]).filter(x=>x.stockId===s.id);
 html+='<div class="card pad" style="margin-top:18px"><h3>历史估值版本（保留不同假设和日期）</h3>';
 if(!records.length)html+='<p>暂未找到独立的其他日期版本。</p>';
 for(const v of records){html+='<div style="border-top:1px solid #293954;padding:14px 0"><b>'+H(v.asOf)+' · '+H(v.title)+'</b><p>'+H(v.horizon)+' · '+(v.kind==='conditional_model'?'条件模型 '+H(s.currencySymbol)+F(v.value):'悲观 '+fmtRange(v.bearLow,v.bearHigh,s.currencySymbol)+' / 基准 '+fmtRange(v.baseLow,v.baseHigh,s.currencySymbol)+' / 乐观 '+fmtRange(v.bullLow,v.bullHigh,s.currencySymbol))+'</p><p class="subtle">'+H(v.assumptions)+'</p></div>'}
 html+='</div><div class="card pad" style="margin-top:18px"><h3>机构目标价</h3><p>机构数据与历史独立模型完全分离；尚无真正导入的券商数据不会显示为机构目标价。</p><button data-action="brokers" class="button">查看券商记录 →</button></div>';
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
 let html='<div class="section-head" style="margin-top:0"><div><h2>独立研究报告（历史摘要）</h2><p>已归档历史聊天估值摘要，部分数值与假设可恢复；不是聊天报告逐字完整导出</p></div><span class="tag amber">历史报告 · 摘要重建</span></div><div class="report-grid">';
 for(const r of data.reports)html+='<article class="card report-card"><small>'+H(r.date)+' · '+H(r.type)+'</small><h3>'+H(r.title)+'</h3><p>'+H(r.summary)+'</p><button class="button" data-report="'+H(r.id)+'">阅读报告 →</button></article>';
 html+='</div><div class="card pad" style="margin-top:19px" id="reportReader"><h3>报告阅读</h3><div class="report-body" id="reportText">选择上方报告阅读。</div></div><div class="card pad" style="margin-top:19px"><h3>外部研报来源</h3><p><a href="https://data.eastmoney.com/report/stock.jshtml" target="_blank" rel="noopener noreferrer">东方财富个股研报 ↗</a>　 <a href="https://www.hkexnews.hk/" target="_blank" rel="noopener noreferrer">港交所公告 ↗</a>　 <a href="https://www.cninfo.com.cn/" target="_blank" rel="noopener noreferrer">巨潮资讯 ↗</a></p><p>未获授权的券商付费 PDF 不上传至公开仓库，只记录标题、机构、时间与合法原文链接。</p></div>';
 return html;
}
function sources(){return '<div class="source-grid"><div class="card"><h3>行情快照</h3><p>已抓取的收盘行情分别保存价格与日期；新加入股票在成功抓取前显示“待抓取”，市场休市或接口失败则保留旧价与原日期。</p></div><div class="card"><h3>历史独立估值</h3><p>清空了所有演示价格。仅导入可从历史聊天检索到的实际估值推演，按研究日期、假设、股价币种分开存档，并注明是检索摘要重建而非逐字原稿。</p></div><div class="card"><h3>券商目标价</h3><p>可手工保存机构记录，初始券商目标价及一致预期为空。富途 OpenD 接口需在有权限的电脑上运行并实际验证。</p></div><div class="card"><h3>内容与版权</h3><p>原创报告以 Markdown 版本化保存。外部机构研报默认只存元数据、公开摘要和合法来源链接；不转载无授权 PDF。</p></div></div><div class="card pad" style="margin-top:18px"><h3>有关本地编辑</h3><p>页面上的数据输入只写入浏览器 localStorage，不会自动提交到 GitHub。顶部按钮可以导出 JSON，用于后续合并到仓库的研究数据。</p><p>参阅仓库 <a href="https://github.com/moliq1/ai-investment-research/blob/main/docs/DATA_SOURCES.md">数据来源与格式规范 ↗</a>。</p></div>'}
function render(){$('view').innerHTML=({home,valuation,brokers,reports,sources})[view]()}
async function readReport(id){const r=data.reports.find(x=>x.id===id);if(!r||!/^reports\/[a-z0-9-]+\.md$/.test(r.path))return;const el=$('reportText');if(!el)return;el.textContent='正在读取…';try{const res=await fetch(r.path);if(!res.ok)throw Error('HTTP '+res.status);el.textContent=await res.text();el.scrollIntoView({behavior:'smooth',block:'start'})}catch(e){el.textContent='暂时无法加载研究内容：'+e.message}}
document.addEventListener('click',e=>{const btn=e.target.closest('[data-nav],[data-action],[data-stock],[data-ticker],[data-report],[data-del]');if(!btn)return;if(btn.dataset.nav){navigate(btn.dataset.nav)}else if(btn.dataset.action){if(btn.dataset.action==='save-notes'){local.scenarios[active]=Object.assign({},local.scenarios[active],{notes:$('notes').value});persist();toast('个人笔记已保存在本机')}else navigate(btn.dataset.action)}else if(btn.dataset.stock){e.preventDefault();active=btn.dataset.stock;navigate('valuation')}else if(btn.dataset.ticker){active=btn.dataset.ticker;render()}else if(btn.dataset.report){readReport(btn.dataset.report)}else if(btn.dataset.del){local.brokers=local.brokers.filter(x=>x.uid!==btn.dataset.del);persist();render();toast('已移除本地记录')}});
document.addEventListener('change',e=>{if(e.target.matches('[data-scenario]')){const value=Number(e.target.value);if(e.target.value.trim()===''){delete local.scenarios[active]?.[e.target.dataset.scenario];persist();render();return}if(!Number.isFinite(value)||value<=0){toast('个人试算价应大于零');render();return}local.scenarios[active]=Object.assign({},local.scenarios[active],{[e.target.dataset.scenario]:value});persist();render()}});
document.addEventListener('submit',e=>{if(e.target.id!=='brokerForm')return;e.preventDefault();const d=new FormData(e.target),t=Number(d.get('target')),u=String(d.get('url')||'').trim();if(!st(String(d.get('stock')))||!Number.isFinite(t)||t<=0||(u&&!url(u))){toast('请检查目标价和来源链接');return}local.brokers.push({uid:'local-'+Date.now(),stockId:String(d.get('stock')),institution:String(d.get('institution')).trim(),target:t,date:String(d.get('date')),rating:String(d.get('rating')),url:url(u),origin:'手工录入'});persist();render();toast('已保存到当前浏览器')});
$('export').onclick=()=>{const obj={date:new Date().toISOString(),disclaimer:'历史对话估值摘要重建；个人试算只存本机，不改历史模型',...local};const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});const a=document.createElement('a');const u=URL.createObjectURL(blob);a.href=u;a.download='alpha-atlas-user-edits.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),2000)};
async function start(){try{const names=['stocks','scenarios','brokers','reports','consensus','valuation_history'];const entries=await Promise.all(names.map(async x=>{const r=await fetch('data/'+x+'.json',{cache:'no-cache'});if(!r.ok)throw Error('data/'+x+'.json · HTTP '+r.status);return await r.json()}));names.forEach((k,i)=>data[k]=entries[i]);if(!data.stocks.length)throw Error('股票数据为空');$('latestDate').textContent=data.stocks.map(s=>s.closeDate).filter(Boolean).sort().slice(-1)[0]||'—';render()}catch(e){$('notice').textContent='加载数据失败：'+e.message+'。请通过 GitHub Pages 或本地 HTTP 服务打开，不要直接双击源码 index.html。';$('view').innerHTML='<p class="empty">数据未能加载，请检查网络或 GitHub Pages 部署状态。</p>'}}
start();
