/* ---------- Auto Trader: mirrors followed traders' Polymarket buys/sells on Kalshi ---------- */
const BCFG0={paper:true,pct:5,secret:'',ack:false,confirm:false,minUsd:1000,maxPrice:85,slip:3,maxUse:50,thresh:75,pbal:1000};
const BCFG=()=>({...BCFG0,...LS.get('botcfg',{})});
const BOT={on:false,timer:null,seen:new Set(),since:0,mk:null,mkEnv:'',mkT:0,errs:0,pend:[],sig:0,status:null,bal:null};
const STOP=new Set('will the a an of in on at to be by for and or is are with from vs than this that after before win wins won'.split(' '));
const tok=s=>String(s||'').toLowerCase().replace(/[^a-z0-9.]+/g,' ').split(' ').filter(w=>w&&!STOP.has(w)&&(w.length>1||/\d/.test(w)));
const blog=()=>LS.get('botlog',[]),bpos=()=>LS.get('botpos',[]),bpnl=()=>LS.get('botpnl',0);
function blogAdd(e){const l=blog();l.unshift({t:Date.now(),...e});LS.set('botlog',l.slice(0,300));renderBot()}
const kfetch=async(op,body,cfg)=>{const r=await fetch('/api/kalshi'+(body?'':`?op=${op}`),body?{method:'POST',headers:{'content-type':'application/json','x-bot-secret':cfg.secret},body:JSON.stringify({op,...body})}:{headers:{'x-bot-secret':cfg.secret}});let j;try{j=await r.json()}catch(e){j={error:'bad response'}}return{ok:r.ok,status:r.status,j}};
const kenv=cfg=>cfg.paper?'prod':(BOT.status?.env||'demo');
const centsOf=(d,c)=>{const x=parseFloat(d);return isNaN(x)?(c??0):Math.round(x*100)};
const balOf=j=>{const b=j&&j.balance;if(b&&typeof b=='object'){const d=parseFloat(b.balance_dollars);if(!isNaN(d))return d;if(typeof b.balance=='number')return b.balance/100}return null};
async function refreshBal(cfg){
  if(cfg.paper){BOT.bal=cfg.pbal+bpnl();return}
  const r=await kfetch('status',null,cfg);if(r.ok){BOT.status=r.j;const b=balOf(r.j);if(b!=null)BOT.bal=b}
}
async function loadKalshi(env){
  if(BOT.mk&&BOT.mkEnv==env&&Date.now()-BOT.mkT<6e5)return BOT.mk;
  let cur='',all=[];
  for(let i=0;i<6;i++){const r=await fetch(`/api/kalshi?op=markets&env=${env}${cur?'&cursor='+encodeURIComponent(cur):''}`);if(!r.ok)break;const j=await r.json();all.push(...(j.markets||[]));cur=j.cursor;if(!cur)break}
  BOT.mk=all.map(m=>({t:m.ticker,title:m.title,sub:m.yes_sub_title,ya:centsOf(m.yes_ask_dollars,m.yes_ask),na:centsOf(m.no_ask_dollars,m.no_ask),tk:new Set(tok(`${m.title} ${m.yes_sub_title||''}`))})).filter(m=>m.t&&m.tk.size);BOT.mkEnv=env;BOT.mkT=Date.now();return BOT.mk;
}
function matchMarket(title,mk,th){
  const A=[...new Set(tok(title))];if(A.length<3)return null;const nums=A.filter(w=>/\d/.test(w));let best=null;
  for(const m of mk){let h=0;for(const w of A)if(m.tk.has(w))h++;const s=h/A.length;if(s<th)continue;if(!nums.every(n=>m.tk.has(n)))continue;const rv=h/m.tk.size;if(rv<.25)continue;if(!best||s>best.s||(s==best.s&&rv>best.rv))best={m,s,rv}}
  return best;
}
/* ----- buying ----- */
async function botBuySignal(t,cfg,mk){
  const base={trader:t.name||t.pseudonym||short(t.proxyWallet),title:t.title,outcome:t.outcome,pm:Math.round(t.price*100),usd:t.size*t.price,act:'buy'};
  const o=String(t.outcome).toLowerCase();if(o!='yes'&&o!='no')return blogAdd({...base,st:'skip',note:'not a Yes/No market'});
  const b=matchMarket(t.title,mk,cfg.thresh/100);if(!b)return blogAdd({...base,st:'skip',note:'not on Kalshi'});
  const ask=o=='yes'?b.m.ya:b.m.na,e={...base,tk:b.m.t,kt:b.m.title+(b.m.sub?' — '+b.m.sub:''),side:o,ask,score:Math.round(b.s*100),asset:t.asset};
  if(!ask||ask<1||ask>99)return blogAdd({...e,st:'skip',note:'no Kalshi price'});
  if(ask>cfg.maxPrice)return blogAdd({...e,st:'skip',note:`price ${ask}¢ too high`});
  if(ask>e.pm+cfg.slip)return blogAdd({...e,st:'skip',note:`Kalshi ${ask}¢ worse than Polymarket ${e.pm}¢`});
  if(bpos().some(p=>p.tk==e.tk))return blogAdd({...e,st:'skip',note:'already holding this market'});
  const bal=BOT.bal;if(!(bal>0))return blogAdd({...e,st:'skip',note:'balance unknown'});
  e.count=Math.floor(bal*cfg.pct/100*100/ask);if(e.count<1)return blogAdd({...e,st:'skip',note:`${cfg.pct}% of balance is too small for 1 contract`});e.cost=e.count*ask/100;
  const inUse=bpos().reduce((s,p)=>s+p.cost,0);if(inUse+e.cost>bal*cfg.maxUse/100)return blogAdd({...e,st:'skip',note:`would use more than ${cfg.maxUse}% of balance`});
  if(cfg.paper)return fillBuy(e,e.count,'practice fill');
  if(cfg.confirm){e.id=Math.random().toString(36).slice(2);BOT.pend.push(e);blogAdd({...e,st:'pending',note:'waiting for your OK'});return renderBot()}
  return botExecBuy(e,cfg);
}
function fillBuy(e,count,note){const p=bpos();p.push({id:Math.random().toString(36).slice(2),tk:e.tk,side:e.side,count,ask:e.ask,cost:count*e.ask/100,asset:e.asset,trader:e.trader,title:e.title,kt:e.kt,t:Date.now()});LS.set('botpos',p);blogAdd({...e,count,st:'bought',note})}
async function botExecBuy(e,cfg){
  const r=await kfetch('order',{ticker:e.tk,side:e.side,count:e.count,price_cents:e.ask,ref:`pm-${Date.now()}-${e.tk}`.slice(0,60)},cfg);
  if(r.ok){const f=Math.floor(parseFloat(r.j.fill_count||0));BOT.errs=0;if(f>0)return fillBuy(e,f,`${r.j._env||''} filled ${f}/${e.count}`);return blogAdd({...e,st:'skip',note:'order did not fill (price moved)'})}
  botErr(e,r)}
function botErr(e,r){BOT.errs++;blogAdd({...e,st:'error',note:r.j.error||JSON.stringify(r.j).slice(0,120)});if(BOT.errs>=3){botStop();blogAdd({trader:'bot',title:'Stopped after 3 errors in a row',st:'error',note:''})}}
/* ----- selling ----- */
async function sellPos(p,why,cfg){
  const e={trader:p.trader,title:p.title,tk:p.tk,kt:p.kt,side:p.side,count:p.count,act:'sell',outcome:p.side};
  const m=await (await fetch(`/api/kalshi?op=market&ticker=${encodeURIComponent(p.tk)}&env=${kenv(cfg)}`)).json().then(j=>j.market||null).catch(()=>null);
  const bid=m?centsOf(p.side=='yes'?m.yes_bid_dollars:m.no_bid_dollars,p.side=='yes'?m.yes_bid:m.no_bid):0;
  if(!m||bid<1)return blogAdd({...e,st:'skip',note:`${why}: no buyers right now`});
  e.ask=bid;
  const done=(cnt,price)=>{const proceeds=cnt*price/100,costPart=p.cost*cnt/p.count,left=bpos().filter(x=>x.id!=p.id);
    if(cnt<p.count)left.push({...p,count:p.count-cnt,cost:p.cost-costPart});LS.set('botpos',left);LS.set('botpnl',bpnl()+proceeds-costPart);
    blogAdd({...e,count:cnt,st:'sold',note:`${why} · ${proceeds-costPart>=0?'+':'-'}$${Math.abs(proceeds-costPart).toFixed(2)}`})};
  if(cfg.paper)return done(p.count,bid);
  const r=await kfetch('order',{action:'sell',ticker:p.tk,side:p.side,count:p.count,price_cents:Math.max(1,bid-5),ref:`sell-${Date.now()}-${p.tk}`.slice(0,60)},cfg);
  if(r.ok){const f=Math.floor(parseFloat(r.j.fill_count||0));if(f>0)return done(f,bid);return blogAdd({...e,st:'skip',note:`${why}: sell did not fill`})}
  botErr(e,r)}
async function sellAll(){const cfg=BCFG();if(cfg.paper==false&&!cfg.secret){alert('Enter your bot secret first.');return}for(const p of bpos())await sellPos(p,'sold everything',cfg);await refreshBal(cfg);renderBot()}
/* ----- loop ----- */
async function botTick(){
  const cfg=BCFG();if(!BOT.on)return;
  let addrs=Object.keys(fol);if(!addrs.length)addrs=(await loadExperts()).slice(0,10).map(e=>e.proxyWallet);addrs=addrs.slice(0,15);
  await refreshBal(cfg);let mk;try{mk=await loadKalshi(kenv(cfg))}catch(e){return}
  const res=(await Promise.all(addrs.map(a=>api(`trades?user=${a}&limit=15`)))).flat().filter(t=>t&&t.timestamp>=BOT.since&&!BOT.seen.has(t.transactionHash+t.asset+t.size+t.side)).sort((a,b)=>a.timestamp-b.timestamp);
  for(const t of res){if(!BOT.on)break;BOT.seen.add(t.transactionHash+t.asset+t.size+t.side);
    if(t.side=='SELL'){for(const p of bpos().filter(p=>p.asset==t.asset))await sellPos(p,`${p.trader} sold`,cfg)}
    else if(t.side=='BUY'&&t.size*t.price>=cfg.minUsd){BOT.sig++;await botBuySignal(t,cfg,mk)}}
  $('#bst')&&($('#bst').textContent=`Watching ${addrs.length} trader(s) · checked ${new Date().toLocaleTimeString()}`);renderBot();
}
async function botStart(){
  const cfg=BCFG();
  if(!cfg.paper){
    if(!cfg.secret){alert('Enter your bot secret first (or turn Practice mode on).');return}
    const r=await kfetch('status',null,cfg);BOT.status=r.j;
    if(!r.ok||!r.j.configured){alert('Server check failed: '+(r.j.error||'Kalshi keys not set on the server'));return}
    if(r.j.disabled||!r.j.liveAllowed){alert('Trading is disabled on the server.');return}
    if(r.j.env=='prod'&&!cfg.ack){alert('Tick "I understand this uses real money" first.');return}
  }
  BOT.on=true;BOT.errs=0;BOT.since=Math.floor(Date.now()/1000)-20;BOT.seen.clear();BOT.sig=0;botTick();clearInterval(BOT.timer);BOT.timer=setInterval(botTick,20000);renderBot();
}
function botStop(){BOT.on=false;clearInterval(BOT.timer);BOT.pend=[];renderBot()}
/* ----- UI ----- */
function renderBot(){
  if(!$('#bl'))return;const cfg=BCFG(),L=blog(),P=bpos(),inUse=P.reduce((s,p)=>s+p.cost,0),pnl=bpnl();
  $('#bsw').textContent=BOT.on?'Running':'Stopped';$('#bsw').style.color=BOT.on?'var(--g)':'#9a9aa6';$('#bgo').textContent=BOT.on?'Stop bot':'Start bot';$('#bgo').className='btn'+(BOT.on?' u':'');
  $('#bbal').textContent=BOT.bal!=null?'$'+BOT.bal.toFixed(2):(cfg.paper?'$'+(cfg.pbal+pnl).toFixed(2):'—');$('#buse').textContent='$'+inUse.toFixed(2);
  $('#bpnl').textContent=(pnl>=0?'+':'-')+'$'+Math.abs(pnl).toFixed(2);$('#bpnl').className=pnl>=0?'pos':'neg';
  $('#bpd').innerHTML=BOT.pend.length?`<div class=tw style="margin-top:16px"><table>${BOT.pend.map(e=>`<tr style="height:46px"><td>${esc(e.trader)} bought <b>${esc(e.outcome)}</b> — ${esc(e.title)}<div class=mut style="font-size:9px">Kalshi: ${e.count} × ${e.ask}¢ = $${e.cost.toFixed(2)}</div><td class=r style="width:160px"><button class=btn data-ap="${e.id}" style="height:28px">Buy</button> <button class="btn u" data-sk="${e.id}" style="height:28px">Skip</button></tr>`).join('')}</table></div>`:'';
  $('#bpd').querySelectorAll('[data-ap]').forEach(b=>b.onclick=async()=>{const e=BOT.pend.find(x=>x.id==b.dataset.ap);BOT.pend=BOT.pend.filter(x=>x!==e);renderBot();if(e)await botExecBuy(e,BCFG())});
  $('#bpd').querySelectorAll('[data-sk]').forEach(b=>b.onclick=()=>{BOT.pend=BOT.pend.filter(x=>x.id!=b.dataset.sk);renderBot()});
  $('#bpo').innerHTML='<tr><th>Open position<th class=r>Contracts<th class=r>Cost<th></tr>'+(P.map(p=>`<tr style="height:44px"><td>${esc(p.title)}<div class=mut style="font-size:9px">${p.side.toUpperCase()} on ${esc(p.tk)} · copied ${esc(p.trader)}</div><td class=r>${p.count}<td class=r>$${p.cost.toFixed(2)}<td class=r style="width:70px"><button class="btn u" data-sell="${p.id}" style="height:26px;padding:0 10px">Sell</button></tr>`).join('')||'<tr style="height:44px"><td colspan=4 class=mut>No open positions.</tr>');
  $('#bpo').querySelectorAll('[data-sell]').forEach(b=>b.onclick=async()=>{const p=bpos().find(x=>x.id==b.dataset.sell);if(p){await sellPos(p,'sold by you',BCFG());await refreshBal(BCFG());renderBot()}});
  const C={bought:'var(--g)',sold:'#6370ff',pending:'#e8a91a',skip:'#6c6c78',error:'#ff4d5e'};
  $('#bl').innerHTML='<tr><th>Time<th>What happened<th>Result</tr>'+(L.slice(0,60).map(e=>`<tr style="height:44px"><td class=mut style="white-space:nowrap">${new Date(e.t).toLocaleTimeString()}<td>${e.act=='sell'?'Sell':esc(e.trader)+' bought <b>'+esc(e.outcome||'')+'</b> @'+(e.pm||'')+'¢'} — ${esc(e.title)}${e.tk?`<div class=mut style="font-size:9px">${esc(e.tk)} · ${(e.side||'').toUpperCase()} ${e.ask||''}¢${e.count?` × ${e.count}`:''}</div>`:''}<td style="color:${C[e.st]||'#fff'}"><b>${e.st}</b><div class=mut style="font-size:9px">${esc(e.note||'')}</div></tr>`).join('')||'<tr style="height:44px"><td colspan=3 class=mut>Nothing yet — start the bot.</tr>')
}
function botPage(){
  const c=BCFG(),fld=(k,l,u)=>`<div><div class=lab style="margin-bottom:6px">${l}</div><input class=fld type=number data-k=${k} value="${c[k]}" style="width:100%;cursor:text" title="${u||''}"></div>`;
  app.innerHTML=`<h1>Auto Trader</h1><div class=sub style="font-size:10.9px">Copies the buys and sells of the traders you follow (or the top 10) onto Kalshi.</div>
  <div style="display:grid;grid-template-columns:1fr 288px;gap:20px;margin-top:24px;align-items:start">
   <div class=cd style="border-radius:22px;padding:22px"><div class=row style="gap:16px;align-items:flex-end">
     <div style="flex:1"><div class=lab style="margin-bottom:6px">% OF BALANCE PER TRADE</div><input class=fld type=number min=1 max=50 data-k=pct value="${c.pct}" style="width:100%;cursor:text"></div>
     <label style="display:flex;gap:8px;align-items:center;height:35px;font-size:12px;font-weight:600;cursor:pointer"><input type=checkbox data-k=paper ${c.paper?'checked':''}> Practice mode <span class=mut style="font-weight:400">(no real money)</span></label></div>
    <div id=bsecret style="margin-top:14px;display:${c.paper?'none':'block'}"><div class=lab style="margin-bottom:6px">BOT SECRET (your BOT_SECRET setting on the server)</div><input class=fld type=password data-k=secret style="width:100%;cursor:text">
      <label class=mut style="display:flex;gap:7px;margin-top:10px;font-size:11px;align-items:center"><input type=checkbox data-k=ack ${c.ack?'checked':''}> I understand this uses real money</label></div>
    <div class=row style="gap:10px;margin-top:18px;align-items:center"><button class=btn id=bgo style="width:130px"></button><button class="btn u" id=bsa>Sell everything</button><button class="btn u" id=btest style="display:${c.paper?'none':'inline-flex'}">Test connection</button></div><div id=bst class=sub style="margin-top:10px"></div>
    <details style="margin-top:16px"><summary class=mut style="cursor:pointer;font-size:11px">Advanced settings</summary><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:12px">
     ${fld('minUsd','MIN TRADE TO COPY ($)','Ignore buys smaller than this')}${fld('maxPrice','MAX PRICE (¢)','Skip if Kalshi price is above this')}${fld('slip','MAX SLIPPAGE (¢)','Skip if Kalshi is this much worse than Polymarket')}${fld('maxUse','MAX % OF BALANCE IN TRADES')}${fld('thresh','MATCH STRICTNESS (%)')}${fld('pbal','PRACTICE BALANCE ($)')}</div>
     <label class=mut style="display:flex;gap:7px;margin-top:12px;font-size:11px;align-items:center"><input type=checkbox data-k=confirm ${c.confirm?'checked':''}> Ask me before each real buy</label></details><div id=bpd></div></div>
   <div class=cd style="border-radius:22px;padding:20px 22px;font-size:11px;line-height:21px"><div id=bsw style="font-size:22px;font-weight:700;letter-spacing:-.6px;line-height:28px;margin-bottom:6px"></div>
    <div class="row sb"><span class=mut>Balance</span><b id=bbal></b></div><div class="row sb"><span class=mut>In trades</span><b id=buse></b></div><div class="row sb"><span class=mut>Profit (closed)</span><b id=bpnl></b></div>
    <div id=bsv class=mut style="margin-top:8px;font-size:10px;line-height:15px"></div></div></div>
  <h2 style="margin:28px 0 12px;font-size:16px">Open positions</h2><div class=tw><table id=bpo></table></div>
  <div class="row sb ac" style="margin:28px 0 12px"><h2 style="font-size:16px">Activity</h2><a class=mut style="cursor:pointer;font-size:10px" id=bclr>Clear log</a></div><div class=tw><table id=bl></table></div>
  <div class=sub style="margin-top:14px">Not financial advice. Copying traders is not a proven edge, and a Kalshi market with similar wording can have different rules. Try practice mode first. The bot only runs while this page is open.</div>`;
  app.querySelectorAll('[data-k]').forEach(el=>{if(el.type!='checkbox'&&el.dataset.k!='paper')el.value=c[el.dataset.k]??el.value;
    el.onchange=()=>{const k=el.dataset.k,n=BCFG();n[k]=el.type=='checkbox'?el.checked:el.type=='number'?+el.value:el.value;LS.set('botcfg',n);if(k=='paper'){$('#bsecret').style.display=n.paper?'none':'block';$('#btest').style.display=n.paper?'none':'inline-flex';refreshBal(n).then(renderBot)}}});
  $('#bgo').onclick=()=>BOT.on?botStop():botStart();$('#bsa').onclick=()=>{if(confirm('Sell every open position now?'))sellAll()};
  $('#bclr').onclick=()=>{LS.set('botlog',[]);renderBot()};
  $('#btest').onclick=async()=>{const cfg=BCFG();$('#bsv').textContent='Checking…';const r=await kfetch('status',null,cfg);BOT.status=r.j;if(r.ok){const b=balOf(r.j);if(b!=null)BOT.bal=b}
    $('#bsv').innerHTML=r.ok?`Server: <b style="color:${r.j.env=='prod'?'#ff4d5e':'var(--g)'}">${r.j.env=='prod'?'REAL MONEY':'DEMO'}</b> · keys ${r.j.configured?'ok':'<b class=neg>missing</b>'} · max order $${r.j.maxOrderUsd}${r.j.disabled?' · <b class=neg>trading disabled</b>':''}`:`<span class=neg>${esc(r.j.error||'failed')}</span>`;renderBot()};
  refreshBal(c).then(renderBot);renderBot();
}
