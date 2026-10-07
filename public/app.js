/* Mimic — Polymarket signals, Polymarket US execution. */
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],app=$('#app');
const P={search:'<circle cx=7 cy=7 r=4.5 /><path d="M10.5 10.5l3 3" />',home:'<path d="M2.5 7.5L8 3l5.5 4.5V13a1 1 0 01-1 1h-9a1 1 0 01-1-1z" /><path d="M6.5 14V10h3v4" />',trophy:'<path d="M5 2h6v4a3 3 0 01-6 0zM3 3h2v2a2 2 0 01-2-2zM13 3h-2v2a2 2 0 002-2zM8 9v3M5 14h6" />',wave:'<path d="M1.5 9c1.5 0 1.5-4 3-4s1.5 6 3 6 1.5-8 3-8 1.5 6 3 6" />',flask:'<path d="M6 2h4M6.5 2v4L3 13a1 1 0 00.9 1.4h8.2A1 1 0 0013 13L9.5 6V2" /><path d="M4.5 10h7" />',bot:'<rect x=3 y=5 width=10 height=8 rx=2.5 /><path d="M8 2v3M6 9h.01M10 9h.01" />',book:'<path d="M3 3.5A1.5 1.5 0 014.5 2H13v10.5H4.5A1.5 1.5 0 003 14z" /><path d="M3 14a1.5 1.5 0 001.5-1.5H13" />',spark:'<path d="M6 2l1.2 3L10 6.2 7.2 7.4 6 10.5 4.8 7.4 2 6.2 4.8 5z" /><path d="M11.5 9l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8L9 11.5l1.8-.7z" />',help:'<circle cx=8 cy=8 r=6 /><path d="M6.3 6.4c0-1 .8-1.6 1.7-1.6s1.7.6 1.7 1.5c0 1.2-1.7 1.3-1.7 2.5M8 11v.1" />',arrow:'<path d="M5 11l6-6M6 5h5v5" />',star:'<path d="M8 2l1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.3l-3.7 2 .8-4.1L2 6.3l4.2-.5z" />',lock:'<rect x=3.5 y=7 width=9 height=7 rx=1.5 /><path d="M5.5 7V5a2.5 2.5 0 015 0v2" />',unlock:'<rect x=3.5 y=7 width=9 height=7 rx=1.5 /><path d="M5.5 7V5a2.5 2.5 0 014.9-.6" />',copy:'<rect x=5.5 y=5.5 width=8 height=8 rx=1.5 /><path d="M3 10.5V3.5A1 1 0 014 2.5h6.5" />',x:'<path d="M4 4l8 8M12 4l-8 8" />',chev:'<path d="M6 4l4 4-4 4" />',sun:'<circle cx=8 cy=8 r=3 /><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" />',moon:'<path d="M13 9.5A5.5 5.5 0 016.5 3a5.5 5.5 0 106.5 6.5z" />'};
const ic=(n,s=16)=>`<svg width=${s} height=${s} viewBox="0 0 16 16" fill=none stroke=currentColor stroke-width=1.5 stroke-linecap=round stroke-linejoin=round>${P[n]}</svg>`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
const fmt=(n,d=0)=>Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const usd=(n,d=0)=>(n<0?'-':'')+'$'+fmt(n,d),sg=(n,d=0)=>(n<0?'-':'+')+'$'+fmt(n,d);
const abbr=(n,sign=1)=>{const a=Math.abs(n),s=n<0?'-':sign?'+':'';return s+'$'+(a>=1e9?(a/1e9).toFixed(2)+'B':a>=1e6?(a/1e6).toFixed(a>=1e7?1:2)+'M':a>=1e3?(a/1e3).toFixed(1)+'K':Math.round(a))};
const short=a=>a?a.slice(0,6)+'…'+a.slice(-4):'',nm=(n,a)=>!n?short(a):/^0x[0-9a-f]{16,}/i.test(n)?short(n):n,ud=n=>n>=0?'up':'down';
const dt=ts=>new Date(ts*1000).toLocaleDateString('en',{month:'short',day:'numeric'});
const rel=ts=>{const s=Date.now()/1000-ts;return s<60?Math.max(1,Math.floor(s))+'s ago':s<3600?Math.floor(s/60)+'m ago':s<86400?Math.floor(s/3600)+'h ago':s<86400*60?Math.floor(s/86400)+'d ago':Math.floor(s/2592000)+'mo ago'};
const THEMES={auto:'Auto',light:'Light',dark:'Dark'};
const applyTheme=()=>{const t=LS.get('theme','auto'),dark=t=='dark'||(t=='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=dark?'dark':'light';document.querySelector('meta[name=theme-color]')?.setAttribute('content',dark?'#000000':'#f5f5f7')};
const cycleTheme=()=>{const order=['auto','light','dark'],t=LS.get('theme','auto');LS.set('theme',order[(order.indexOf(t)+1)%3]);applyTheme();renderSide();toast(`Appearance: ${THEMES[LS.get('theme','auto')]}`)};
const LS={get(k,d){try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
const toast=m=>{const t=document.createElement('div');t.className='toast';t.innerHTML=m;$('#toasts').append(t);setTimeout(()=>{t.classList.add('out');setTimeout(()=>t.remove(),150)},3200)};
const hue=a=>{let h=0;for(const c of String(a))h=(h*31+c.charCodeAt(0))%360;return h};
const av=(name,addr,img,cls='')=>{const h=hue(addr||name);const bg=`background:linear-gradient(135deg,hsl(${h} 70% 58%),hsl(${(h+50)%360} 70% 42%))`;
  const L=esc((name||'?').replace(/^0x/,'').slice(0,1).toUpperCase());return`<span class="av ${cls}" style="${bg};position:relative">${L}${img?`<img src="${esc(img)}" alt="" style="position:absolute;inset:0" onerror="this.remove()">`:''}</span>`};
const api=async p=>{try{const[i,...q]=p.split('?');const r=await fetch('/api/proxy?u='+encodeURIComponent(i)+(q.length?'&'+q.join('?'):''));return await r.json()}catch(e){return[]}};
const classify=t=>/bitcoin|btc|ethereum|\beth\b|solana|crypto|xrp|doge|token|fdv|airdrop/i.test(t)?'Crypto':/elect|president|minister|trump|biden|senate|congress|vote|party|governor|mayor|ceasefire|shutdown|tariff|war\b|fed\b|rates/i.test(t)?'Politics':/win on|\bvs\.?\b|\bfc\b|nba|nfl|mlb|nhl|ufc|open\b|cup|league|champion|ballon|match|game|series|bowl|prix|\bf1\b|trophy|title|draw|tennis|golf/i.test(t)?'Sports':'Other';
const sk=(h=14,w='100%')=>`<div class=sk style="height:${h}px;width:${w}"></div>`;

/* ---------- data (accuracy notes inline) ---------- */
const CACHE={};const cached=(k,f)=>CACHE[k]??=f();
// newest closed positions first — the API's default sort returns the biggest winners only, which inflates win rates
const closedOf=(a,pages=3)=>cached('c'+a+pages,async()=>(await Promise.all([...Array(pages)].map((_,i)=>api(`closed-positions?user=${a}&limit=50&offset=${i*50}&sortBy=TIMESTAMP&sortDirection=DESC`)))).flat().filter(x=>x&&x.title).sort((x,y)=>x.timestamp-y.timestamp));
// + resolved-but-unredeemed positions (the closed list omits losers that were never redeemed); newest N by resolution time
const resolvedOf=(a,pages=4)=>cached('r'+a+pages,async()=>{
  const[c,r]=await Promise.all([closedOf(a,pages),Promise.all([...Array(pages>2?2:1)].map((_,i)=>api(`positions?user=${a}&redeemable=true&sizeThreshold=0&limit=200&offset=${i*200}&sortBy=RESOLVING&sortDirection=DESC`))).then(x=>x.flat().filter(p=>p&&p.title&&p.endDate))]);
  const seen=new Set(c.map(x=>x.conditionId+x.outcomeIndex));
  const extra=r.filter(p=>!seen.has(p.conditionId+p.outcomeIndex)).map(p=>({...p,totalBought:p.size,realizedPnl:p.cashPnl,timestamp:Date.parse(p.endDate)/1000,unredeemed:true})).filter(p=>p.timestamp&&p.timestamp<Date.now()/1000);
  return[...c,...extra].sort((x,y)=>y.timestamp-x.timestamp).slice(0,pages*50).reverse()});
// truly open = market not yet resolved (redeemable positions are finished markets that were simply never cashed out)
const openOf=a=>cached('o'+a,async()=>{const r=await api(`positions?user=${a}&sizeThreshold=1&limit=100&sortBy=CURRENT&sortDirection=DESC`);return(Array.isArray(r)?r:[]).filter(p=>!p.redeemable&&p.curPrice>0&&p.curPrice<1)});
const lastTradeOf=a=>cached('lt'+a,async()=>{const r=await api(`trades?user=${a}&limit=1`);return Array.isArray(r)&&r[0]?r[0].timestamp:null});
const lbOf=(per,ord,off=0)=>cached(`lb${per}${ord}${off}`,async()=>{const r=await api(`v1/leaderboard?timePeriod=${per}&orderBy=${ord}&limit=50&offset=${off}`);return Array.isArray(r)?r:[]});
let EXP;const loadExperts=()=>EXP??=(async()=>{const[a,m]=await Promise.all([lbOf('ALL','PNL'),lbOf('MONTH','PNL')]);const seen=new Set(),lb=[...a.slice(0,10),...m.slice(0,12)].filter(t=>t.proxyWallet&&!seen.has(t.proxyWallet)&&seen.add(t.proxyWallet));
  return Promise.all(lb.map(async t=>{const[closed,open]=await Promise.all([resolvedOf(t.proxyWallet,2),openOf(t.proxyWallet)]);return{...t,closed,open,wr:closed.length?closed.filter(c=>c.realizedPnl>0).length/closed.length:0}}))})();
const statOf=a=>cached('st'+a,async()=>{const[c,lt]=await Promise.all([resolvedOf(a,2),lastTradeOf(a)]);const w=c.filter(x=>x.realizedPnl>0).length,n=c.length;return{n,w,wr:n?w/n:0,avgE:n?c.reduce((s,x)=>s+x.avgPrice,0)/n:0,last:lt}});

/* ---------- follows (synced to server when logged in, so the bot copies them) ---------- */
/* Tracked traders: when you're logged in, your account on the server holds the one list every device shows
   (the Auto Trader copies exactly this list). Logged out, tracking is disabled so devices can't drift apart. */
let fol={},OWNER=false;const OLDFOL=LS.get('fol',null)||{}; // list saved on this device by older versions
const folPaint=()=>$$('[data-f]').forEach(b=>{const on=!!fol[b.dataset.f];b.classList.toggle('on',on);b.title=on?'Stop tracking':'Track';const t=[...b.childNodes].find(x=>x.nodeType==3&&x.textContent.trim());if(t)t.textContent=on?' Tracking':' Track'});
const setFol=list=>{const before=Object.keys(fol).sort().join();fol={};(list||[]).forEach(f=>fol[f.wallet]=f.name||short(f.wallet));folPaint();renderSide();
  if(location.hash.startsWith('#/journal')&&Object.keys(fol).sort().join()!==before)journal()}; // keep the Tracking page in step
const folApi=(op,data)=>fetch('/api/bot'+(data?'':'?op='+op),data?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op,...data})}:{}).then(r=>r.ok?r.json():Promise.reject(r));
const loadFollows=async()=>{if(!OWNER){setFol([]);return}
  try{if(Object.keys(OLDFOL).length&&!LS.get('folMigrated',false)){ // one-time: merge this device's old list into the account, then forget it
      for(const[wallet,name] of Object.entries(OLDFOL))await folApi('follow',{wallet,name});LS.set('folMigrated',true);LS.set('fol',null)}
    setFol((await folApi('followlist')).follows)}catch(e){}};
const syncFol=loadFollows;
async function toggleFollow(a,n){
  if(!OWNER){toast('Log in to track traders — your list stays the same on every device');location.hash='#/bot';return}
  const was=!!fol[a];was?delete fol[a]:fol[a]=n;folPaint();renderSide(); // instant feedback
  try{const r=await folApi(was?'unfollow':'follow',{wallet:a,name:n});setFol(r.follows);if(location.hash.startsWith('#/journal'))journal();toast(was?`Stopped tracking <b>${esc(n)}</b>`:`Tracking <b>${esc(n)}</b> — the Auto Trader copies their trades`)}
  catch(e){await loadFollows();toast('<span class=down>Could not save — check your connection</span>')}
}
// another device may have changed the list: refresh when you come back to the tab, and every 30s while it's open
document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadFollows()});addEventListener('focus',()=>loadFollows());setInterval(()=>{if(!document.hidden)loadFollows()},30000);
document.addEventListener('click',e=>{const f=e.target.closest('[data-f]');if(f){if(!e.target.classList.contains('hpl'))e.preventDefault(); /* keep the haptic label's switch flip */ e.stopPropagation();toggleFollow(f.dataset.f,f.dataset.n)}});
const folBtn=(a,n,label)=>`<button class="btn ${label?'':'ic'} fol ${fol[a]?'on':''}" data-f="${a}" data-n="${esc(n)}" title="${fol[a]?'Stop tracking':'Track'}">${ic('star',15)}${label?(fol[a]?' Tracking':' Track'):''}</button>`;

/* ---------- charts ---------- */
function area(el,vals,o={}){
  const w=el.clientWidth||600,h=o.h||220,n=vals.length,pad={l:o.axis?84:0,r:o.r??8,t:o.t??14,b:o.b??(o.labels?24:6)};if(n<2){el.innerHTML=`<div class=empty>Not enough data yet</div>`;return}
  let mn=Math.min(...vals),mx=Math.max(...vals);if(o.zero){mn=Math.min(mn,0);mx=Math.max(mx,0)}const rg=(mx-mn)||1;
  const X=i=>pad.l+i/(n-1)*(w-pad.l-pad.r),Y=v=>pad.t+(1-(v-mn)/rg)*(h-pad.t-pad.b);
  const up=o.color?o.color:(vals[n-1]>=vals[0]?'var(--up)':'var(--down)'),id='g'+Math.random().toString(36).slice(2,8);
  const d=vals.map((v,i)=>(i?'L':'M')+X(i).toFixed(1)+' '+Y(v).toFixed(1)).join('');
  const ticks=o.axis?[0,1,2,3].map(k=>mn+rg*k/3):[];
  el.innerHTML=`<svg width=${w} height=${h}><defs><linearGradient id=${id} x1=0 y1=0 x2=0 y2=1><stop offset=0 stop-color="${up}" stop-opacity=.28 /><stop offset=1 stop-color="${up}" stop-opacity=0 /></linearGradient></defs>
   ${ticks.map(v=>`<line x1=${pad.l} x2=${w-pad.r} y1=${Y(v)} y2=${Y(v)} style="stroke:var(--grid)" /><text x=0 y=${Y(v)+4} style="fill:var(--mut2)" font-size=11>${o.fmt?o.fmt(v,rg):v}</text>`).join('')}
   ${o.zero&&mn<0?`<line x1=${pad.l} x2=${w-pad.r} y1=${Y(0)} y2=${Y(0)} style="stroke:var(--grid2)" stroke-dasharray="3 4" />`:''}
   <path d="${d}L${X(n-1)} ${h-pad.b}L${X(0)} ${h-pad.b}Z" fill="url(#${id})" /><path class=ln d="${d}" fill=none stroke="${up}" stroke-width=${o.sw||2} stroke-linejoin=round stroke-linecap=round style="stroke-dasharray:4000;--len:4000" />
   <line id=${id}x y1=${pad.t} y2=${h-pad.b} style="stroke:var(--grid2);display:none" stroke-dasharray="3 3" /><circle id=${id}c r=4.5 fill="${up}" style="stroke:var(--bg)" stroke-width=2 cx=${X(n-1)} cy=${Y(vals[n-1])} />
   ${o.labels?o.labels.filter((_,i)=>i%Math.ceil(n/6)==0).map((l,k)=>`<text x=${X(k*Math.ceil(n/6))} y=${h-4} style="fill:var(--mut2)" font-size=11 text-anchor=middle>${l}</text>`).join(''):''}</svg><div class=tip></div>`;
  if(!o.tip)return;const tip=el.querySelector('.tip'),ln=el.querySelector(`#${id}x`),c=el.querySelector(`#${id}c`);
  el.onmousemove=e=>{const r=el.getBoundingClientRect(),i=Math.max(0,Math.min(n-1,Math.round((e.clientX-r.left-pad.l)/(w-pad.l-pad.r)*(n-1))));
    ln.style.display='';ln.setAttribute('x1',X(i));ln.setAttribute('x2',X(i));c.setAttribute('cx',X(i));c.setAttribute('cy',Y(vals[i]));tip.style.display='block';tip.style.left=X(i)+'px';tip.style.top=Y(vals[i])+'px';tip.innerHTML=o.tip(i)};
  el.onmouseleave=()=>{ln.style.display='none';tip.style.display='none';c.setAttribute('cx',X(n-1));c.setAttribute('cy',Y(vals[n-1]))};
}

/* ---------- shell ---------- */
const NAV=[['Discover',[['','home','Overview'],['leaderboard','trophy','Leaderboard'],['feed','wave','Whale Feed']]],['Strategy',[['backtest','flask','Profit Bot'],['bot','bot','Auto Trader']]],['You',[['journal','book','Tracking'],['analyze','spark','Analyzer']]]];
let BOTON=false;
function renderSide(){const p=location.hash.slice(2).split('/')[0];const nf=Object.keys(fol).length;
  $('#side').innerHTML=`<div class=mobile-sheet-head><b>More</b><button class=tbtn id=sheetclose aria-label="Close menu">${ic('x',18)}</button></div><a class=logo href="#/"><img src="/icon-192.png" alt="" width=34 height=34><span><b>Mimic</b></span></a>`+
  NAV.map(([g,items])=>`<div class=navg>${g}</div>`+items.map(([k,i,t])=>`<a class="nv ${p==k||(k==''&&!p)?'on':''}" href="#/${k}">${ic(i)}${t}${k=='bot'&&BOTON?'<span class=dot></span>':''}${k=='journal'&&nf?`<span class="pill n" style="margin-left:auto">${nf}</span>`:''}</a>`).join('')).join('')+
  `<div class=sfoot><button class=thm id=thm>${ic(document.documentElement.dataset.theme=='light'?'sun':'moon')}Appearance · ${THEMES[LS.get('theme','auto')]}</button><a class="nv ${p=='help'?'on':''}" href="#/help">${ic('help')}Help</a>${OWNER?`<a class=nv href="#" id=lo>${ic('lock')}Lock (log out)</a>`:`<a class=nv href="#/bot">${ic('lock')}Owner login</a>`}</div>`;
  $('#tabbar').innerHTML=[['','home','Home'],['feed','wave','Feed'],['bot','bot','Auto'],['journal','book','Tracking']].map(([k,i,t])=>`<a href="#/${k}" class="${p==k||(k==''&&!p)?'on':''}">${ic(i)}<span>${t}</span></a>`).join('')+`<a href="#" id=tmore aria-label="More sections">${ic('chev')}<span>More</span></a>`;
  $('#thm').onclick=cycleTheme;$('#ttheme').innerHTML=ic(document.documentElement.dataset.theme=='light'?'moon':'sun',18);$('#ttheme').onclick=()=>{LS.set('theme',document.documentElement.dataset.theme=='light'?'dark':'light');applyTheme();renderSide()};
  $('#tmore').onclick=e=>{e.preventDefault();$('#side').classList.add('open')};$('#sheetclose').onclick=()=>$('#side').classList.remove('open');
  $('#lo')&&($('#lo').onclick=async e=>{e.preventDefault();await fetch('/api/auth',{method:'POST',headers:{'content-type':'application/json'},body:'{"op":"logout"}'});OWNER=false;setFol([]);toast('Logged out');route()})}
document.addEventListener('click',e=>{if($('#side').classList.contains('open')&&!e.target.closest('#side')&&!e.target.closest('#tmore'))$('#side').classList.remove('open')});
/* command palette */
let palT;function openPal(){$('#pal').hidden=false;$('#palq').value='';$('#palr').innerHTML=palHint();$('#palq').focus()}
const palHint=()=>`<div class="pi mut" style="cursor:default">Type a trader's name, or paste a wallet address.</div>`+Object.entries(fol).slice(0,5).map(([a,n])=>`<a class=pi href="#/trader/${a}">${av(n,a,null,'sm')}<span class=grow>${esc(n)}</span><span class=pill n>Tracking</span></a>`).join('');
$('#cmdk').onclick=openPal;$('#pal').onclick=e=>{if(e.target.id=='pal')$('#pal').hidden=true};
addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key=='k'){e.preventDefault();openPal()}if(e.key=='Escape')$('#pal').hidden=true;
  if(!$('#pal').hidden&&e.key=='Enter'){const f=$('#palr .pi[href]');if(f){location.hash=f.getAttribute('href');$('#pal').hidden=true}}});
$('#palq').oninput=()=>{clearTimeout(palT);const v=$('#palq').value.trim();if(!v){$('#palr').innerHTML=palHint();return}
  if(/^0x[0-9a-f]{40}$/i.test(v)){$('#palr').innerHTML=`<a class="pi on" href="#/trader/${v.toLowerCase()}">${av(v,v,null,'sm')}<span class=grow>Open wallet ${short(v)}</span>${ic('chev')}</a>`;return}
  $('#palr').innerHTML=`<div class=pi>${sk(16,'60%')}</div>`;palT=setTimeout(async()=>{const r=(await api(`gamma/public-search?q=${encodeURIComponent(v)}&search_profiles=true&search_tags=false&limit_per_type=10`)).profiles||[];
    if($('#palq').value.trim()!==v)return;$('#palr').innerHTML=r.length?r.map((p,i)=>`<a class="pi ${i?'':'on'}" href="#/trader/${p.proxyWallet}">${av(p.name||p.pseudonym,p.proxyWallet,p.profileImage,'sm')}<span class=grow>${esc(p.name||p.pseudonym)}</span><span class="mut num" style="font-size:12px">${short(p.proxyWallet)}</span></a>`).join(''):`<div class="pi mut">No traders found</div>`;
    $$('#palr .pi[href]').forEach(x=>x.onclick=()=>$('#pal').hidden=true)},250)};

/* ---------- Overview ---------- */
async function overview(){
  app.innerHTML=`<div class="ph fade"><div><h1>Market pulse</h1><p class=lead>What the best Polymarket traders are doing right now — and what your bot is doing about it.</p></div><span class=live>Live</span></div>
  <div class="grid g3" id=ovs>${[0,1,2].map(()=>`<div class="card pad stat">${sk(12,'40%')}<div style="height:12px"></div>${sk(28,'70%')}</div>`).join('')}</div>
  <div class=split style="margin-top:16px"><div class=card><div class="row sb pad" style="padding-bottom:6px"><h2>Whale trades</h2><a href="#/feed" class="btn sm">Open feed ${ic('chev',13)}</a></div><div id=ovf>${sk(200)}</div></div>
  <div class=card><div class="row sb pad" style="padding-bottom:6px"><h2>Top traders</h2><a href="#/leaderboard" class="btn sm">All ${ic('chev',13)}</a></div><div id=ovl style="padding:0 10px 10px">${sk(200)}</div></div></div>`;
  const[lb,tr]=await Promise.all([lbOf('ALL','PNL'),api('trades?limit=200&filterType=CASH&filterAmount=5000')]);if(!$('#ovs'))return;
  const trades=Array.isArray(tr)?tr:[],bigH=trades.filter(t=>Date.now()/1000-t.timestamp<3600).sort((a,b)=>b.size*b.price-a.size*a.price)[0];
  let bot=null;if(OWNER)bot=await fetch('/api/bot?op=state').then(r=>r.ok?r.json():null).catch(()=>null);
  $('#ovs').innerHTML=`<a href="#/bot" class="card pad stat fade"><div class=k>${ic('bot',14)} Auto Trader</div><div class=v>${bot?(bot.enabled?'<span class=up>Running</span>':'Paused'):'Locked'}</div><div class=s>${bot?(bot.account?`Polymarket US value <span class=num>${usd(bot.account.total,2)}</span> · cash <span class=num>${usd(bot.account.cash,2)}</span>`:bot.keys?.set?'Polymarket US connected':'Connect Polymarket US to start'):'Log in to control your bot'}</div></a>
   <a href="#/trader/${lb[0]?.proxyWallet}" class="card pad stat fade"><div class=k>${ic('trophy',14)} #1 all-time</div><div class="v num up">${lb[0]?abbr(lb[0].pnl):'—'}</div><div class=s>${esc(lb[0]?.userName||'')}</div></a>
   <div class="card pad stat fade"><div class=k>${ic('wave',14)} Biggest trade · last hour</div><div class="v num">${bigH?abbr(bigH.size*bigH.price,0):'—'}</div><div class="s ell">${bigH?`${esc(nm(bigH.name||bigH.pseudonym,bigH.proxyWallet))} · ${esc(bigH.outcome)} · ${esc(bigH.title)}`:'No $5K+ trades in the last hour'}</div></div>`;
  $('#ovf').innerHTML=feedRows(trades.slice(0,9),true);
  $('#ovl').innerHTML=lb.slice(0,7).map((t,i)=>`<a class="pi fade" href="#/trader/${t.proxyWallet}" style="animation-delay:${i*30}ms"><span class="mut num" style="width:16px">${t.rank}</span>${av(t.userName,t.proxyWallet,t.profileImage,'sm')}<span class="grow ell" style="font-weight:550">${esc(nm(t.userName,t.proxyWallet))}</span><span class="num up">${abbr(t.pnl)}</span></a>`).join('');
}
const feedRows=(d,compact)=>{
 if(compact)return `<table class=tbl><tbody>${d.map(t=>{const v=t.size*t.price;return`<tr class=clk onclick="if(!event.target.closest('button,a'))location.hash='#/trader/${t.proxyWallet}'"><td style="width:1%">${av(t.name||t.pseudonym,t.proxyWallet,t.profileImageOptimized||t.profileImage,'sm')}</td>
  <td style="max-width:${compact?220:380}px"><div class=ell style="font-weight:550">${esc(nm(t.name||t.pseudonym,t.proxyWallet))} <span class="pill ${t.side=='BUY'?'up':'down'}" style="margin-left:4px">${t.side=='BUY'?'Bought':'Sold'} ${esc(t.outcome)}</span></div><div class="mut ell" style="font-size:12.5px;margin-top:2px">${esc(t.title)}</div></td>
  <td class=r><div class="num" style="font-weight:600">${abbr(v,0)}</div><div class="mut num" style="font-size:12px">@ ${(t.price*100).toFixed(1)}¢</div></td></tr>`}).join('')||'<tr><td class=empty>No trades match.</td></tr>'}</tbody></table>`;
 return `<div class=feedlist>${d.map(t=>{const v=t.size*t.price,n=nm(t.name||t.pseudonym,t.proxyWallet),rank=t._rank;return`<a class=feeditem href="#/trader/${t.proxyWallet}">${av(t.name||t.pseudonym,t.proxyWallet,t.profileImageOptimized||t.profileImage,'sm')}<div class=feedbody><div class=feedwho><b class=ell>${esc(n)}</b><span class="pill ${t.side=='BUY'?'up':'down'}">${t.side=='BUY'?'Bought':'Sold'} ${esc(t.outcome)}</span></div><div class=feedtitle>${esc(t.title)}</div>${rank?`<div class=feedrank>${rank}</div>`:''}</div><div class=feedvalue><b class=num>${abbr(v,0)}</b><span class=mut>@ ${(t.price*100).toFixed(1)}¢ · ${rel(t.timestamp)}</span></div></a>`}).join('')||'<div class=empty>No trades match.</div>'}</div>`;
};

/* ---------- Leaderboard ---------- */
async function leaderboard(){
  const per=LS.get('lbper','ALL'),ord=LS.get('lbord','PNL'),dir=LS.get('lbdir','desc');
  app.innerHTML=`<div class="ph fade"><div><h1>Leaderboard</h1><p class=lead>${ord=='WR'?`Top 100 traders by profit, re-ranked by win rate (${dir=='asc'?'lowest':'highest'} first) over their most recent resolved positions (min. 20).`:`Ranked by Polymarket's official ${ord=='VOL'?'volume':'profit & loss'}. Win rates use each trader's most recent resolved positions.`}</p></div>
   <div class="row wrapf"><div class=seg id=per>${[['DAY','Today'],['WEEK','Week'],['MONTH','Month'],['ALL','All time']].map(([k,l])=>`<button data-v=${k} class="${per==k?'on':''}">${l}</button>`).join('')}</div><div class=seg id=ord>${[['PNL','Profit'],['VOL','Volume'],['WR','Win rate']].map(([k,l])=>`<button data-v=${k} class="${ord==k?'on':''}">${l}</button>`).join('')}</div></div></div><div id=lb>${sk(160)}</div>`;
  $$('#per button').forEach(b=>b.onclick=()=>{LS.set('lbper',b.dataset.v);leaderboard()});$$('#ord button').forEach(b=>b.onclick=()=>{if(b.dataset.v!=ord)LS.set('lbdir','desc');LS.set('lbord',b.dataset.v);leaderboard()});
  const base=ord=='WR'?'PNL':ord;let lb=[...await lbOf(per,base,0),...await lbOf(per,base,50)];if(!$('#lb'))return;
  if(ord=='WR'&&lb.length){const act=LS.get('lbact',true),el=$('#lb');let done=0,i=0;
    const work=async()=>{while(i<lb.length){const t=lb[i++];await statOf(t.proxyWallet);if($('#lb')===el)el.innerHTML=`<div class="card pad"><div class="row sb"><span>Checking win rates… <b class=num>${++done}</b> of ${lb.length}</span><span class=mut style="font-size:13px">first time takes ~30s</span></div><div class=bar style="margin-top:14px"><i style="width:${done/lb.length*100}%"></i></div></div>`}};
    await Promise.all([...Array(10)].map(work));if($('#lb')!==el)return;
    const St=await Promise.all(lb.map(t=>statOf(t.proxyWallet)));
    lb=lb.map((t,k)=>({...t,_s:St[k]})).filter(t=>t._s.n>=20&&(!act||(t._s.last&&Date.now()/1000-t._s.last<7*86400))).sort((a,b)=>(dir=='asc'?a._s.wr-b._s.wr:b._s.wr-a._s.wr)||b._s.n-a._s.n).map((t,k)=>({...t,rank:String(k+1)}));
    $('#lb').insertAdjacentHTML('beforebegin',`<div class="row wrapf" style="margin:-8px 0 18px" id=wrf><button class="chip on" id=lbdir>${dir=='asc'?'▲ Lowest first':'▼ Highest first'}</button><button class="chip ${act?'on':''}" id=lbact>${act?'✓ ':''}Active in the last 7 days</button><span class=mut style="font-size:13px">${lb.length} traders · tap a win rate to see the entry price behind it</span></div>`);
    $('#lbact').onclick=()=>{LS.set('lbact',!act);leaderboard()};$('#lbdir').onclick=()=>{LS.set('lbdir',dir=='asc'?'desc':'asc');leaderboard()};
    if(!lb.length){$('#lb').innerHTML=`<div class="card empty">No traders match — try turning off "Active in the last 7 days".</div>`;return}}if(!lb.length){$('#lb').innerHTML=`<div class="card empty">Couldn't load the leaderboard from Polymarket — try again in a moment.</div>`;return}
  const key=ord=='VOL'?'vol':'pnl',isWR=ord=='WR',medal=['#ffd166','#cfd6e4','#e0a36b'];
  const mobileRows=lb.map(t=>{const value=isWR?Math.round(t._s.wr*100)+'%':key=='pnl'?abbr(t.pnl):abbr(t.vol,0),sub=isWR?`${t._s.w} of ${t._s.n} resolved`:`${key=='pnl'?'Profit':'Volume'} · ${{DAY:'today',WEEK:'this week',MONTH:'this month',ALL:'all time'}[per]}`;return`<div class="leaderrow clk" onclick="if(!event.target.closest('button,a'))location.hash='#/trader/${t.proxyWallet}'"><span class="leaderplace num">${t.rank}</span>${av(t.userName,t.proxyWallet,t.profileImage,'sm')}<div class=leaderidentity><b class=ell>${esc(nm(t.userName,t.proxyWallet))}</b><span class=leaderstatus data-la="${t.proxyWallet}">&nbsp;</span></div><div class="leadermetric ${isWR?'':key=='pnl'?ud(t.pnl):''}"><b class=num>${value}</b><span>${sub}</span>${isWR?'':`<i data-wr="${t.proxyWallet}">Win rate…</i>`}</div>${folBtn(t.proxyWallet,t.userName||short(t.proxyWallet))}</div>`}).join('');
  $('#lb').innerHTML=`<div class="grid g3 pods">${lb.slice(0,3).map((t,i)=>`<a href="#/trader/${t.proxyWallet}" class="card pod fade ${i==0?'g1':''}" style="animation-delay:${i*60}ms"><span class=rk style="color:${medal[i]}">#${i+1}</span>
   <div class=row>${av(t.userName,t.proxyWallet,t.profileImage,'lg')}<div class=grow><div class="ell" style="font-weight:600;font-size:16px">${esc(nm(t.userName,t.proxyWallet))}</div><div class="mut num" style="font-size:12px">${short(t.proxyWallet)}</div></div></div>
   <div class="num pv ${isWR?'':key=='pnl'?ud(t.pnl):''}" style="font-size:32px;font-weight:600;margin-top:18px;letter-spacing:-.03em">${isWR?Math.round(t._s.wr*100)+'%':key=='pnl'?sg(t.pnl):usd(t.vol)}</div><div class="row sb" style="margin-top:10px"><span class=mut style="font-size:13px">${isWR?`win rate · ${t._s.w} of last ${t._s.n} · avg entry ${Math.round(t._s.avgE*100)}¢`:`${key=='pnl'?'Profit':'Volume'} · ${{DAY:'today',WEEK:'this week',MONTH:'this month',ALL:'all time'}[per]}`}</span>${isWR?`<span class="num up" style="font-size:13px">${abbr(t.pnl)}</span>`:`<span data-wr="${t.proxyWallet}" class=mut style="font-size:13px">…</span>`}</div></a>`).join('')}</div>
   <div class=mobile-leaders>${mobileRows}</div><div class=card style="margin-top:16px;overflow:hidden"><table class=tbl><thead><tr><th style="width:48px">#</th><th>Trader</th><th class="r clk" data-sort=${key=='pnl'?'PNL':'VOL'}>${key=='pnl'?'Profit':'Volume'}${!isWR?' ▼':''}</th><th class="r hide-m clk" data-sort=${key=='pnl'?'VOL':'PNL'}>${key=='pnl'?'Volume':'Profit'}</th><th class="r hide-m clk" data-sort=WR style="${isWR?'color:var(--ac)':''}">Win rate ${isWR?(dir=='asc'?'▲':'▼'):'↕'}</th><th></th></tr></thead><tbody>
   ${lb.map(t=>`<tr class=clk onclick="if(!event.target.closest('button,a'))location.hash='#/trader/${t.proxyWallet}'"><td class="mut num">${t.rank}</td><td><div class=row>${av(t.userName,t.proxyWallet,t.profileImage)}<div class=grow style="min-width:0"><div class=ell style="font-weight:550;max-width:260px">${esc(nm(t.userName,t.proxyWallet))}</div><div class="mut" style="font-size:12.5px" data-la="${t.proxyWallet}">&nbsp;</div></div></div></td>
   <td class="r num ${key=='pnl'?ud(t.pnl):''}" style="font-weight:600">${key=='pnl'?sg(t.pnl):abbr(t.vol,0)}</td><td class="r num mut hide-m">${key=='pnl'?abbr(t.vol,0):sg(t.pnl)}</td><td class="r hide-m" data-w="${t.proxyWallet}"><span class=mut>…</span></td><td class=r style="width:1%">${folBtn(t.proxyWallet,t.userName||short(t.proxyWallet))}</td></tr>`).join('')}</tbody></table></div>
   <p class=mut style="font-size:12.5px;margin-top:12px">Win rate = share of the trader's most recent resolved positions (up to 100) that made money, including losing positions they never cashed out. Hover a win rate to see the average entry price — buying at 99¢ wins often but earns little.</p>`;
  $$('th[data-sort]').forEach(th=>th.onclick=()=>{const v=th.dataset.sort;if(v=='WR'&&ord=='WR')LS.set('lbdir',dir=='asc'?'desc':'asc');else{LS.set('lbord',v);LS.set('lbdir','desc')}leaderboard()});
  const io=new IntersectionObserver(es=>es.forEach(async e=>{if(!e.isIntersecting)return;io.unobserve(e.target);const a=e.target.dataset.w||e.target.dataset.wr,s=await statOf(a);
    const wr=s.n<20?'<span class=mut title="Fewer than 20 resolved positions">—</span>':`<span class="num" title="${s.w} of last ${s.n} won · avg entry ${Math.round(s.avgE*100)}¢">${Math.round(s.wr*100)}%</span>`;
    if(e.target.dataset.w)e.target.innerHTML=wr+(s.n>=20?`<div class="mut" style="font-size:11.5px">avg entry ${Math.round(s.avgE*100)}¢</div>`:'');
    else e.target.innerHTML=s.n<20?'—':`<b class=num style="color:var(--text)">${Math.round(s.wr*100)}%</b> win rate`;
    if(s.last)$$(`[data-la="${a}"]`).forEach(la=>{const old=Date.now()/1000-s.last>7*86400;la.innerHTML=old?`<span class="pill warn" style="height:19px">Inactive · ${rel(s.last)}</span>`:`Active ${rel(s.last)}`});
  }),{rootMargin:'250px'});
  $$('[data-w],[data-wr]').forEach(x=>io.observe(x));
}

/* ---------- Trader profile ---------- */
async function trader(a){
  app.innerHTML=`<div class="card pad" style="height:120px">${sk(20,'30%')}</div><div class="grid g4" style="margin-top:16px">${[0,1,2,3].map(()=>`<div class="card pad">${sk(50)}</div>`).join('')}</div>`;
  const[closed,open,act,offR,trR,lt]=await Promise.all([resolvedOf(a,4),openOf(a),api(`activity?user=${a}&limit=1`),api(`v1/leaderboard?timePeriod=ALL&orderBy=PNL&user=${a}`),api(`traded?user=${a}`),lastTradeOf(a)]);
  if(location.hash.slice(2)!=='trader/'+a)return;
  const me=Array.isArray(offR)?offR[0]:null,official=me&&me.pnl!=null?me.pnl:null,name=nm(me?.userName||act[0]?.name||act[0]?.pseudonym,a),img=me?.profileImage||act[0]?.profileImage;
  const N=closed.length,wins=closed.filter(c=>c.realizedPnl>0).length;let cum=0;const cs=closed.map(c=>cum+=c.realizedPnl),net=official??cum,base=official!=null?official-cum:0,series=[base,...cs.map(x=>base+x)];
  const inv=closed.reduce((s,c)=>s+c.totalBought*c.avgPrice,0),avgE=N?closed.reduce((s,c)=>s+c.avgPrice,0)/N:0,openVal=open.reduce((s,p)=>s+(p.currentValue||0),0);
  const best=closed.reduce((b,c)=>c.realizedPnl>(b?.realizedPnl??-1e18)?c:b,null),last10=closed.slice(-10),inactive=lt&&Date.now()/1000-lt>7*86400;
  const cats={};closed.forEach(c=>{const k=classify(c.title),o=cats[k]??={n:0,w:0,p:0};o.n++;o.w+=c.realizedPnl>0;o.p+=c.realizedPnl});const catMax=Math.max(1,...Object.values(cats).map(o=>o.n));
  app.innerHTML=`<div class="card pad hero fade"><div class="row wrapf" style="gap:18px">${av(name,a,img,'lg')}<div class=grow><div class="row wrapf"><h1>${esc(name)}</h1>${inactive?`<span class="pill warn">Inactive · last trade ${rel(lt)}</span>`:lt?`<span class="pill up">Active ${rel(lt)}</span>`:''}</div>
   <div class="row wrapf mut" style="margin-top:6px;font-size:13px"><span class=num>${short(a)}</span><a class=btn sm id=cpy style="height:26px">${ic('copy',13)}</a><a class="btn sm" href="https://polymarket.com/profile/${a}" target=_blank style="height:26px">Polymarket ${ic('arrow',12)}</a></div></div>${folBtn(a,name,1)}</div></div>
  <div class="grid g4" style="margin-top:16px">
   <div class="card pad stat fade"><div class=k>Profit · all time</div><div class="v num ${ud(net)}">${abbr(net)}</div><div class=s>${official!=null?'Official Polymarket figure':`Sum of last ${N} resolved`}</div></div>
   <div class="card pad stat fade"><div class=k>Win rate</div><div class="v num">${N?(wins/N*100).toFixed(1)+'%':'—'}</div><div class=s>${wins} of last ${N} · avg entry ${Math.round(avgE*100)}¢</div></div>
   <div class="card pad stat fade"><div class=k>Return on stake</div><div class="v num ${ud(cum)}">${inv?(cum/inv>=0?'+':'')+(cum/inv*100).toFixed(1)+'%':'—'}</div><div class=s>Last ${N} resolved · ${abbr(cum)}</div></div>
   <div class="card pad stat fade"><div class=k>Open positions</div><div class="v num">${abbr(openVal,0)}</div><div class=s>${open.length} live market${open.length==1?'':'s'} · ${(trR?.traded||0).toLocaleString()} traded</div></div></div>
  <div class=split style="margin-top:16px"><div class="card pad fade"><div class="row sb"><div><h2>Profit over time</h2><div class=mut style="font-size:12.5px;margin-top:3px">${official!=null?`Last ${N} resolved positions, anchored to the official all-time total`:`Last ${N} resolved positions`}</div></div><div class="num ${ud(net)}" style="font-size:20px;font-weight:600">${sg(net)}</div></div><div id=ch class=chart style="margin-top:14px"></div></div>
   <div class=grid><div class="card pad fade"><h3>Recent form</h3><div class="form" style="margin:12px 0 4px">${last10.map(c=>`<i title="${esc(c.title)}: ${sg(c.realizedPnl)}" style="background:${c.realizedPnl>0?'var(--up)':'var(--down)'}"></i>`).join('')||'<span class=mut>—</span>'}</div><div class=mut style="font-size:12.5px">${last10.filter(c=>c.realizedPnl>0).length}–${last10.filter(c=>c.realizedPnl<=0).length} in the last ${last10.length}</div>
     ${best&&best.realizedPnl>0?`<div class=kv style="margin-top:10px;border-top:1px solid var(--line)"><span class=mut>Biggest recent win</span><b class="num up">${abbr(best.realizedPnl)}</b></div><div class="mut ell" style="font-size:12.5px">${esc(best.title)}</div>`:''}</div>
    <div class="card pad fade"><h3>Where they trade</h3><div style="margin-top:10px">${Object.entries(cats).sort((x,y)=>y[1].n-x[1].n).map(([k,o])=>`<div style="margin:10px 0"><div class="row sb" style="font-size:13px"><span>${k} <span class=mut>· ${o.n}</span></span><span class="num ${ud(o.p)}">${abbr(o.p)} <span class=mut>· ${Math.round(o.w/o.n*100)}% win</span></span></div><div class=bar style="margin-top:6px"><i style="width:${o.n/catMax*100}%"></i></div></div>`).join('')||'<span class=mut>—</span>'}</div><div class=mut style="font-size:11.5px">Categories are guessed from market titles.</div></div></div></div>
  <div class="sec"><div class=seg id=tabs><button data-t=o class=on>Open · ${open.length}</button><button data-t=c>Resolved · ${N}</button></div><input class=inp id=ps placeholder="Filter markets…" style="max-width:260px;height:36px"></div><div class=card style="overflow:hidden" id=pt></div>`;
  $('#cpy').onclick=()=>{navigator.clipboard?.writeText(a);toast('Wallet address copied')};
  area($('#ch'),series,{h:250,axis:1,fmt:(v,rg)=>rg<Math.abs(v)*.05?sg(v):abbr(v),tip:i=>i?`<b class="num ${ud(closed[i-1].realizedPnl)}">${sg(closed[i-1].realizedPnl)}</b> ${esc(closed[i-1].title.slice(0,40))}<div class="mut num">${dt(closed[i-1].timestamp)} · total ${abbr(series[i])}</div>`:`<span class=mut>Start of window</span>`});
  let tab='o';const draw=()=>{const q=$('#ps').value.toLowerCase(),L=(tab=='o'?open:[...closed].reverse()).filter(x=>x.title.toLowerCase().includes(q));
    $('#pt').innerHTML=`<table class=tbl><thead><tr><th>Market</th><th class=r>${tab=='o'?'Value':'Staked'}</th><th class=r>P&L</th><th class="r hide-m">${tab=='o'?'Price':'Resolved'}</th></tr></thead><tbody>${L.map(c=>{const st=tab=='o'?c.initialValue:c.totalBought*c.avgPrice,pnl=tab=='o'?c.cashPnl:c.realizedPnl;
      return`<tr><td><a class=mkt href="https://polymarket.com/event/${c.eventSlug}" target=_blank>${c.icon?`<img src="${esc(c.icon)}" alt="" loading=lazy onerror="this.style.visibility='hidden'">`:''}<div style="min-width:0"><div class=ell style="font-weight:500;max-width:420px">${esc(c.title)}</div><div class=mut style="font-size:12px;margin-top:2px"><span class="pill n" style="height:19px">${esc(c.outcome)}</span> avg ${(c.avgPrice*100).toFixed(1)}¢${c.unredeemed?' · not cashed out':''}</div></div></a></td>
      <td class="r num">${usd(tab=='o'?c.currentValue:st)}</td><td class="r num ${ud(pnl)}">${sg(pnl)}<div class=mut style="font-size:11.5px">${st?(pnl>=0?'+':'')+(pnl/st*100).toFixed(1)+'%':''}</div></td><td class="r mut hide-m num" style="font-size:12.5px">${tab=='o'?(c.curPrice*100).toFixed(1)+'¢':dt(c.timestamp)}</td></tr>`}).join('')||`<tr><td colspan=4 class=empty>${tab=='o'?'No live positions — everything this trader holds has already resolved.':'Nothing here.'}</td></tr>`}</tbody></table>`};
  $$('#tabs button').forEach(b=>b.onclick=()=>{tab=b.dataset.t;$$('#tabs button').forEach(x=>x.classList.toggle('on',x==b));draw()});$('#ps').oninput=draw;draw();
}

/* ---------- Whale feed ---------- */
let feedT,seenT=new Set();
// Feed ranking is deliberately opt-in: live trades remain instant by default,
// while P&L / win-rate views enrich only the wallets currently on screen.
const feedPnl=a=>cached('feed-pnl-'+a,async()=>{const r=await api(`v1/leaderboard?timePeriod=ALL&orderBy=PNL&user=${a}`),x=Array.isArray(r)?r[0]:r,n=Number(x?.pnl);return Number.isFinite(n)?n:null});
const feedWin=a=>cached('feed-win-'+a,async()=>{const s=await statOf(a);return s.n>=20?{v:s.wr,n:s.n}:null});
async function rankFeed(d,sort){
  if(sort=='latest')return[...d].sort((a,b)=>b.timestamp-a.timestamp);
  if(sort=='size')return[...d].sort((a,b)=>b.size*b.price-a.size*a.price);
  const wallets=[...new Set(d.map(t=>t.proxyWallet).filter(Boolean))].slice(0,sort=='win'?24:40),scores=new Map();
  await Promise.all(wallets.map(async a=>{try{scores.set(a,sort=='pnl'?await feedPnl(a):await feedWin(a))}catch(_){scores.set(a,null)}}));
  return d.map(t=>{const s=scores.get(t.proxyWallet);return{...t,_score:sort=='pnl'?(s==null?-Infinity:s):(s?.v??-1),_rank:sort=='pnl'?(s==null?'P&L unavailable':`All-time P&L ${sg(s)}`):s?`Win rate ${Math.round(s.v*100)}% · ${s.n} resolved`:'Win rate unavailable'}}).sort((a,b)=>b._score-a._score||b.timestamp-a.timestamp);
}
async function feed(){
  const min=LS.get('fmin',10000);let side='all',only=false,sort=LS.get('fsort','latest'),tickId=0;
  app.innerHTML=`<div class="ph fade"><div><h1>Whale Feed</h1><p class=lead>Large Polymarket trades as they happen. Click a trader to see their record.</p></div><span class=live id=fst>Live</span></div>
   <div class="row wrapf" style="margin-bottom:14px"><div class=row id=mins>${[1000,5000,10000,50000].map(v=>`<button class="chip ${v==min?'on':''}" data-v=${v}>${abbr(v,0).replace('+','')}+</button>`).join('')}</div><div class=seg id=sides><button data-s=all class=on>All</button><button data-s=BUY>Buys</button><button data-s=SELL>Sells</button></div>
   <div class=seg id=fsort>${[['latest','Latest'],['size','Size'],['pnl','P&L'],['win','Win rate']].map(([v,l])=>`<button data-v=${v} class="${sort==v?'on':''}">${l}</button>`).join('')}</div><button class=chip id=fo>${ic('star',13)} Tracking only</button><label class="row mut" style="font-size:13px;margin-left:auto;gap:6px"><input type=checkbox id=nt> Notify me</label></div><div class=card style="overflow:hidden" id=ft>${sk(300)}</div>`;
  let cur=min;$$('#mins .chip').forEach(b=>b.onclick=()=>{cur=+b.dataset.v;LS.set('fmin',cur);$$('#mins .chip').forEach(x=>x.classList.toggle('on',x==b));seenT.clear();tick()});
  $$('#sides button').forEach(b=>b.onclick=()=>{side=b.dataset.s;$$('#sides button').forEach(x=>x.classList.toggle('on',x==b));tick()});
  $$('#fsort button').forEach(b=>b.onclick=()=>{sort=b.dataset.v;LS.set('fsort',sort);$$('#fsort button').forEach(x=>x.classList.toggle('on',x==b));tick()});
  $('#fo').onclick=()=>{only=!only;$('#fo').classList.toggle('on',only);tick()};$('#nt').onchange=e=>e.target.checked&&Notification.requestPermission();
  async function tick(){const id=++tickId;if(!$('#ft'))return clearInterval(feedT);let d=await api(`trades?limit=250&filterType=CASH&filterAmount=${cur}`);if(!Array.isArray(d)||!$('#ft')||id!=tickId)return;
    if(side!='all')d=d.filter(t=>t.side==side);if(only)d=d.filter(t=>fol[t.proxyWallet]);
    const first=!seenT.size,fresh=d.filter(t=>!seenT.has(t.transactionHash+t.asset));d.forEach(t=>seenT.add(t.transactionHash+t.asset));
    if(sort=='pnl'||sort=='win')$('#fst').textContent='Ranking active wallets…';d=await rankFeed(d.slice(0,120),sort);if(!$('#ft')||id!=tickId)return;
    $('#ft').innerHTML=feedRows(d);if(!first&&sort=='latest')[...$('#ft').querySelectorAll('.feeditem')].slice(0,fresh.length).forEach(r=>r.classList.add('flash'));
    $('#fst').textContent='Live · '+new Date().toLocaleTimeString();if(!first&&fresh.length&&$('#nt').checked&&Notification.permission=='granted')new Notification(`${fresh.length} new whale trade(s)`)}
  tick();clearInterval(feedT);feedT=setInterval(tick,12000);
}

/* ---------- Profit Bot (backtest) ---------- */
async function backtest(){
  app.innerHTML=`<div class="ph fade"><div><h1>Profit Bot</h1><p class=lead>A backtest: replay the real resolved picks of top traders in order, restaking a share of the bankroll each time.</p></div></div><div id=bt>${sk(380)}</div>`;
  const ex=await loadExperts();if(!$('#bt'))return;
  const seen=new Set(),picks=ex.flatMap(e=>e.closed.map(c=>({...c,wr:e.wr}))).filter(c=>c.avgPrice>=.4&&c.avgPrice<=.9&&c.totalBought*c.avgPrice>=300).sort((a,b)=>a.timestamp-b.timestamp).filter(c=>{const k=c.conditionId+c.outcomeIndex;return seen.has(k)?0:(seen.add(k),1)});
  if(picks.length<5){$('#bt').innerHTML=`<div class="card empty">Not enough resolved picks to backtest right now.</div>`;return}
  const ret=c=>c.realizedPnl>0?1/c.avgPrice-1:-1,wins=picks.filter(c=>c.realizedPnl>0).length,cfg=LS.get('bt',{s:100,f:5});
  const open={};ex.forEach(e=>e.open.forEach(p=>{if(p.curPrice<.03||p.curPrice>.97)return;const k=p.conditionId+p.outcomeIndex,o=open[k]??={...p,n:0,inv:0,wr:0,who:[]};o.n++;o.inv+=p.initialValue;o.wr=Math.max(o.wr,e.wr);o.who.push(e.userName)}));
  const ideas=Object.values(open).filter(o=>o.n>=2).sort((a,b)=>b.n-a.n||b.inv-a.inv).slice(0,9);
  $('#bt').innerHTML=`<div class="card pad hero fade"><div class="grid g2" style="gap:28px"><div><label class=lbl>Starting amount <b class=num id=v1 style="color:var(--text);float:right"></b></label><input type=range id=s1 min=10 max=1000 step=10 value=${cfg.s}></div><div><label class=lbl>Restake per pick <b class=num id=v2 style="color:var(--text);float:right"></b></label><input type=range id=s2 min=1 max=25 value=${cfg.f}></div></div>
   <div class="row sb wrapf" style="margin-top:26px;align-items:flex-end"><div><div class=mut style="font-size:13px" id=hl></div><div class="num up" id=big style="font-size:48px;font-weight:600;letter-spacing:-.06em;line-height:1.1;margin-top:4px"></div></div><div style="text-align:right"><div class="num" style="font-size:20px;font-weight:600">${picks.length} picks</div><div class=mut style="font-size:12.5px">since ${dt(picks[0].timestamp)}</div></div></div>
   <div id=bch class=chart style="margin-top:18px"></div>
   <div class="grid g3" style="margin-top:18px;border-top:1px solid var(--line);padding-top:18px"><div class=stat><div class=k>Win rate</div><div class="v num">${(wins/picks.length*100).toFixed(1)}%</div></div><div class=stat><div class=k>Avg return per pick</div><div class="v num ${ud(picks.reduce((s,c)=>s+ret(c),0))}">${(picks.reduce((s,c)=>s+ret(c),0)/picks.length*100).toFixed(1)}%</div></div><div class=stat><div class=k>Avg entry price</div><div class="v num">${Math.round(picks.reduce((s,c)=>s+c.avgPrice,0)/picks.length*100)}¢</div></div></div>
   <div class="row sb" style="margin-top:18px;font-size:12.5px"><span><b class=num>${wins}</b> <span class=mut>won</span></span><span><b class=num>${picks.length-wins}</b> <span class=mut>lost</span></span></div><div style="display:flex;gap:3px;margin-top:7px"><div style="flex:${wins};height:6px;border-radius:6px;background:var(--up)"></div><div style="flex:${picks.length-wins};height:6px;border-radius:6px;background:var(--down)"></div></div>
   <p class=mut style="font-size:12px;margin:14px 0 0">Rules: entries between 40¢ and 90¢ with at least $300 staked, first trader per market only. Uses each top trader's most recent resolved positions. Past results don't predict future ones.</p></div>
  <div class=sec><div><h2>Consensus picks</h2><div class=mut style="font-size:13px;margin-top:3px">Live markets where two or more top traders currently hold the same side.</div></div></div>
  <div class="grid g3">${ideas.map((p,i)=>`<div class="card pad fade" style="animation-delay:${i*40}ms"><div class="row sb mut" style="font-size:12px"><span>${classify(p.title)}</span><a href="https://polymarket.com/event/${p.eventSlug}" target=_blank>View ${ic('arrow',11)}</a></div>
    <div class=mkt style="margin-top:12px;align-items:flex-start">${p.icon?`<img src="${esc(p.icon)}" alt="" style="width:42px;height:42px" onerror="this.style.visibility='hidden'">`:''}<div style="font-weight:600;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(p.title)}</div></div>
    <div class="row sb" style="margin-top:12px;align-items:flex-end"><div id=sp${i} class=chart style="height:64px;flex:1"></div><div style="text-align:right;margin-left:12px"><div class="num" style="font-size:24px;font-weight:600;color:#64b5ff">${(p.curPrice*100).toFixed(0)}¢</div><div class=mut style="font-size:11.5px">${esc(p.outcome)}</div></div></div>
    <div class="row sb" style="margin-top:12px;font-size:12.5px;border-top:1px solid var(--line);padding-top:12px"><span title="${esc(p.who.join(', '))}">${ic('star',12)} <b>${p.n}</b> <span class=mut>top traders</span></span><span class=num>${abbr(p.inv,0)} <span class=mut>in</span></span></div></div>`).join('')||`<div class="card empty" style="grid-column:1/-1">No consensus picks right now.</div>`}</div>`;
  const run=()=>{const s=+$('#s1').value,f=+$('#s2').value/100;LS.set('bt',{s,f:f*100});$('#s1').style.setProperty('--p',(s-10)/990*100+'%');$('#s2').style.setProperty('--p',(f*100-1)/24*100+'%');$('#v1').textContent='$'+s;$('#v2').textContent=Math.round(f*100)+'%';
    let b=s;const v=[s,...picks.map(c=>b*=1+f*ret(c))],end=v[v.length-1];$('#hl').textContent=`$${s} restaking ${Math.round(f*100)}% per pick would now be`;
    $('#big').textContent=end>=1e12?'$'+end.toExponential(2):usd(end,end<1000?2:0);$('#big').className='num '+ud(end-s);
    area($('#bch'),v,{h:230,axis:1,fmt:x=>abbr(x,0),tip:i=>i?`<b class=num>${usd(v[i],2)}</b><div class=mut>Pick #${i} · ${dt(picks[i-1].timestamp)} · ${picks[i-1].realizedPnl>0?'won':'lost'}</div><div class=mut style="max-width:260px;white-space:normal">${esc(picks[i-1].title)}</div>`:'Start'})};
  $('#s1').oninput=$('#s2').oninput=run;run();
  ideas.forEach(async(p,i)=>{const h=(await api(`clob/prices-history?market=${p.asset}&interval=1m&fidelity=360`)).history,el=$('#sp'+i);if(h&&el&&h.length>1)area(el,h.map(x=>x.p),{h:64,color:'#0a84ff',sw:1.6,t:6,b:4})});
}

/* ---------- Tracking + notes ---------- */
function journal(){
  const fl=Object.entries(fol),notes=LS.get('notes',[]);
  app.innerHTML=`<div class="ph fade"><div><h1>Tracking</h1><p class=lead>Traders you track${OWNER?' — your Auto Trader copies these':''}. Plus your private trade notes.</p></div></div>
   <div class="grid g3" id=fg>${fl.map(([a,n])=>`<a href="#/trader/${a}" class="card pad fade"><div class=row>${av(n,a)}<div class=grow><div class=ell style="font-weight:600">${esc(n)}</div><div class="mut num" style="font-size:12px">${short(a)}</div></div>${folBtn(a,n)}</div><div class="row sb" style="margin-top:14px;font-size:13px" data-fs="${a}">${sk(14)}</div></a>`).join('')||`<div class="card empty" style="grid-column:1/-1">You're not tracking anyone yet. Tap ${ic('star',13)} on the <a href="#/leaderboard" style="color:#64b5ff">leaderboard</a>.</div>`}</div>
   <div class=sec><h2>Notes</h2></div><form id=nf class=row><input class=inp id=nt placeholder="Write a note…"><button class="btn pri">Add</button></form>
   <div style="margin-top:12px" class=grid>${notes.map((n,i)=>`<div class="card pad row sb" style="padding:14px 18px"><div><div>${esc(n.t)}</div><div class=mut style="font-size:12px;margin-top:4px">${new Date(n.d).toLocaleString()}</div></div><button class="btn ic sm" data-del=${i}>${ic('x',13)}</button></div>`).join('')}</div>`;
  $('#nf').onsubmit=e=>{e.preventDefault();const t=$('#nt').value.trim();if(!t)return;notes.unshift({t,d:Date.now()});LS.set('notes',notes);journal()};
  $$('[data-del]').forEach(b=>b.onclick=()=>{notes.splice(+b.dataset.del,1);LS.set('notes',notes);journal()});
  fl.forEach(async([a])=>{const s=await statOf(a),el=$(`[data-fs="${a}"]`);if(el)el.innerHTML=`<span class=mut>Win rate <b class=num style="color:var(--text)">${s.n>=20?Math.round(s.wr*100)+'%':'—'}</b></span><span class=mut>${s.last?'Last trade '+rel(s.last):'No trades'}</span>`});
}

/* ---------- Analyzer ---------- */
function analyze(){
  app.innerHTML=`<div class="ph fade"><div><h1>Analyzer</h1><p class=lead>A plain-English read on any trader's edge, risk and style — computed from their real resolved positions.</p></div></div>
   <form id=af class=row><input class=inp id=aq placeholder="Paste a 0x wallet address" value="${esc(LS.get('aq',''))}"><button class="btn pri">${ic('spark',15)} Analyze</button></form><div id=ar style="margin-top:16px"></div>`;
  $('#af').onsubmit=async e=>{e.preventDefault();const a=$('#aq').value.trim().toLowerCase();if(!/^0x[0-9a-f]{40}$/.test(a)){$('#ar').innerHTML=`<div class="card empty">Enter a valid wallet (0x…). Tip: copy it from any trader's profile.</div>`;return}LS.set('aq',a);
    $('#ar').innerHTML=sk(200);const[c,o,lt]=await Promise.all([resolvedOf(a,4),openOf(a),lastTradeOf(a)]);if(c.length<5){$('#ar').innerHTML=`<div class="card empty">Not enough resolved positions to analyze.</div>`;return}
    const w=c.filter(x=>x.realizedPnl>0),wr=w.length/c.length,avgE=c.reduce((s,x)=>s+x.avgPrice,0)/c.length,pnl=c.reduce((s,x)=>s+x.realizedPnl,0),inv=c.reduce((s,x)=>s+x.totalBought*x.avgPrice,0),best=Math.max(...c.map(x=>x.realizedPnl)),sz=c.map(x=>x.totalBought*x.avgPrice).sort((p,q)=>p-q),med=sz[sz.length>>1],edge=wr-avgE,L=c.slice(-10),lw=L.filter(x=>x.realizedPnl>0).length;
    const cats={};c.forEach(x=>{const k=classify(x.title);cats[k]=(cats[k]||0)+x.realizedPnl});const bc=Object.entries(cats).sort((p,q)=>q[1]-p[1])[0];
    const score=Math.max(0,Math.min(100,Math.round(50+edge*150+(pnl>=0?10:-15)+(lw-5)*2-(lt&&Date.now()/1000-lt>14*86400?10:0))));
    const B=[[edge>.03?'up':edge<-.02?'down':'',`<b>Edge.</b> Wins ${(wr*100).toFixed(0)}% of the time at an average entry of ${(avgE*100).toFixed(0)}¢. The price implies ~${(avgE*100).toFixed(0)}% — so they beat the market by ${(edge*100>=0?'+':'')+(edge*100).toFixed(1)} points.`],
      [pnl>=0?'up':'down',`<b>Results.</b> ${sg(pnl)} on ${usd(inv)} staked (${inv?(pnl/inv*100).toFixed(1):0}% return) across the last ${c.length} resolved positions.`],
      [best/Math.max(1,pnl)>.6?'down':'up',`<b>Concentration.</b> The single best win is ${pnl>0?Math.round(best/pnl*100)+'% of':'larger than'} total profit${best/Math.max(1,pnl)>.6?' — results lean on one big bet.':' — profits are well spread.'}`],
      ['',`<b>Style.</b> ${avgE>.85?'Buys near-certain outcomes for small, frequent gains — a high win rate here is expected, not impressive.':avgE>.65?'Favors favorites.':avgE<.35?'Hunts long shots — expect a low win rate with occasional big payouts.':'Trades mid-range odds.'} Median stake ${usd(med)}.`],
      [lw>=7?'up':lw<=3?'down':'',`<b>Form.</b> ${lw}–${L.length-lw} over the last ${L.length}. ${o.length} live position${o.length==1?'':'s'}. ${lt?'Last trade '+rel(lt)+'.':''}`],
      ['',`<b>Best category.</b> ${bc[0]} (${sg(bc[1])}).`]];
    $('#ar').innerHTML=`<div class="split fade"><div class="card pad">${B.map(([k,t])=>`<div style="padding:13px 0;border-bottom:1px solid var(--line);line-height:1.55" class=${k}><span style="color:var(--text)">${t}</span></div>`).join('')}</div>
     <div class="card pad hero" style="text-align:center"><div class=mut style="font-size:13px">Analyzer score</div><div class="num ${score>=60?'up':score<40?'down':''}" style="font-size:64px;font-weight:600;letter-spacing:-.06em;line-height:1.1;margin:8px 0">${score}</div><div class=bar><i style="width:${score}%"></i></div><a class="btn" style="margin-top:18px;width:100%" href="#/trader/${a}">Open profile ${ic('chev',13)}</a><p class=mut style="font-size:11.5px;margin:12px 0 0">Score blends edge vs. implied odds, profitability, recent form and activity. Not financial advice.</p></div></div>`};
  if($('#aq').value)$('#af').requestSubmit();
}

/* ---------- Help & setup ---------- */
function help(){
  app.innerHTML=`<div class="ph fade"><div><h1>Help</h1><p class=lead>Signals come from public Polymarket wallets. Orders go only to your Polymarket US account.</p></div></div>
   <div class="grid g2"><div class="card pad"><h2>Turning on the Auto Trader</h2><div style="margin-top:8px">${[['Create a password','Open <a href="#/bot" style="color:#64b5ff">Auto Trader</a> — the first visit asks you to make one.'],['Connect Polymarket US','Create a Key ID and Secret Key in the Polymarket US developer portal and paste them into Auto Trader.'],['Pick a size','Choose what % of your balance each copied trade uses, then flip the switch on.'],['Track traders','Tap ☆ on anyone on the international Polymarket leaderboard to use their public wallet as a signal source.']].map(([t,d],i)=>`<div class=step><b class=ok>${i+1}</b><div><div style="font-weight:550">${t}</div><div class=mut style="font-size:13px;margin-top:3px">${d}</div></div></div>`).join('')}</div></div>
   <div class=grid><div class="card pad"><h3>How the bot decides</h3><div class=mut style="font-size:13.5px;line-height:1.6;margin-top:8px">When a tracked international wallet buys, the bot searches Polymarket US. It requires matching key words, all numbers and dates, direction words such as above/below/before/not, compatible resolution dates, and a clear winning candidate. It then uses an immediate-or-cancel US order only when the US ask is within your price gap. Ambiguous or unavailable markets are skipped with a reason and match score.</div></div>
    <div class="card pad"><h3>Accuracy</h3><div class=mut style="font-size:13.5px;line-height:1.6;margin-top:8px">Profit and volume are Polymarket's official numbers. Win rates use each trader's most recent resolved positions, including losers they never cashed out. "Open" only shows markets that haven't resolved yet.</div></div></div></div>`;
}

/* ---------- router ---------- */
function route(){clearInterval(feedT);typeof botStopPoll=='function'&&botStopPoll();$('#side').classList.remove('open');renderSide();
  const[p,a]=location.hash.slice(2).split('/');window.scrollTo(0,0);
  const R={'':overview,leaderboard,feed,terminal:feed,backtest,profits:backtest,bot:botPage,journal,analyze,ai:analyze,help,search:openPal,trader:()=>trader(a)};(R[p]||overview)()}
['gesturestart','gesturechange','gestureend'].forEach(t=>document.addEventListener(t,e=>e.preventDefault(),{passive:false}));
let lastTouchEnd=0;document.addEventListener('touchend',e=>{const n=Date.now();if(n-lastTouchEnd<300&&!e.target.closest('input,textarea'))e.preventDefault();lastTouchEnd=n},{passive:false});
if(navigator.standalone||matchMedia('(display-mode: standalone)').matches)document.documentElement.classList.add('standalone');
applyTheme();matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{applyTheme();renderSide()});
addEventListener('hashchange',route);
fetch('/api/auth?op=me').then(r=>r.json()).then(m=>{OWNER=!!m.owner;if(OWNER){loadFollows();fetch('/api/bot?op=state').then(r=>r.ok?r.json():null).then(s=>{if(s){BOTON=s.enabled;renderSide()}}).catch(()=>{})}renderSide()}).catch(()=>{});
route();

/* ---------- tap haptics ----------
   The only haptic a web page can reach on iPhone is the tick iOS plays when a real tap flips an
   <input type="checkbox" switch> (flips made from script are ignored). Every tappable control gets a transparent
   <label for=hapticSwitch> laid over it ahead of time, so the tap itself lands on the label and flips the switch
   (tick). Nothing appears or changes under the finger during the tap — iOS swallows the first tap when content
   changes under it, which is what caused the "tap twice" bug — and the tap's click still bubbles to the control.
   A label is the click's activation target, so links / submit buttons / <summary> are activated by hand below.
   Elsewhere navigator.vibrate stands in. */
const HAPTIC_TARGETS='button, a[href], .chip, .sw, summary, tr.clk > td';
const IS_IOS=/iP(hone|od|ad)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
(function setupHaptics(){
  if(!IS_IOS){document.addEventListener('click',e=>{if(e.isTrusted&&typeof navigator.vibrate==='function'&&e.target.closest?.(HAPTIC_TARGETS))navigator.vibrate(8)},true);return}
  const sw=document.createElement('input');sw.type='checkbox';sw.id='hapticSwitch';sw.tabIndex=-1;sw.className='haptic-switch';sw.setAttribute('switch','');sw.setAttribute('aria-hidden','true');document.body.append(sw);
  const arm=root=>{for(const el of root.querySelectorAll?root.querySelectorAll(HAPTIC_TARGETS):[]){if(el.querySelector(':scope>.hpl'))continue;
    const l=document.createElement('label');l.htmlFor='hapticSwitch';l.className='hpl';l.setAttribute('aria-hidden','true');el.classList.add('hpt');el.append(l)}};
  new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes){if(n.classList?.contains('hpl'))continue;const r=n.nodeType==1?(n.parentElement||n):n.parentElement;r&&arm(r)}}).observe(document.body,{childList:true,subtree:true});
  arm(document.body);
  document.addEventListener('click',e=>{const l=e.target;if(!l.classList?.contains('hpl'))return;const host=l.parentElement;
    if(host.disabled){e.preventDefault();e.stopImmediatePropagation();return}
    // the label is the activation target, so do the host's native action ourselves (its click listeners still run via bubbling)
    queueMicrotask(()=>{if(e.defaultPrevented&&host.tagName!=='A')return;
      if(host.tagName==='A'&&!e.defaultPrevented){const href=host.getAttribute('href');if(!href||href=='#')return;host.target=='_blank'?window.open(host.href,'_blank','noopener'):href.startsWith('#')?location.hash=href:location.href=host.href}
      else if(host.tagName==='BUTTON'&&host.form&&(host.type||'submit')==='submit')host.form.requestSubmit();
      else if(host.tagName==='SUMMARY')host.parentElement.open=!host.parentElement.open});
  },true);
})();
