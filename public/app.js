const $=s=>document.querySelector(s),app=$('#app');
const IC={search:'<circle cx=7 cy=7 r=4.5 /><path d="M10.5 10.5l3 3" />',ai:'<path d="M6 2l1.2 3L10 6.2 7.2 7.4 6 10.5 4.8 7.4 2 6.2 4.8 5z" /><path d="M11.5 9l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8L9 11.5l1.8-.7z" />',bolt:'<path d="M2 12l4-4 3 3 5-6" /><path d="M2 14.5h12" />',feed:'<path d="M4 2h6l3 3v9H4z" /><path d="M10 2v3h3M6 9h5M6 11.5h5" />',trophy:'<path d="M5 2h6v4a3 3 0 01-6 0zM3 3h2v2a2 2 0 01-2-2zM13 3h-2v2a2 2 0 002-2zM8 9v3M5 14h6" />',journal:'<rect x=2.5 y=3.5 width=11 height=10 rx=1.8 /><path d="M5.5 2v3M10.5 2v3M2.5 6.5h11" />',term:'<rect x=2.5 y=7 width=3 height=6.5 rx=.8 /><rect x=6.500 y=2.500 width=3 height=11 rx=.8 /><rect x=10.500 y=5 width=3 height=8.500 rx=.8 />',help:'<circle cx=8 cy=8 r=6 /><path d="M6.3 6.4c0-1 .8-1.6 1.7-1.6s1.7.6 1.7 1.5c0 1.2-1.7 1.3-1.7 2.5M8 11v.1" />',arrow:'<path d="M5 11l6-6M6 5h5v5" />',users:'<circle cx=6 cy=6 r=2.3 /><path d="M2 13c0-2.5 2-4 4-4s4 1.5 4 4M11 4a2.2 2.2 0 010 4M12 9.5c1.5.4 2.5 1.7 2.5 3.5" />',plus:'<path d="M8 3.5v9M3.5 8h9" />',x:'<path d="M4 4l8 8M12 4l-8 8" />',down:'<path d="M4 6l4 4 4-4" />',share:'<circle cx=4 cy=8 r=1.6 /><circle cx=12 cy=4 r=1.6 /><circle cx=12 cy=12 r=1.6 /><path d="M5.5 7.2l5-2.4M5.5 8.8l5 2.4" />',bot:'<rect x=3 y=5 width=10 height=8 rx=2 /><path d="M8 2v3M6 9h.01M10 9h.01" />',sort:'<path d="M8 3v9M4.5 8.5L8 12l3.5-3.5" />',chr:'<path d="M6 4l4 4-4 4" />',check:'<path d="M3.5 8.5l3 3 6-7" />'};
const ic=(n,s=14)=>`<svg width=${s} height=${s} viewBox="0 0 16 16" fill=none stroke=currentColor stroke-width=1.3 stroke-linecap=round stroke-linejoin=round>${IC[n]}</svg>`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
const big=n=>Math.abs(n)>=1e15?Math.abs(n).toExponential(2).replace('e+','e'):Math.abs(Math.round(n)).toLocaleString('en-US');
const usd=n=>(n<0?'-':'')+'$'+big(n),sg=n=>(n<0?'-':'+')+'$'+big(n);
const abbr=n=>{const a=Math.abs(n),s=n<0?'-':'+';return a>=1e6?s+'$'+(a/1e6).toFixed(1)+'m':a>=1e3?s+'$'+(a/1e3).toFixed(1)+'k':s+'$'+Math.round(a)};
const short=a=>a.slice(0,6)+'…'+a.slice(-4),cls=n=>n>=0?'pos':'neg';
const dt=ts=>new Date(ts*1000).toLocaleDateString('en',{month:'short',day:'numeric'});
const ago=ts=>{const d=(Date.now()/1000-ts)/86400;return d<1?'today':d<60?Math.floor(d)+'d ago':Math.floor(d/30)+'mo ago'};
const COL=['#14a3c4','#ec4899','#e8a91a','#3b82f6','#2fa84f','#a855f7'];
const av=(img,a,sz)=>{const st=sz?` style="width:${sz}px;height:${sz}px"`:'';return img?`<span class=av${st}><img src="${esc(img)}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{innerHTML:gog('${a}')}).firstChild)"></span>`:`<span class=av${st}>${gog(a)}</span>`};
const gog=(a,c)=>`<svg viewBox="0 0 40 40"><circle cx=20 cy=20 r=20 fill="${c||COL[parseInt(a.slice(2,4),16)%6]}" /><rect x=8 y=14 width=24 height=13 rx=6.5 fill=#fff /><path d="M11 18.5c0-1 .8-1.7 1.8-1.7h14.4c1 0 1.8.7 1.8 1.7v1.700c0 1.700-1.300 3-3 3-1.200 0-1.900-.5-2.600-1.200-.700-.700-1.500-1-2.400-1s-1.700.3-2.400 1c-.7.700-1.400 1.200-2.600 1.200-1.700 0-3-1.300-3-3z" fill=#1b2a8f /></svg>`;
const api=async p=>{try{const[i,...q]=p.split('?');const r=await fetch('/api/proxy?u='+encodeURIComponent(i)+(q.length?'&'+q.join('?'):''));return await r.json()}catch(e){return[]}};
const classify=t=>/bitcoin|btc|ethereum|\beth\b|solana|crypto|xrp|token|fdv|airdrop/i.test(t)?'Crypto':/elect|president|minister|trump|biden|senate|congress|vote|party|governor|mayor|ceasefire|shutdown|tariff|war\b|fed\b/i.test(t)?'Politics':/win on|\bvs\.?\b|\bfc\b|nba|nfl|mlb|nhl|ufc|open\b|cup|league|champion|ballon|match|game|series|bowl|prix|\bf1\b|trophy|title|draw/i.test(t)?'Sports':'Other';
const LS={get(k,d){try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
let fol=LS.get('fol',{});
document.addEventListener('click',e=>{const f=e.target.closest('[data-follow]');if(!f)return;e.preventDefault();const[a,n]=f.dataset.follow.split('|');fol[a]?delete fol[a]:fol[a]=n;LS.set('fol',fol);route(true)});

/* ---------- chart ---------- */
function lineChart(el,vals,o={}){
  const w=el.clientWidth||600,h=o.h||200,L=o.L??2,R=o.R??16,T=o.T??10,B=o.B??10,col=o.color||'#00d26a',n=vals.length;
  if(n<2){el.innerHTML='';return}
  let mn=Math.min(...vals),mx=Math.max(...vals);if(o.zero)mn=Math.min(mn,0);const rg=(mx-mn)||1;
  const X=i=>L+i/(n-1)*(w-L-R),Y=v=>T+(1-(v-mn)/rg)*(h-T-B);
  const d=vals.map((v,i)=>(i?'L':'M')+X(i).toFixed(1)+' '+Y(v).toFixed(1)).join('');
  const ticks=o.fmt?[0,1,2,3].map(k=>mx-rg*k/3):[];
  const dot=i=>`<circle cx=${X(i)} cy=${Y(vals[i])} r=7 fill="${col}" opacity=.18 /><circle cx=${X(i)} cy=${Y(vals[i])} r=3.2 fill="${col}" />`;
  el.innerHTML=`<svg width=${w} height=${h}>${ticks.map(v=>`<text x=${o.la=='l'?17:(L-8)/2+0} y=${Y(v)+3} fill=#9a9aa6 font-size=${o.tf||7.5} text-anchor=${o.la=='l'?'start':'middle'} font-family="Onest,system-ui,sans-serif">${o.fmt(v)}</text>`).join('')}
  <path d="${d}" fill=none stroke="${col}" stroke-width=${o.sw||1.4} stroke-linejoin=round stroke-linecap=round /><g id=hv>${dot(n-1)}</g></svg>${o.endLabel?`<div class=endl style="left:${X(n-1)+11}px;top:${Y(vals[n-1])-(o.endH||12)}px;color:${col};font-size:${o.endSize||22}px">${o.endLabel}</div>`:''}`;
  if(o.onHover){el.onmousemove=e=>{const r=el.getBoundingClientRect(),i=Math.max(0,Math.min(n-1,Math.round((e.clientX-r.left-L)/(w-L-R)*(n-1))));el.querySelector('#hv').innerHTML=dot(i);o.onHover(i)};
    el.onmouseleave=()=>{el.querySelector('#hv').innerHTML=dot(n-1);o.onHover(n-1)}}
}

/* ---------- data ---------- */
const CACHE={};const cached=(k,f)=>CACHE[k]??=f();
const closedOf=(a,pages=3)=>cached('c'+a+pages,async()=>(await Promise.all([...Array(pages)].map((_,i)=>api(`closed-positions?user=${a}&limit=50&offset=${i*50}&sortBy=TIMESTAMP&sortDirection=DESC`)))).flat().filter(x=>x&&x.title).sort((x,y)=>x.timestamp-y.timestamp));
// Accurate recent sample: closed positions (newest first) + resolved-but-unredeemed positions (Polymarket's closed list omits
// losers that were never redeemed, which would inflate win rates). Merged by resolution time, newest N.
const resolvedOf=(a,pages=4)=>cached('r'+a+pages,async()=>{
  const[c,r]=await Promise.all([closedOf(a,pages),Promise.all([...Array(pages>2?2:1)].map((_,i)=>api(`positions?user=${a}&redeemable=true&sizeThreshold=0&limit=200&offset=${i*200}&sortBy=RESOLVING&sortDirection=DESC`))).then(x=>x.flat().filter(p=>p&&p.title&&p.endDate))]);
  const seen=new Set(c.map(x=>x.conditionId+x.outcomeIndex));
  const extra=r.filter(p=>!seen.has(p.conditionId+p.outcomeIndex)).map(p=>({...p,totalBought:p.size,realizedPnl:p.cashPnl,timestamp:Date.parse(p.endDate)/1000})).filter(p=>p.timestamp&&p.timestamp<Date.now()/1000);
  return[...c,...extra].sort((x,y)=>y.timestamp-x.timestamp).slice(0,pages*50).reverse()});
const openOf=a=>cached('o'+a,async()=>{const r=await api(`positions?user=${a}&sizeThreshold=1&limit=100&sortBy=CURRENT&sortDirection=DESC`);return Array.isArray(r)?r:[]});
const lbOf=(per,ord,off=0)=>cached(`lb${per}${ord}${off}`,async()=>{const r=await api(`v1/leaderboard?timePeriod=${per}&orderBy=${ord}&limit=50&offset=${off}`);return Array.isArray(r)?r:[]});
let EXP;
const loadExperts=()=>EXP??=(async()=>{
  const [a,m]=await Promise.all([lbOf('ALL','PNL'),lbOf('MONTH','PNL')]);
  const seen=new Set(),lb=[...a.slice(0,10),...m.slice(0,12)].filter(t=>t.proxyWallet&&!seen.has(t.proxyWallet)&&seen.add(t.proxyWallet));
  return Promise.all(lb.map(async t=>{const[closed,open]=await Promise.all([resolvedOf(t.proxyWallet,2),openOf(t.proxyWallet)]);return{...t,closed,open,wr:closed.length?closed.filter(c=>c.realizedPnl>0).length/closed.length:0}}))})();
const statOf=a=>cached('st'+a,async()=>{const[tr,c]=await Promise.all([api(`traded?user=${a}`),resolvedOf(a,2)]);const w=c.filter(x=>x.realizedPnl>0).length,sample=c.length;return{n:tr.traded||sample,sample,wr:sample?w/sample:0,wins:w}});

/* ---------- shell ---------- */
const NAV=[['search','search','Search'],['ai','ai','AI Analyzer'],['profits','bolt','Profits'],['bot','bot','Auto Trader'],['feed','feed','Feed'],['leaderboard','trophy','Leaderboard']];
const uname=()=>LS.get('uname','Guest');
function renderNav(){const p=(location.hash.slice(2)||'profits').split('/')[0],a=(h,i,t,k)=>`<a class="nv ${p==k?'on':''}" href="#/${k}">${ic(i)}${t}</a>`;
  $('#nav').innerHTML=NAV.map(([k,i,t])=>a(0,i,t,k)).join('')+`<div class=sec>Personal</div>`+a(0,'journal','Journal','journal')+
  `<div class=sbot>${a(0,'term','Terminal','terminal')}${a(0,'help','Help','help')}<div class=usr id=usr><span class=av>${gog('0xaa','#a855f7')}</span><span>${esc(uname())}</span><span class=ch>${ic('down',12)}</span></div></div>`;
  $('#usr').onclick=()=>{const n=prompt('Display name',uname());if(n){LS.set('uname',n.slice(0,24));renderNav()}}}

/* ---------- leaderboard ---------- */
async function leaderboard(){
  const ord=LS.get('ord','PNL'),tab=LS.get('ltab','rank');
  app.innerHTML=`<div class="row sb"><div><h1>Leaderboard</h1><div class=sub>All tracked history</div></div><select class=fld id=ord style="width:121px;margin-top:-3px"><option value=PNL>Highest P&L<option value=VOL>Highest volume<option value=WR>Highest win rate</select></div>
  <div class=tabs><span data-t=rank class="${tab=='rank'?'on':''}">Rankings</span><span data-t=wins class="${tab=='wins'?'on':''}">Recent wins</span></div><div id=lb class=sub>Loading…</div>`;
  $('#ord').value=ord;$('#ord').onchange=e=>{LS.set('ord',e.target.value);leaderboard()};
  app.querySelectorAll('.tabs span').forEach(s=>s.onclick=()=>{LS.set('ltab',s.dataset.t);leaderboard()});
  const fb=(t,c='')=>fol[t.proxyWallet]?`<button class="btn u ${c}" data-follow="${t.proxyWallet}|${esc(t.userName)}">${ic('x',11)} Unfollow</button>`:`<button class="btn ${c}" data-follow="${t.proxyWallet}|${esc(t.userName)}">${ic('plus',11)} Follow</button>`;
  if(tab=='wins'){const ex=await loadExperts();if(!$('#lb'))return;const w=ex.flatMap(e=>e.closed.filter(c=>c.realizedPnl>0).map(c=>({...c,u:e}))).sort((a,b)=>b.timestamp-a.timestamp).slice(0,40);
    $('#lb').outerHTML=`<div class=tw><table><tr><th>Trader<th>Market<th class=r>Profit<th class=r>When</tr>${w.map(c=>`<tr class=tr><td><a href="#/trader/${c.u.proxyWallet}" style="font-weight:600">${esc(c.u.userName)}</a><td>${esc(c.title)} <span class=mut>— ${esc(c.outcome)}</span><td class="r pos">${sg(c.realizedPnl)}<td class="r mut">${ago(c.timestamp)}</tr>`).join('')}</table></div>`;return}
  const base=ord=='WR'?'PNL':ord;let lb=[...await lbOf('ALL',base,0),...await lbOf('ALL',base,50)];if(!$('#lb'))return;
  if(ord=='WR'&&lb.length){let done=0,i=0;const el=$('#lb');const w=async()=>{while(i<lb.length){const t=lb[i++];await statOf(t.proxyWallet);if($('#lb')===el)el.textContent=`Calculating win rates… ${++done}/${lb.length}`}};
    await Promise.all([...Array(8)].map(w));if($('#lb')!==el)return;
    const S=await Promise.all(lb.map(t=>statOf(t.proxyWallet)));lb=lb.map((t,k)=>({...t,_s:S[k]})).filter(t=>t._s.sample>=20).sort((a,b)=>b._s.wr-a._s.wr||b._s.n-a._s.n).map((t,k)=>({...t,rank:String(k+1)}))}if(!lb.length){$('#lb').textContent='Could not load data from Polymarket — try reloading.';return}
  const sv=ord=='VOL'?'vol':'pnl';
  $('#lb').outerHTML=`<div class=top3>${lb.slice(0,3).map(t=>`<div class="t3 ${fol[t.proxyWallet]?'f':''}"><div class="row sb ac" style="font-weight:700;font-size:10.5px;color:#e8e8f4;line-height:14px"><span>#${t.rank}</span><a href="#/trader/${t.proxyWallet}" style="margin-right:4px;color:#b4b4c2">${ic('arrow',15)}</a></div>
   <div style="margin-top:14px">${av(t.profileImage,t.proxyWallet)}</div><a href="#/trader/${t.proxyWallet}" class=nm style="display:block">${esc(t.userName||short(t.proxyWallet))}</a>
   <div class="pn ${cls(t[sv])}">${sg(t[sv])}</div><div class=sub style="font-size:8.5px;margin-top:6px">${ord=='VOL'?'Volume':'Resolved P&L'}</div>
   <div data-s="${t.proxyWallet}" style="margin-top:13px;height:34px;line-height:17px"><span style="font-size:13px;font-weight:700">—</span> <span class=mut style="font-size:9px">win rate</span><div class=mut style="font-size:9px">…</div></div>
   <div style="position:absolute;left:16px;right:16px;bottom:16px">${fb(t,'w')}</div></div>`).join('')}</div>
   <div class="row sb ac" style="margin:28px 0 0"><h2 style="font-size:18px">The rankings</h2><span class=sub style="margin:0">Top ${lb.length} by ${ord=='VOL'?'volume':'P&L'}</span></div>
   <div class=row style="margin-top:24px;padding-bottom:10px;font-size:9px;color:#b9b9c6;border-bottom:1px solid var(--line);align-items:center"><span style="flex:1">Trader</span><span style="width:130px;text-align:right">Resolved P&L</span><span style="width:80px;text-align:right;margin-left:16px">Win rate</span><span style="width:86px;margin-left:16px"></span></div>
   ${lb.map(t=>`<div class=lr data-r="${t.proxyWallet}"><span class=rk>${t.rank}</span>${av(t.profileImage,t.proxyWallet)}<div class=nm><a href="#/trader/${t.proxyWallet}">${esc(t.userName||short(t.proxyWallet))}</a><span data-sub>${usd(t.vol)} volume</span></div>
   <span class=pl>${sg(t[sv])}</span><div class=wr data-w><b>—</b><span>&nbsp;</span></div><span class=bt>${fb(t,'w')}</span></div>`).join('')}`;
  const io=new IntersectionObserver(es=>es.forEach(async e=>{if(!e.isIntersecting)return;io.unobserve(e.target);const a=e.target.dataset.r||e.target.dataset.s,s=await statOf(a);
    if(e.target.dataset.r){e.target.querySelector('[data-sub]').textContent=`${s.n.toLocaleString()} markets traded`;e.target.querySelector('[data-w]').innerHTML=s.sample<20?`<b>—</b><span>too few to rate</span>`:`<b>${Math.round(s.wr*100)}%</b><span>${s.wins} of last ${s.sample}</span>`}
    else e.target.innerHTML=s.sample<20?`<span style="font-size:13px;font-weight:700">—</span> <span class=mut style="font-size:9px">win rate</span><div class=mut style="font-size:9px">too few trades to rate</div>`:`<span style="font-size:13px;font-weight:700">${Math.round(s.wr*100)}%</span> <span class=mut style="font-size:9px">win rate</span><div class=mut style="font-size:9px">${s.wins} of last ${s.sample} trades</div>`}),{rootMargin:'200px'});
  document.querySelectorAll('[data-r],[data-s]').forEach(x=>io.observe(x));
}

/* ---------- profits ---------- */
async function profits(){
  const tab=LS.get('ptab','bot');
  app.innerHTML=`<h1>Profits</h1><div class=sub style="font-size:10.9px">A backtested, rules-based strategy built on every tracked trader.</div>
  <div class="tabs w"><span data-t=bot class="${tab=='bot'?'on':''}">Profit Bot</span><span data-t=all class="${tab=='all'?'on':''}">All markets</span></div><div id=pb class=sub>Loading top traders…</div>`;
  app.querySelectorAll('.tabs span').forEach(s=>s.onclick=()=>{LS.set('ptab',s.dataset.t);profits()});
  const ex=await loadExperts();if(!$('#pb'))return;
  const seen=new Set(),picks=ex.flatMap(e=>e.closed.map(c=>({...c,wr:e.wr}))).filter(c=>c.avgPrice>=.4&&c.avgPrice<=.9&&c.totalBought*c.avgPrice>=300).sort((a,b)=>a.timestamp-b.timestamp).filter(c=>{const k=c.conditionId+c.outcomeIndex;return seen.has(k)?0:(seen.add(k),1)});
  const open={};ex.forEach(e=>e.open.forEach(p=>{if(p.curPrice<.03||p.curPrice>.97||p.redeemable)return;const k=p.conditionId+p.outcomeIndex,o=open[k]??={...p,n:0,inv:0,pnl:0,wr:0};o.n++;o.inv+=p.initialValue;o.pnl+=p.cashPnl;o.wr=Math.max(o.wr,e.wr)}));
  const all=Object.values(open),multi=all.filter(o=>o.n>=2);
  if(tab=='bot')bot(picks,multi.length>=3?multi:all);else{const d=document.createElement('div');$('#pb').replaceWith(d);pickGrid(d,all,'All markets','Every open position held by the top traders.',1)}
}
function bot(picks,open){
  const wins=picks.filter(c=>c.realizedPnl>0).length,losses=picks.length-wins,ret=c=>c.realizedPnl>0?1/c.avgPrice-1:-1;
  const A=(t,l,x)=>`position:absolute;top:${t}px;left:${l}px;${x||''}`;
  $('#pb').outerHTML=`<div class=hero>
   <div class=ey style="${A(31,23)}">${ic('bot',10)} PROFIT BOT</div><span style="${A(23,0,'right:23px;left:auto;width:24px;height:24px;border:1px solid #26262e;border-radius:50%;display:grid;place-items:center;color:#9a9aa6;font-size:10px')}">?</span>
   <div style="${A(55,23)}"><div class=lab>STARTING AMOUNT</div></div><input id=s1 type=range min=10 max=1000 step=10 value=50 style="${A(78,23)}"><b id=v1 style="${A(72,164,'font-size:10.5px')}">$50</b>
   <div style="${A(55,236)}"><div class=lab>RESTAKE PER PICK</div></div><input id=s2 type=range min=1 max=25 value=15 style="${A(78,236)}"><b id=v2 style="${A(72,399,'font-size:10.5px')}">15%</b>
   <div id=fl style="${A(101,23,'font-size:9.5px;color:#d6d6e2')}"></div>
   <div id=bigv style="${A(121,23,'font-size:44px;font-weight:700;letter-spacing:-1.8px;color:var(--g);line-height:54px;white-space:nowrap')}"></div>
   <div style="${A(131,0,'right:23px;left:auto;text-align:right')}"><div id=pk style="font-size:17px;font-weight:700;letter-spacing:-.5px;line-height:20px"></div><div class=mut style="font-size:8.5px;margin-top:4px">the bot's latest resolved pick</div></div>
   <div id=real style="${A(192,23,'font-size:8.5px;color:#d6d6e2')}"></div>
   <div id=hd style="${A(210,23,'font-size:22px;font-weight:700;letter-spacing:-.7px;line-height:28px')}"></div><div id=hv2 class=pos style="${A(210,0,'right:23px;left:auto;font-size:22px;font-weight:700;letter-spacing:-.7px;line-height:28px')}"></div>
   <div id=ch class=chart style="${A(258,23,'right:23px;height:180px')}"></div>
   <div style="${A(452,23,'right:23px;border-top:1px solid #1d1d26')}"></div>
   ${[['Win rate',(wins/picks.length*100).toFixed(1)+'%','',23],['Avg return per pick','+'+(picks.reduce((s,c)=>s+ret(c),0)/picks.length*100).toFixed(1)+'%','pos',311],['Avg entry price',Math.round(picks.reduce((s,c)=>s+c.avgPrice,0)/picks.length*100)+'¢','',599]].map(([l,v,c,x])=>`<div style="${A(472,x)}"><div style="font-size:9px;color:#d6d6e2">${l}</div><div class="${c}" style="font-size:18px;font-weight:700;letter-spacing:-.6px;margin-top:9px;line-height:22px">${v}</div></div>`).join('')}</div>
  <div class="row sb ac" style="margin-top:21px;font-size:9px"><span><b style="font-size:11px">${wins}</b> <span class=mut>won</span></span><span><b style="font-size:11px">${losses}</b> <span class=mut>lost</span></span></div>
  <div style="display:flex;gap:4px;margin-top:8px"><div style="flex:${wins};height:3px;background:var(--g);border-radius:2px"></div><div style="flex:${losses};height:3px;background:#c2495a;border-radius:2px"></div></div><div id=pg></div>`;
  const run=()=>{const s=+$('#s1').value,f=+$('#s2').value/100;$('#s1').style.setProperty('--p',((s-10)/990*100)+'%');$('#s2').style.setProperty('--p',((f*100-1)/24*100)+'%');$('#v1').textContent='$'+s;$('#v2').textContent=f*100+'%';
    let b=s;const v=[s,...picks.map(c=>b*=1+f*ret(c))];
    $('#fl').textContent=`If you restaked ${f*100}% of the bankroll every pick`;
    $('#real').textContent=`Real sequence, real resolved picks since ${dt(picks[0].timestamp)}. ${f*100}% of bankroll restaked each time, not a flat amount. Built from each top trader's most recent resolved positions — an estimate, not a guarantee.`;
    const show=i=>{const t=usd(v[v.length-1]);$('#bigv').textContent=t;$('#bigv').style.fontSize=t.length>16?'26px':t.length>12?'36px':'44px';$('#pk').textContent='Pick #'+(i||picks.length);$('#hd').textContent=dt(picks[(i||picks.length)-1].timestamp);$('#hv2').textContent=sg(v[i||v.length-1]-s)};
    show(0);lineChart($('#ch'),v,{h:180,T:26,B:15,L:56,R:22,la:'c',fmt:x=>sg(x-s),onHover:i=>show(i===v.length-1?0:i)})};
  $('#s1').oninput=$('#s2').oninput=run;run();
  pickGrid($('#pg'),open,'Picks for today','Open markets where the rules are satisfied right now.');
}
function pickGrid(el,list,title,subt,inner){
  let sort=LS.get('psort','n');
  const draw=()=>{const arr=[...list].sort((a,b)=>sort=='n'?b.n-a.n||b.inv-a.inv:b.pnl/b.inv-a.pnl/a.inv).slice(0,12);
    el.innerHTML=`<div class="row sb" style="align-items:flex-end;margin:31px 0 17px"><div><h2 style="font-size:19px">${title}</h2><div class=sub style="font-size:9px;margin-top:5px">${subt}</div></div>
     <div class=row style="gap:8px"><div class=seg><span data-s=n class="${sort=='n'?'on':''}">Most experts</span><span data-s=p class="${sort=='p'?'on':''}">Most profitable</span></div><select class=fld style="width:86px"><option>Ongoing</select></div></div>
     <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:17px">${arr.map((p,i)=>`<div class=pc><div class=tp><span>${classify(p.title)}</span><a href="https://polymarket.com/event/${p.eventSlug}" target=_blank>View market ${ic('arrow',9)}</a></div>
      <div class=tt><img src="${esc(p.icon)}" alt=""><span>${esc(p.title)}</span></div><div class="sp chart" id=sp${i}></div><div class=ft><span>Polymarket</span><span>All time</span></div>
      <div class=st><div><b>${Math.round(p.wr*100)}%</b><span>top trader win rate</span></div><div><b class=pos>${usd(p.inv)}</b><span>invested</span></div><div><b>${ic('users',11)} ${p.n}</b><span>experts</span></div></div>
      <a class="bet ${/^no$/i.test(p.outcome)?'n':''}" href="https://polymarket.com/event/${p.eventSlug}" target=_blank>Bet ${esc(p.outcome).toUpperCase()} ${ic('arrow',11)}</a></div>`).join('')}</div>`;
    el.querySelectorAll('.seg span').forEach(s=>s.onclick=()=>{sort=s.dataset.s;LS.set('psort',sort);draw()});
    arr.forEach(async(p,i)=>{const h=(await api(`clob/prices-history?market=${p.asset}&interval=max&fidelity=720`)).history,c=$('#sp'+i);if(h&&c&&h.length>1)lineChart(c,h.map(x=>x.p),{h:86,T:12,B:12,L:4,R:68,color:'#6a7bff',sw:1.2,endSize:22,endH:13,endLabel:`${(p.curPrice*100).toFixed(1)}<span style="font-size:14px">%</span>`})});
  };draw();
}

/* ---------- trader ---------- */
async function trader(a){
  app.innerHTML='<div class=sub>Loading trader…</div>';
  const [closed,act,act1,offR,trR]=await Promise.all([resolvedOf(a,4),openOf(a),api(`activity?user=${a}&limit=1`),api(`v1/leaderboard?timePeriod=ALL&orderBy=PNL&user=${a}`),api(`traded?user=${a}`)]);
  const me=Array.isArray(offR)?offR[0]:null,official=me&&me.pnl!=null?me.pnl:null,traded=trR&&trR.traded;
  const name=me?.userName||act1[0]?.name||act1[0]?.pseudonym||short(a);
  let cum=0;const cs=closed.map(c=>cum+=c.realizedPnl),net=official??cum,v=[official!=null?official-cum:0,...cs.map(x=>official!=null?official-cum+x:x)],N=closed.length,inv=closed.reduce((s,c)=>s+c.totalBought*c.avgPrice,0),wins=closed.filter(c=>c.realizedPnl>0).length;
  const best=closed.reduce((b,c)=>c.realizedPnl>(b?.realizedPnl??-1e18)?c:b,null),last4=closed.slice(-4),lw=last4.filter(c=>c.realizedPnl>0).length;
  const cats={};closed.forEach(c=>{const k=classify(c.title),o=cats[k]??={n:0,w:0,p:0};o.n++;o.w+=c.realizedPnl>0;o.p+=c.realizedPnl});
  const ex=await loadExperts(),mine=new Set(closed.map(c=>c.conditionId)),sim=ex.filter(e=>e.proxyWallet!=a).map(e=>({e,o:e.closed.filter(c=>mine.has(c.conditionId)).length})).filter(x=>x.o).sort((x,y)=>y.o-x.o).slice(0,5);
  const isF=!!fol[a];
  app.classList.add('p');
  app.innerHTML=`<h1>${esc(name)}</h1><div class=row style="gap:12px;margin-top:11px;font-size:11px;align-items:center;height:16px"><a class=mut style="cursor:pointer" data-follow="${a}|${esc(name)}">${isF?'Unfollow':'Follow'}</a><a class=l id=shr style="display:flex;gap:5px;align-items:center">${ic('share',11)} Share profile card</a></div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:19px"><div class=tile><div class=sub>Net P&L${official!=null?' · all time':' · last '+N}</div><b class=${cls(net)}>${sg(net)}</b></div><div class=tile><div class=sub>Win Rate · last ${N}</div><b>${closed.length?(wins/closed.length*100).toFixed(1):0}%</b></div>
  <div class=tile><div class=sub>ROI · last ${N}</div><b class=${cls(cum)}>${inv?(cum/inv>=0?'+':'')+(cum/inv*100).toFixed(1):0}%</b></div><div class=tile><div class=sub>Markets traded</div><b>${(traded??closed.length).toLocaleString()}</b></div></div>
  <div class=pg2><div><div class=sub style="margin:2px 0 9px;font-size:9.5px;color:#d6d6e2;line-height:12px">P&L over time${official!=null?' (all-time total, recent trades plotted)':''}</div><div class="cd" style="border-radius:18px;height:220px"><div id=ch class=chart style="height:218px"></div></div>
   <div class="row ac" style="margin-top:26px;gap:10px;height:30px"><div class=row style="gap:14px;margin-right:4px;font-size:12px;font-weight:600"><span id=ta style="cursor:pointer;padding-bottom:6px">Active (${act.length})</span><span id=tc style="cursor:pointer;padding-bottom:6px">Closed</span></div>
   <input id=ps class=fld style="flex:1;height:30px;border-radius:8px;background:#0d0d11;font-size:11px" placeholder="Search positions"><button class="fld" id=so style="height:30px;border-radius:8px;background:#0d0d11">${ic('sort',11)} Profit/Loss</button></div>
   <div class=tw style="margin-top:17px;border-radius:12px"><table id=tb style="table-layout:fixed"></table></div></div>
  <div><div class=cd style="border-radius:18px;padding:15px 16px;min-height:85px;font-size:9.5px"><div class="row sb" style="line-height:14px"><span>Biggest Win (recent)</span><b class=pos>${best?sg(best.realizedPnl):'-'}</b></div><div class=sub style="font-size:8px;margin:1px 0 9px;color:#9a9aa6">${best?esc(best.title)+' — '+esc(best.outcome):''}</div><div class="row sb" style="line-height:14px"><span>Recent Form</span><b>${lw}-${last4.length-lw} (last ${last4.length})</b></div></div>
   <div class=sub style="margin:19px 0 8px;font-size:9.5px;color:#d6d6e2">Where they win · last ${N}</div><div class=tw style="border-radius:14px"><table><tr><th>Category<th class=r>Trades<th class=r>Win Rate<th class=r>Profit</tr>${Object.entries(cats).sort((x,y)=>y[1].n-x[1].n).map(([k,o])=>`<tr style="height:27px"><td>${k}<td class=r>${o.n}<td class=r>${(o.w/o.n*100).toFixed(1)}%<td class="r ${cls(o.p)}">${abbr(o.p)}</tr>`).join('')}</table></div>
   <div class=sub style="margin:19px 0 8px;font-size:9.5px;color:#d6d6e2">Similar top traders</div><div class=tw style="border-radius:14px"><table><tr><th>Trader<th class=r>Overlap<th class=r>Net P&L</tr>${sim.map(s=>`<tr style="height:28px"><td><a class=l href="#/trader/${s.e.proxyWallet}">${esc(s.e.userName||short(s.e.proxyWallet))}</a><span class=circ data-follow="${s.e.proxyWallet}|${esc(s.e.userName)}" style="${fol[s.e.proxyWallet]?'background:#0f8a4b;color:#fff':''}">${fol[s.e.proxyWallet]?ic('check',9):'+'}</span><td class=r>${s.o}<td class="r ${cls(s.e.pnl)}">${abbr(s.e.pnl)}</tr>`).join('')||'<tr style="height:28px"><td colspan=3 class=mut>No overlap with top traders</tr>'}</table></div></div></div>`;
  $('#shr').onclick=()=>{navigator.clipboard?.writeText(location.href);$('#shr').lastChild.textContent=' Link copied'};
  lineChart($('#ch'),v,{h:218,T:53,B:44,L:66,R:sg(net).length*11.2+22,la:'l',tf:8.5,fmt:x=>sg(x),endLabel:sg(net),endH:11,color:net>=0?'#00d26a':'#f0475a'});
  let mode=act.length?'a':'c',desc=true;
  const cell=(c,isA)=>{const traded=isA?c.initialValue:c.totalBought*c.avgPrice,pnl=isA?c.cashPnl:c.realizedPnl,amt=traded+pnl;
    return`<tr class=tr><td style="padding-left:13px"><a href="https://polymarket.com/event/${c.eventSlug}" target=_blank style="font-weight:500;font-size:10.5px;line-height:14px">${esc(c.title)} <span class=mut style="font-weight:400">— ${esc(c.outcome)}</span></a><div class=mut style="font-size:8px;margin-top:3px">Avg ${Math.round(c.avgPrice*100)}¢${isA?'':' · '+ago(c.timestamp)}</div>
    <td class=${isA?'mut':pnl>0?'pos':'neg'} style="font-size:11px">${isA?'Open':pnl>0?'Won':'Lost'}<td class=r style="font-size:11.2px">${usd(traded)}<td class=r><div style="font-weight:500;font-size:11.5px">${usd(amt)}</div><div class=${cls(pnl)} style="font-size:9.3px;line-height:12px">${sg(pnl)}<br>(${pnl>=0?'+':''}${traded?(pnl/traded*100).toFixed(1):0}%)</div></tr>`};
  const draw=()=>{const q=$('#ps').value.toLowerCase(),isA=mode=='a';let L=(isA?act:closed).filter(c=>c.title.toLowerCase().includes(q));
    L=[...L].sort((x,y)=>{const f=c=>isA?c.cashPnl:c.realizedPnl;return desc?f(y)-f(x):f(x)-f(y)});
    $('#ta').style.cssText=`cursor:pointer;padding-bottom:6px;color:${isA?'#fff':'#8a8a96'};${isA?'border-bottom:1px solid #6370ff':''}`;$('#tc').style.cssText=`cursor:pointer;padding-bottom:6px;color:${isA?'#8a8a96':'#fff'};${isA?'':'border-bottom:1px solid #6370ff'}`;
    $('#tb').innerHTML=`<colgroup><col style="width:260px"><col style="width:60px"><col style="width:82px"><col></colgroup><tr><th style="padding-left:13px">Market<th>Result<th class=r>Total Traded<th class=r>Amount</tr>`+(L.map(c=>cell(c,isA)).join('')||'<tr class=tr><td colspan=4 class=mut>Nothing here</tr>')};
  $('#ta').onclick=()=>{mode='a';draw()};$('#tc').onclick=()=>{mode='c';draw()};$('#ps').oninput=draw;$('#so').onclick=()=>{desc=!desc;draw()};draw();
}

/* ---------- search / AI / journal / terminal / help / feed ---------- */
async function searchPage(){
  app.innerHTML=`<h1>Search</h1><div class=sub>Find any Polymarket trader by name or wallet address.</div><form id=sf class=row style="margin:30px 0 20px;gap:10px"><input id=q class=fld placeholder="Name or 0x… address" style="flex:1;height:40px;border-radius:12px" autofocus><button class="btn" style="height:40px;border-radius:12px;padding:0 22px">Search</button></form><div id=sr></div>`;
  $('#sf').onsubmit=async e=>{e.preventDefault();const v=$('#q').value.trim();if(!v)return;
    if(/^0x[0-9a-f]{40}$/i.test(v)){location.hash='#/trader/'+v.toLowerCase();return}
    $('#sr').innerHTML='<span class=sub>Searching…</span>';const r=(await api(`gamma/public-search?q=${encodeURIComponent(v)}&search_profiles=true&search_tags=false&limit_per_type=10`)).profiles||[];
    $('#sr').innerHTML=r.length?`<div class=tw><table>${r.map(p=>`<tr class=tr style="height:52px"><td style="font-size:12px;font-weight:600"><a href="#/trader/${p.proxyWallet}">${esc(p.name||p.pseudonym)}</a><td class="r mut">${short(p.proxyWallet)}<td class=r style="width:100px"><a class=l href="#/trader/${p.proxyWallet}">View ${ic('chr',10)}</a></tr>`).join('')}</table></div>`:'<span class=sub>No traders found.</span>'}}
async function aiPage(){
  const opts=Object.entries(fol).map(([a,n])=>`<option value="${a}">${esc(n)}</option>`).join('');
  app.innerHTML=`<h1>AI Analyzer</h1><div class=sub>Rule-based read on a trader's edge, risk and style — paste a wallet or pick someone you follow.</div><form id=sf class=row style="margin:30px 0 20px;gap:10px"><input id=q class=fld placeholder="0x… wallet address" style="flex:1;height:40px;border-radius:12px"><select id=pk class=fld style="width:160px;height:40px;border-radius:12px"><option value="">Following…</option>${opts}</select><button class=btn style="height:40px;border-radius:12px;padding:0 22px">${ic('ai',13)} Analyze</button></form><div id=sr></div>`;
  $('#pk').onchange=e=>$('#q').value=e.target.value;
  $('#sf').onsubmit=async e=>{e.preventDefault();const a=$('#q').value.trim().toLowerCase();if(!/^0x[0-9a-f]{40}$/.test(a)){$('#sr').innerHTML='<span class=sub>Enter a valid 0x wallet address.</span>';return}
    $('#sr').innerHTML='<span class=sub>Analyzing…</span>';const[c,o]=await Promise.all([resolvedOf(a,3),openOf(a)]);if(!c.length){$('#sr').innerHTML='<span class=sub>No resolved trades found.</span>';return}
    const w=c.filter(x=>x.realizedPnl>0),wr=w.length/c.length,avgE=c.reduce((s,x)=>s+x.avgPrice,0)/c.length,pnl=c.reduce((s,x)=>s+x.realizedPnl,0),inv=c.reduce((s,x)=>s+x.totalBought*x.avgPrice,0),best=Math.max(...c.map(x=>x.realizedPnl)),sizes=c.map(x=>x.totalBought*x.avgPrice).sort((p,q)=>p-q),med=sizes[sizes.length>>1];
    const edge=wr-avgE,L4=c.slice(-8),lw=L4.filter(x=>x.realizedPnl>0).length,cats={};c.forEach(x=>{const k=classify(x.title);cats[k]=(cats[k]||0)+x.realizedPnl});const bc=Object.entries(cats).sort((p,q)=>q[1]-p[1])[0];
    const B=[[edge>.05?'pos':edge<0?'neg':'mut',`Edge: wins ${(wr*100).toFixed(0)}% of the time at an average entry of ${(avgE*100).toFixed(0)}¢ → ${(edge*100>=0?'+':'')+(edge*100).toFixed(1)} pts vs. implied odds.`],
      [pnl>=0?'pos':'neg',`Realized ${sg(pnl)} on ${usd(inv)} staked (${inv?(pnl/inv*100).toFixed(1):0}% ROI) across ${c.length} resolved positions.`],
      [best/Math.max(1,pnl)>.6?'neg':'pos',`Concentration: the single best win is ${(best/Math.max(1,pnl)*100).toFixed(0)}% of total profit${best/Math.max(1,pnl)>.6?' — results lean on one big bet.':' — profits are well spread.'}`],
      ['mut',`Style: ${avgE>.7?'favorite grinder (buys high-probability outcomes)':avgE<.4?'longshot hunter (buys low-probability outcomes)':'balanced mid-odds trader'}; median stake ${usd(med)}.`],
      [lw>=6?'pos':lw<=2?'neg':'mut',`Recent form: ${lw}-${L4.length-lw} over the last ${L4.length} resolved positions; ${o.length} open positions right now.`],
      ['mut',`Best category: ${bc[0]} (${sg(bc[1])}).`]];
    const score=Math.max(0,Math.min(100,Math.round(50+edge*120+(pnl>=0?10:-15)+(lw-L4.length/2)*3)));
    $('#sr').innerHTML=`<div class="cd" style="border-radius:22px;padding:22px 24px"><div class="row sb ac"><div><div class=sub style="margin:0">Analyzer score</div><div style="font-size:38px;font-weight:700;letter-spacing:-1.5px;line-height:44px" class=${score>=60?'pos':score<40?'neg':''}>${score}<span class=mut style="font-size:16px">/100</span></div></div><a class=l href="#/trader/${a}">Open profile ${ic('chr',10)}</a></div>
      <div style="margin-top:14px">${B.map(([k,t])=>`<div style="padding:11px 0;border-top:1px solid var(--line);font-size:11.5px;line-height:17px" class=${k=='mut'?'':k}>${t}</div>`).join('')}</div></div>`}}
function journalPage(){
  const notes=LS.get('notes',[]),fl=Object.entries(fol);
  app.innerHTML=`<h1>Journal</h1><div class=sub>Your followed traders and trade notes — saved in this browser.</div>
  <h2 style="margin:30px 0 14px;font-size:16px">Following (${fl.length})</h2>${fl.length?`<div class=tw><table>${fl.map(([a,n])=>`<tr class=tr style="height:50px"><td style="font-size:12px;font-weight:600"><a href="#/trader/${a}">${esc(n)}</a><td class="r mut">${short(a)}<td class=r style="width:110px"><button class="btn u" data-follow="${a}|${esc(n)}" style="height:30px">${ic('x',11)} Unfollow</button></tr>`).join('')}</table></div>`:'<div class=sub>Nobody yet — follow traders from the Leaderboard.</div>'}
  <h2 style="margin:34px 0 14px;font-size:16px">Notes</h2><form id=nf style="display:flex;gap:10px"><input id=nt class=fld placeholder="Write a trade note…" style="flex:1;height:40px;border-radius:12px"><button class=btn style="height:40px;border-radius:12px">Add</button></form>
  <div style="margin-top:14px">${notes.map((n,i)=>`<div class=cd style="border-radius:14px;padding:12px 16px;margin-bottom:8px;display:flex;justify-content:space-between;gap:12px;font-size:12px"><span>${esc(n.t)}<div class=sub style="margin:4px 0 0">${new Date(n.d).toLocaleString()}</div></span><a class=mut style="cursor:pointer" data-del=${i}>${ic('x',12)}</a></div>`).join('')}</div>`;
  $('#nf').onsubmit=e=>{e.preventDefault();const t=$('#nt').value.trim();if(!t)return;notes.unshift({t,d:Date.now()});LS.set('notes',notes);journalPage()};
  app.querySelectorAll('[data-del]').forEach(x=>x.onclick=()=>{notes.splice(+x.dataset.del,1);LS.set('notes',notes);journalPage()});
}
function helpPage(){app.innerHTML=`<h1>Help</h1><div class=sub>How InvisibleTrader works</div><div style="margin-top:28px;display:grid;gap:10px">${[
 ['Where does the data come from?','Everything is pulled live from Polymarket\'s public APIs (data-api, gamma and clob) through this site\'s own server-side proxy.'],
 ['What is the Profit Bot?','A backtest that replays the real resolved picks of the top traders in sequence, restaking a fixed % of the bankroll each time. Change the sliders to re-run it.'],
 ['What does Follow do?','Follow saves a trader in this browser (Journal page). You can filter the Feed to followed traders only.'],
 ['What is the Feed / Terminal?','Live large trades across Polymarket. Terminal is a denser, faster-refreshing view with a lower size threshold.'],
 ['Limits','Win rate and ROI use each trader\'s most recent closed positions, and the API may omit some losing positions, so treat numbers as approximate. Not financial advice.']].map(([q,a])=>`<div class="pre"><b>${q}</b><div class=mut style="margin-top:4px">${a}</div></div>`).join('')}</div>`}
let seenT=new Set(),ft;
async function feed(term){
  const T=!!term,st=T?'terminal':'feed';
  app.innerHTML=`<h1>${T?'Terminal':'Feed'}</h1><div class=sub>Live whale trades · refreshes every ${T?5:15}s</div><div class=row style="margin:22px 0 16px;align-items:center;gap:12px;font-size:11px"><span class=mut>Min size $</span><input id=min type=number class=fld value=${LS.get(st+'min',T?1000:5000)} style="width:100px;height:32px;cursor:text"><label class=mut style="display:flex;gap:5px"><input type=checkbox id=fo> Following only</label><label class=mut style="display:flex;gap:5px"><input type=checkbox id=nt> Notify</label><span class=mut id=st></span></div><div class=tw><table id=ft></table></div>`;
  $('#min').onchange=e=>{LS.set(st+'min',e.target.value);seenT.clear();tick()};$('#nt').onchange=e=>e.target.checked&&Notification.requestPermission();$('#fo').onchange=()=>{seenT.clear();tick()};
  async function tick(){if(!$('#ft'))return;let d=await api(`trades?limit=${T?300:200}&filterType=CASH&filterAmount=${+$('#min').value||0}`);if(!Array.isArray(d))return;if($('#fo').checked)d=d.filter(t=>fol[t.proxyWallet]);
    const first=!seenT.size;let fresh=0;
    const rows=d.map(t=>{const k=t.transactionHash+t.asset+t.size,n=!first&&!seenT.has(k);seenT.add(k);if(n)fresh++;
      return`<tr style="height:${T?30:44}px;${n?'background:#00d26a1a':''}"><td class=mut>${new Date(t.timestamp*1000).toLocaleTimeString()}<td><a class=l href="#/trader/${t.proxyWallet}">${esc(t.name||t.pseudonym||short(t.proxyWallet))}</a><td class=${t.side=='BUY'?'pos':'neg'}>${t.side}<td class=r><b>${usd(t.size*t.price)}</b><td><a href="https://polymarket.com/event/${t.eventSlug}" target=_blank>${esc(t.title)}</a> <span class=mut>${esc(t.outcome)}</span><td class=r>${(t.price*100).toFixed(1)}¢</tr>`}).join('');
    $('#ft').innerHTML='<tr><th>Time<th>Trader<th>Side<th class=r>Size<th>Market<th class=r>Price</tr>'+(rows||'<tr style="height:44px"><td colspan=6 class=mut>No trades match.</tr>');$('#st').textContent='Updated '+new Date().toLocaleTimeString();
    if(fresh&&$('#nt').checked&&Notification.permission==='granted')new Notification(`🐋 ${fresh} new whale trade(s)`)}
  tick();clearInterval(ft);ft=setInterval(tick,T?5000:15000);
}
function route(){clearInterval(ft);app.classList.remove('p');renderNav();const[p,a]=(location.hash.slice(2)||'profits').split('/');
  ({profits,bot:botPage,feed:()=>feed(0),terminal:()=>feed(1),leaderboard,search:searchPage,ai:aiPage,journal:journalPage,help:helpPage,trader:()=>trader(a)})[p]?.();window.scrollTo(0,0)}
addEventListener('hashchange',()=>route());route();
