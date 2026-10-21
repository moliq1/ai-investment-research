/* Canonical Markdown valuation dashboard, no additional runtime dependencies. */
(function () {
  'use strict';
  const mdPath='sources/AI投研_公司估值情景汇总.md';
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\u0027':'&#39;'}[c]));
  const tidy=v=>String(v||'').replace(/\*\*/g,'').trim();
  const cells=v=>String(v).split('|').slice(1,-1).map(tidy);
  const isDivider=v=>/^\|\s*[-: |]+\|?\s*$/.test(v);
  const normalCode=v=>String(v||'').trim().replace(/^0+(?=\d)/,'').toUpperCase();
  const amount=v=>{const m=tidy(v).replace(/,/g,'').match(/\d+(?:\.\d+)?/);return m?Number(m[0]):null};
  const range=v=>{const numbers=tidy(v).replace(/,/g,'').match(/\d+(?:\.\d+)?/g)||[];return numbers.length?{low:Number(numbers[0]),high:Number(numbers[1]||numbers[0])}:null};
  function parse(markdown) {
    const lines=markdown.split(/\r?\n/);
    const header=lines.findIndex(x=>/^\|\s*公司\s*\|\s*代码\s*\|/.test(x));
    if(header<0)throw Error('未找到估值总表（要求 | 公司 | 代码 | 表头）');
    const rows=[],seen=new Set();
    for(let i=header+1;i<lines.length&&lines[i].startsWith('|');i++){
      if(isDivider(lines[i]))continue;
      const c=cells(lines[i]);if(c.length<12)continue;
      const code=c[1],id=normalCode(code);
      if(seen.has(id))throw Error('估值总表出现重复证券代码：'+code);
      const bear=range(c[7]),base=range(c[8]),bull=range(c[9]);
      if(!bear||!base||!bull)throw Error(code+' 尚无完整三情景估值，请勿添加占位记录');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(c[4])||amount(c[5])==null)throw Error(code+' 缺少有效参考价或日期');
      seen.add(id);
      rows.push({name:c[0],code,normalizedCode:id,sector:c[2],market:c[3],closeDate:c[4],
        close:amount(c[5]),closeText:c[5],horizon:c[6],bear,base,bull,
        method:c[10],updated:c[11],currency:c[5].includes('HK$')?'HK$':c[5].includes('¥')?'¥':(code.toUpperCase().endsWith('.HK')?'HK$':'¥')});
    }
    const sectionStarts=[];
    lines.forEach((line,i)=>{const m=line.match(/^###\s+\d+\.\s+(.+?)[（(]([^)）]+)[)）]\s*$/);if(m)sectionStarts.push({idx:i,code:normalCode(m[2])})});
    for(const item of rows){
      const s=sectionStarts.find(x=>x.code===item.normalizedCode);
      if(!s)throw Error(item.code+' 缺少对应分公司假设章节');
      const next=lines.findIndex((l,i)=>i>s.idx&&(/^###\s+\d+\.\s+/.test(l)||/^##\s+[三四五六七八九十]+[、.]/.test(l)));
      const sub=lines.slice(s.idx,next<0?lines.length:next);
      const tableIdx=sub.findIndex(l=>/^\|\s*假设项目\s*\|/.test(l));
      item.assumptions=[];
      if(tableIdx>=0)for(let i=tableIdx+1;i<sub.length&&sub[i].startsWith('|');i++){
        if(isDivider(sub[i]))continue;
        const c=cells(sub[i]);if(c.length>=4)item.assumptions.push({label:c[0],bear:c[1],base:c[2],bull:c[3]});
      }
      const textOf=(pattern)=>{const at=sub.findIndex(l=>pattern.test(l));if(at<0)return [];let end=sub.findIndex((l,i)=>i>at&&/^####\s/.test(l));if(end<0)end=sub.length;return sub.slice(at+1,end).map(x=>x.trim()).filter(Boolean)};
      item.logic=textOf(/^####.*核心估值逻辑/).filter(l=>/^\d+[.)、]/.test(l)).map(l=>tidy(l.replace(/^\d+[.)、]\s*/,'')));
      const tracking=textOf(/^####.*核验节点/).filter(l=>l.startsWith('|')&&!isDivider(l)&&!/\|\s*跟踪事项\s*\|/.test(l));
      item.tracking=tracking.map(cells).filter(c=>c.length>=3).map(c=>({event:c[0],effect:c[1],evidence:c[2]}));
      item.note=sub.find(l=>/^\*\*当前研究结论/.test(l))||'';
      const src=sub.join('\n');
      item.chatTitle=(src.match(/原研究对话：《([^》]+)》/)||[])[1]||'';
      item.archiveLink=(src.match(/\[GitHub 历史研究摘要（不是原始 ChatGPT 聊天）\]\((https:\/\/github\.com\/[^)]+)\)/)||[])[1]||'';
      const recorded=item.assumptions.find(a=>a.label.includes('每股估值'));
      if(recorded){
        for(const scenario of ['bear','base','bull']){
          const r=range(recorded[scenario]);
          if(r&&item[scenario]&&(Math.abs(r.low-item[scenario].low)>0.1||Math.abs(r.high-item[scenario].high)>0.1))
            throw Error(item.code+' 估值总表与详细假设中的'+scenario+'估值不一致');
        }
      }
    }
    if(!rows.length)throw Error('估值总表尚无公司记录');
    const version=(markdown.match(/文档版本\*\*：([^\s\n]+)/)||[])[1]||'—';
    const sectorOrder=['有色金属与矿业','半导体与电子材料','电力装备与电源','新能源与储能'];
    rows.sort((a,b)=>sectorOrder.indexOf(a.sector)-sectorOrder.indexOf(b.sector)||b.updated.localeCompare(a.updated));
    return {items:rows,version};
  }
  const money=(v,c)=>v==null?'—':c+v.toLocaleString('zh-CN',{minimumFractionDigits:v%1?1:0,maximumFractionDigits:2});
  const val=(r,c)=>!r?'待补充':(r.low===r.high?money(r.low,c):money(r.low,c)+' – '+money(r.high,c));
  const diff=(r,p)=>!r||!p?'—':(r.low===r.high?pct(r.low,p):pct(r.low,p)+' ~ '+pct(r.high,p));
  const pct=(p,b)=>(p>=b?'+':'')+((p/b-1)*100).toFixed(1)+'%';
  function render(master,stocks,selected){
    if(!master||!master.items||!master.items.length)return '<div class="card pad"><h3>估值档案尚未加载</h3><p>请检查仓库 sources 下的 Markdown 文件。</p></div>';
    const items=master.items,chosen=items.find(x=>x.normalizedCode===normalCode(selected))||items[0];
    const complete=items.filter(x=>x.bear&&x.base&&x.bull).length;
    const snap=(stocks||[]).find(x=>normalCode(x.id)===chosen.normalizedCode);
    let html='<div class="master-intro"><div><span class="tag green">MARKDOWN · SINGLE SOURCE OF TRUTH</span><h2>公司估值情景总表</h2><p>所有目标区间与假设均直接读取 GitHub 中的估值 Markdown；参考价是文档记录日价格，不是实时行情。</p></div><a class="button master-source" href="'+mdPath+'" target="_blank" rel="noopener noreferrer">打开原始 Markdown ↗</a></div>';
    html+='<div class="master-stats"><div><small>已登记公司</small><strong>'+items.length+'</strong><span>仅展示完整情景研究</span></div><div><small>三情景估值</small><strong>'+complete+'</strong><span>已完整建模公司/证券</span></div><div><small>文档版本</small><strong>'+esc(master.version)+'</strong><span>保留 Git 提交历史</span></div><div><small>最近记录更新</small><strong class="date">'+esc(items.map(x=>x.updated).sort().slice(-1)[0])+'</strong><span>不等于行情更新</span></div></div>';
    html+='<div class="section-head"><div><h2>全部公司 · 估值对照</h2><p>点击证券查看假设、估值范围和验证事项</p></div><input class="master-search" type="search" aria-label="筛选公司" placeholder="搜索公司或证券代码..." data-master-search></div>';
    html+='<div class="card table-wrap master-table"><table><thead><tr><th>公司 / 代码</th><th>行业</th><th>参考价 · 日期</th><th>悲观</th><th>基准</th><th>乐观</th><th>基准预期差*</th><th>估值年度</th></tr></thead><tbody>';
    let priorSector='';for(const x of items){if(priorSector!==x.sector){html+='<tr class="master-sector-row" data-master-group="'+esc(x.sector)+'"><td colspan="8"><b>'+esc(x.sector)+'</b><small>按研究日期倒序</small></td></tr>';priorSector=x.sector}html+='<tr data-master-row="'+esc((x.name+' '+x.code).toLowerCase())+'" class="'+(x.code===chosen.code?'master-current':'')+'"><td><button class="master-row-link" data-master-stock="'+esc(x.code)+'"><b>'+esc(x.name)+'</b><span>'+esc(x.code)+' · '+esc(x.market)+(x.bear&&x.base&&x.bull?' · 完整三情景':' · 非完整记录')+'</span></button></td><td class="master-sector-cell">'+esc(x.sector)+'</td><td><b>'+esc(x.closeText)+'</b><span class="cell-sub">'+esc(x.closeDate)+'</span></td><td class="m-bear">'+esc(val(x.bear,x.currency))+'</td><td class="m-base">'+esc(val(x.base,x.currency))+'</td><td class="m-bull">'+esc(val(x.bull,x.currency))+'</td><td>'+esc(diff(x.base,x.close))+'</td><td>'+esc(x.horizon)+'</td></tr>';}
    html+='</tbody></table></div><p class="master-fine">* 预期差仅按 Markdown 内参考收盘价计算，未包含股息，不代表预期收益率或交易建议。</p>';
    html+='<section class="master-detail" id="masterDetail"><div class="master-company"><div><div class="eyebrow">VALUATION CASE STUDY / '+esc(chosen.horizon)+'</div><h2>'+esc(chosen.name)+' <span>'+esc(chosen.code)+'</span></h2><p>'+esc(chosen.method)+'</p></div><div class="master-spot"><small>文档参考价 · '+esc(chosen.closeDate)+'</small><strong>'+esc(chosen.closeText)+'</strong><span>'+(snap&&snap.close!=null?'行情快照：'+esc(snap.currencySymbol)+esc(Number(snap.close).toFixed(2))+' ('+esc(snap.closeDate||'')+')':'行情快照未取得')+'</span></div></div>';
    html+='<div class="master-scenarios">';
    for(const [id,title,sub] of [['bear','悲观情景','压力测试'],['base','基准情景','主要判断'],['bull','乐观情景','有利条件']]){
      const r=chosen[id];
      html+='<article class="card master-scenario '+id+'"><div class="m-scenario-top"><span>'+title+'</span><small>'+sub+'</small></div><strong>'+esc(val(r,chosen.currency))+'</strong><div class="m-return">'+esc(diff(r,chosen.close))+' <small>相对文档参考价</small></div>' + (r ? '<div class="m-rail">' + (chosen.close ? '<span style="left:'+(Math.min(100,100*chosen.close/Math.max(1,...['bear','base','bull'].map(k=>chosen[k]?.high||0).concat([chosen.close*1.2]))))+'%" class="m-marker"></span>':'') + '<i style="left:'+(100*r.low/Math.max(1,...['bear','base','bull'].map(k=>chosen[k]?.high||0).concat([chosen.close||1])))+'%;width:'+Math.max(1,100*(r.high-r.low)/Math.max(1,...['bear','base','bull'].map(k=>chosen[k]?.high||0).concat([chosen.close||1])))+'%"></i></div>':'<p class="master-missing">尚未形成可追溯的该档估值</p>')+'</article>';
    }
    html+='</div><div class="master-two"><div class="card pad"><h3>三种情景 · 核心假设</h3><div class="table-wrap"><table class="master-assumptions"><thead><tr><th>模型参数</th><th>悲观</th><th>基准</th><th>乐观</th></tr></thead><tbody>';
    for(const a of chosen.assumptions)html+='<tr><td>'+esc(a.label)+'</td><td>'+esc(a.bear)+'</td><td>'+esc(a.base)+'</td><td>'+esc(a.bull)+'</td></tr>';
    html+='</tbody></table></div><p class="master-fine">价格及财务参数均来自原始文档；情景利润属于分析假设，并非上市公司业绩指引。</p></div>';
    html+='<div class="card pad"><h3>投资逻辑与待验证事项</h3>';
    if(chosen.logic.length)html+='<ol class="master-logic">'+chosen.logic.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ol>';
    if(chosen.tracking.length)html+='<h4>关键核验节点</h4><div class="master-track">'+chosen.tracking.map(x=>'<div><b>'+esc(x.event)+'</b><p>'+esc(x.effect)+'</p><small>需核验：'+esc(x.evidence)+'</small></div>').join('')+'</div>';
    if(!chosen.logic.length&&!chosen.tracking.length)html+='<p>该公司已登记估值，后续可在 Markdown 中补充投资逻辑及验证节点。</p>';
    html+='</div></div><div class="master-chat-source"><strong>原始聊天与研究来源</strong><p>《'+esc(chosen.chatTitle||chosen.name+'估值分析')+'》 · '+esc(chosen.updated)+'。原始 ChatGPT 会话链接尚未取得；请勿将研究摘要视为原始聊天。</p>'+(chosen.archiveLink?'<a href="'+esc(chosen.archiveLink)+'" target="_blank" rel="noopener noreferrer">查看 GitHub 历史研究摘要 ↗</a>':'')+'</div><div class="master-foot"><span>最近更新 '+esc(chosen.updated)+' · '+esc(chosen.horizon)+' · 独立研究情景，不是券商目标价</span><a target="_blank" rel="noopener noreferrer" href="https://github.com/moliq1/ai-investment-research/blob/main/sources/AI%E6%8A%95%E7%A0%94_%E5%85%AC%E5%8F%B8%E4%BC%B0%E5%80%BC%E6%83%85%E6%99%AF%E6%B1%87%E6%80%BB.md">GitHub 查看 / 编辑 ↗</a></div></section>';
    return html;
  }
  document.addEventListener('input',function(e){if(!e.target.matches('[data-master-search]'))return;const q=e.target.value.trim().toLowerCase();document.querySelectorAll('[data-master-row]').forEach(row=>row.hidden=!row.dataset.masterRow.includes(q));document.querySelectorAll('[data-master-group]').forEach(row=>{let next=row.nextElementSibling,visible=false;while(next&&!next.hasAttribute('data-master-group')){if(next.hasAttribute('data-master-row')&&!next.hidden)visible=true;next=next.nextElementSibling}row.hidden=!visible});});
  window.MasterValuation={parse,render};
})();