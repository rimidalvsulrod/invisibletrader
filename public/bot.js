/* ---------- Auto Trader: Polymarket signals -> Kalshi orders ---------- */
const BCFG0={mode:'paper',source:'following',minUsd:1000,maxPrice:85,slip:3,stake:5,daily:25,thresh:75,secret:'',ack:false};
const BCFG=()=>({...BCFG0,...LS.get('botcfg',{})});
const BOT={on:false,timer:null,seen:new Set(),since:0,mk:null,mkEnv:'',mkT:0,errs:0,pend:[],sig:0,status:null};
const STOP=new Set('will the a an of in on at to be by for and or is are with from vs than this that after before win wins won'.split(' '));
const tok=s=>String(s||'').toLowerCase().replace(/[^a-z0-9.]+/g,' ').split(' ').filter(w=>w&&!STOP.has(w)&&(w.length>1||/\d/.test(w)));
const blog=()=>LS.get('botlog',[]);
function blogAdd(e){const l=blog();l.unshift({t:Date.now(),...e});LS.set('botlog',l.slice(0,300));renderBot()}
const bspend=()=>{const d=new Date().toISOString().slice(0,10),s=LS.get('botspend',{});return s.d==d?s:{d,usd:0,tk:[]}};
const bspendAdd=(usd,tk)=>{const s=bspend();s.usd+=usd;s.tk.push(tk);LS.set('botspend',s)};
const kfetch=async(op,body,cfg)=>{const r=await fetch('/api/kalshi'+(body?'':`?op=${op}`),body?{method:'POST',headers:{'content-type':'application/json','x-bot-secret':cfg.secret},body:JSON.stringify({op,...body})}:{headers:{'x-bot-secret':cfg.secret}});let j;try{j=await r.json()}catch(e){j={error:'bad response'}}return{ok:r.ok,status:r.status,j}};
async function loadKalshi(env){
  if(BOT.mk&&BOT.mkEnv==env&&Date.now()-BOT.mkT<6e5)return BOT.mk;
  let cur='',all=[];
  for(let i=0;i<6;i++){const r=await fetch(`/api/kalshi?op=markets&env=${env}${cur?'&cursor='+encodeURIComponent(cur):''}`);if(!r.ok)break;const j=await r.json();all.push(...(j.markets||[]));cur=j.cursor;if(!cur)break}
  const c=m=>{const d=parseFloat(m['yes_ask_dollars']),n=parseFloat(m['no_ask_dollars']);return[isNaN(d)?m.yes_ask:Math.round(d*100),isNaN(n)?m.no_ask:Math.round(n*100)]};
  BOT.mk=all.map(m=>{const[ya,na]=c(m);return{t:m.ticker,title:m.title,sub:m.yes_sub_title,ya,na,tk:new Set(tok(`${m.title} ${m.yes_sub_title||''}`))}}).filter(m=>m.t&&m.tk.size);BOT.mkEnv=env;BOT.mkT=Date.now();return BOT.mk;
}
function matchMarket(title,mk,th){
  const A=[...new Set(tok(title))];if(A.length<3)return null;const nums=A.filter(w=>/\d/.test(w));let best=null;
  for(const m of mk){let h=0;for(const w of A)if(m.tk.has(w))h++;const s=h/A.length;if(s<th)continue;if(!nums.every(n=>m.tk.has(n)))continue;const rv=h/m.tk.size;if(rv<.25)continue;if(!best||s>best.s||(s==best.s&&rv>best.rv))best={m,s,rv}}
  return best;
}
async function botSignal(t,cfg,mk){
  const base={trader:t.name||t.pseudonym||short(t.proxyWallet),title:t.title,outcome:t.outcome,pm:Math.round(t.price*100),usd:t.size*t.price};
  const o=String(t.outcome).toLowerCase();if(o!='yes'&&o!='no')return blogAdd({...base,st:'skip',note:'non Yes/No outcome'});
  const b=matchMarket(t.title,mk,cfg.thresh/100);if(!b)return blogAdd({...base,st:'skip',note:'no Kalshi match'});
  const ask=o=='yes'?b.m.ya:b.m.na,e={...base,tk:b.m.t,kt:b.m.title+(b.m.sub?' — '+b.m.sub:''),side:o,ask,score:Math.round(b.s*100)};
  if(!ask||ask<1||ask>99)return blogAdd({...e,st:'skip',note:'no Kalshi ask'});
  if(ask>cfg.maxPrice)return blogAdd({...e,st:'skip',note:`ask ${ask}¢ > max ${cfg.maxPrice}¢`});
  if(ask>e.pm+cfg.slip)return blogAdd({...e,st:'skip',note:`Kalshi ${ask}¢ is >${cfg.slip}¢ worse than Polymarket ${e.pm}¢`});
  e.count=Math.floor(cfg.stake*100/ask);if(e.count<1)return blogAdd({...e,st:'skip',note:'stake too small for 1 contract'});e.cost=e.count*ask/100;
  const sp=bspend();if(sp.usd+e.cost>cfg.daily)return blogAdd({...e,st:'skip',note:`daily budget $${cfg.daily} reached`});if(sp.tk.includes(e.tk))return blogAdd({...e,st:'skip',note:'already traded this market today'});
  if(cfg.mode=='paper'){bspendAdd(e.cost,e.tk);return blogAdd({...e,st:'paper',note:'simulated fill'})}
  if(cfg.mode=='confirm'){e.id=Math.random().toString(36).slice(2);BOT.pend.push(e);blogAdd({...e,st:'pending',note:'waiting for your approval'});return renderBot()}
  return botExec(e,cfg);
}
async function botExec(e,cfg){
  const r=await kfetch('order',{ticker:e.tk,side:e.side,count:e.count,price_cents:e.ask,ref:`pm-${Date.now()}-${e.tk}`.slice(0,60)},cfg);
  if(r.ok){const f=parseFloat(r.j.fill_count||0);if(f>0)bspendAdd(f*e.ask/100,e.tk);BOT.errs=0;return blogAdd({...e,st:f>0?'ordered':'unfilled',note:`${r.j._env||''} filled ${f}/${e.count}`})}
  BOT.errs++;blogAdd({...e,st:'error',note:r.j.error||JSON.stringify(r.j).slice(0,120)});if(BOT.errs>=3){botStop();blogAdd({trader:'bot',title:'Stopped after 3 consecutive order errors',st:'error',note:''})}
}
async function botTick(){
  const cfg=BCFG();if(!BOT.on)return;
  let addrs=cfg.source=='following'?Object.keys(fol):(await loadExperts()).slice(0,10).map(e=>e.proxyWallet);addrs=addrs.slice(0,15);
  if(!addrs.length){$('#bst')&&($('#bst').textContent='No traders to watch — follow some traders first (or switch source to Top 10).');return}
  let mk;try{mk=await loadKalshi(cfg.mode=='paper'?'prod':(BOT.status?.env||'demo'))}catch(e){return}
  const res=await Promise.all(addrs.map(a=>api(`trades?user=${a}&limit=15`)));
  const fresh=res.flat().filter(t=>t&&t.side=='BUY'&&t.timestamp>=BOT.since&&t.size*t.price>=cfg.minUsd&&!BOT.seen.has(t.transactionHash+t.asset+t.size)).sort((a,b)=>a.timestamp-b.timestamp);
  for(const t of fresh){BOT.seen.add(t.transactionHash+t.asset+t.size);BOT.sig++;await botSignal(t,cfg,mk);if(!BOT.on)break}
  $('#bst')&&($('#bst').textContent=`Watching ${addrs.length} trader(s) · ${mk.length.toLocaleString()} Kalshi markets · last check ${new Date().toLocaleTimeString()}`);renderBot();
}
async function botStart(){
  const cfg=BCFG();
  if(cfg.mode!='paper'){
    if(!cfg.secret){alert('Enter your bot secret first.');return}
    const r=await kfetch('status',null,cfg);BOT.status=r.j;
    if(!r.ok||!r.j.configured){alert('Server check failed: '+(r.j.error||'Kalshi keys not configured on the server'));return}
    if(r.j.disabled||!r.j.liveAllowed){alert('Server has trading disabled / live trading not allowed.');return}
    if(r.j.env=='prod'&&!cfg.ack){alert('Tick the "I understand this trades real money" box first.');return}
  }
  BOT.on=true;BOT.errs=0;BOT.since=Math.floor(Date.now()/1000)-20;BOT.seen.clear();BOT.sig=0;botTick();clearInterval(BOT.timer);BOT.timer=setInterval(botTick,20000);renderBot();
}
function botStop(){BOT.on=false;clearInterval(BOT.timer);BOT.pend=[];renderBot()}
function renderBot(){
  if(!$('#bl'))return;const cfg=BCFG(),sp=bspend(),L=blog();
  $('#bsw').textContent=BOT.on?'Running':'Stopped';$('#bsw').style.color=BOT.on?'var(--g)':'#9a9aa6';$('#bgo').textContent=BOT.on?'Stop bot':'Start bot';$('#bgo').className='btn'+(BOT.on?' u':'');
  $('#bsp').textContent=`$${sp.usd.toFixed(2)} / $${cfg.daily}`;$('#bsg').textContent=BOT.sig;$('#bor').textContent=L.filter(x=>x.st=='ordered'||x.st=='paper').length;
  $('#bpd').innerHTML=BOT.pend.length?`<div class=sub style="margin:18px 0 8px;color:#d6d6e2">Waiting for approval</div><div class=tw><table>${BOT.pend.map(e=>`<tr style="height:46px"><td>${esc(e.trader)} bought <b>${esc(e.outcome)}</b> @${e.pm}¢ — ${esc(e.title)}<div class=mut style="font-size:9px">→ Kalshi ${esc(e.tk)} (${esc(e.kt)}) · ${e.count} × ${e.ask}¢ = $${e.cost.toFixed(2)} · match ${e.score}%</div><td class=r style="width:170px"><button class="btn" data-ap="${e.id}" style="height:28px">Approve</button> <button class="btn u" data-sk="${e.id}" style="height:28px">Skip</button></tr>`).join('')}</table></div>`:'';
  $('#bpd').querySelectorAll('[data-ap]').forEach(b=>b.onclick=async()=>{const e=BOT.pend.find(x=>x.id==b.dataset.ap);BOT.pend=BOT.pend.filter(x=>x!==e);renderBot();if(e)await botExec(e,BCFG())});
  $('#bpd').querySelectorAll('[data-sk]').forEach(b=>b.onclick=()=>{BOT.pend=BOT.pend.filter(x=>x.id!=b.dataset.sk);renderBot()});
  const C={paper:'#6370ff',ordered:'var(--g)',pending:'#e8a91a',skip:'#6c6c78',error:'#ff4d5e',unfilled:'#e8a91a'};
  $('#bl').innerHTML='<tr><th>Time<th>Signal<th>Kalshi<th>Result</tr>'+(L.slice(0,80).map(e=>`<tr style="height:44px"><td class=mut style="white-space:nowrap">${new Date(e.t).toLocaleTimeString()}<td>${esc(e.trader)} ${e.outcome?`<b>${esc(e.outcome)}</b> @${e.pm}¢ · ${usd(e.usd)}`:''}<div class=mut style="font-size:9px">${esc(e.title)}</div>
    <td>${e.tk?`${esc(e.tk)} · ${e.side?.toUpperCase()} ${e.ask}¢${e.count?` × ${e.count}`:''}<div class=mut style="font-size:9px">${esc(e.kt||'')}</div>`:'<span class=mut>—</span>'}
    <td style="color:${C[e.st]||'#fff'}"><b>${e.st}</b><div class=mut style="font-size:9px">${esc(e.note||'')}</div></tr>`).join('')||'<tr style="height:44px"><td colspan=4 class=mut>No activity yet.</tr>')
}
function botPage(){
  const c=BCFG(),num=(k,l,h)=>`<div><div class=lab style="margin-bottom:6px">${l}</div><input class=fld type=number data-k=${k} value="${c[k]}" style="width:100%;cursor:text"${h?` title="${h}"`:''}></div>`;
  app.innerHTML=`<h1>Auto Trader</h1><div class=sub style="font-size:10.9px">Watches top Polymarket traders and mirrors their buys on Kalshi when a matching market exists.</div>
  <div class="cd" style="border-radius:16px;padding:14px 18px;margin-top:22px;border-color:#5a4a1a;background:#14110a;font-size:11px;line-height:17px;color:#e8d9a8"><b>Real money warning.</b> Copying a trader is not a proven edge, and matching a Polymarket question to a Kalshi market by text can be wrong (different rules or wording). Start in <b>Paper</b> mode, then use a Kalshi <b>demo</b> account, and only then consider live with small limits. The bot only runs while this page is open.</div>
  <div style="display:grid;grid-template-columns:1fr 288px;gap:20px;margin-top:20px;align-items:start">
   <div class=cd style="border-radius:22px;padding:20px 22px"><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px 16px">
    <div><div class=lab style="margin-bottom:6px">MODE</div><select class=fld data-k=mode style="width:100%"><option value=paper>Paper (simulate only)<option value=confirm>Confirm each order<option value=auto>Auto-trade</select></div>
    <div><div class=lab style="margin-bottom:6px">COPY WHO</div><select class=fld data-k=source style="width:100%"><option value=following>Traders I follow<option value=top>Top 10 by P&L</select></div>
    ${num('minUsd','MIN WHALE TRADE ($)','Ignore Polymarket buys smaller than this')}${num('stake','STAKE PER TRADE ($)')}${num('maxPrice','MAX PRICE (¢)','Skip if the Kalshi ask is above this')}${num('slip','MAX SLIPPAGE (¢)','Skip if Kalshi is this much worse than the Polymarket fill')}${num('daily','DAILY BUDGET ($)')}${num('thresh','MATCH STRICTNESS (%)','Share of the Polymarket title words that must appear in the Kalshi market')}
    <div style="grid-column:span 2"><div class=lab style="margin-bottom:6px">BOT SECRET (the BOT_SECRET env var on your server)</div><input class=fld type=password data-k=secret value="${esc(c.secret)}" style="width:100%;cursor:text" placeholder="only needed for Confirm / Auto"></div></div>
    <label class=mut style="display:flex;gap:7px;margin-top:16px;font-size:11px;align-items:center"><input type=checkbox data-k=ack ${c.ack?'checked':''}> I understand live mode trades real money</label>
    <div class=row style="gap:10px;margin-top:16px"><button class=btn id=bgo style="width:130px"></button><button class="btn u" id=btest>Test connection</button><span id=bst class=sub style="align-self:center;margin:0"></span></div><div id=bpd></div></div>
   <div class=cd style="border-radius:22px;padding:20px 22px;font-size:11px;line-height:20px"><div class=lab>STATUS</div><div id=bsw style="font-size:22px;font-weight:700;letter-spacing:-.6px;line-height:28px"></div>
    <div class="row sb" style="margin-top:10px"><span class=mut>Spent today</span><b id=bsp></b></div><div class="row sb"><span class=mut>Signals seen</span><b id=bsg></b></div><div class="row sb"><span class=mut>Orders / paper fills</span><b id=bor></b></div>
    <div id=bsv class=mut style="margin-top:10px;font-size:10px;line-height:15px;border-top:1px solid var(--line);padding-top:10px">Server: not checked</div><a class="mut" style="cursor:pointer;font-size:10px" id=bclr>Clear log</a></div></div>
  <h2 style="margin:30px 0 14px;font-size:16px">Activity</h2><div class=tw><table id=bl></table></div>`;
  app.querySelectorAll('[data-k]').forEach(el=>el.value!==undefined&&(el.type=='checkbox'?0:el.value=c[el.dataset.k]??el.value),0);
  app.querySelectorAll('select[data-k]').forEach(el=>el.value=c[el.dataset.k]);
  app.querySelectorAll('[data-k]').forEach(el=>el.onchange=()=>{const k=el.dataset.k,n=BCFG();n[k]=el.type=='checkbox'?el.checked:el.type=='number'?+el.value:el.value;LS.set('botcfg',n)});
  $('#bgo').onclick=()=>BOT.on?botStop():botStart();
  $('#bclr').onclick=()=>{LS.set('botlog',[]);renderBot()};
  $('#btest').onclick=async()=>{const cfg=BCFG();$('#bsv').textContent='Checking…';const r=await kfetch('status',null,cfg);BOT.status=r.j;
    $('#bsv').innerHTML=r.ok?`Server: <b style="color:${r.j.env=='prod'?'#ff4d5e':'var(--g)'}">${r.j.env=='prod'?'LIVE':'DEMO'}</b> · keys ${r.j.configured?'set':'<b class=neg>missing</b>'} · max order $${r.j.maxOrderUsd}${r.j.disabled?' · <b class=neg>trading disabled</b>':''}<br>Balance: ${esc(JSON.stringify(r.j.balance||'n/a')).slice(0,120)}`:`<span class=neg>${esc(r.j.error||'failed')}</span>`};
  renderBot();
}
