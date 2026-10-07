// International Polymarket wallet signals -> Polymarket US IOC orders.
const crypto=require('crypto'),db=require('./db'),P=require('./polymarket-us'),S=require('./settings'),M=require('./match-us');
const DEF={pct:5,minUsd:1000,maxPrice:85,slip:3,maxUse:100,thresh:78},DAY=864e5;
const J=(s,d)=>{try{return s?JSON.parse(s):d}catch(_){return d}},num=(x,d=0)=>Number.isFinite(Number(x))?Number(x):d;
const tkey=t=>crypto.createHash('sha1').update(`${t.transactionHash}|${t.asset}|${t.size}|${t.side}`).digest('base64').slice(0,14);
const orderCap=()=>Number(process.env.MAX_ORDER_USD)||Infinity,log=(s,e)=>s.logs.push({t:Date.now(),...e});
const getJSON=u=>fetch(u).then(r=>r.ok?r.json():Promise.reject(new Error(`${r.status} ${u.split('?')[0]}`)));
const runCtx=()=>{const T=new Map();let top;return{trades:a=>T.get(a)??T.set(a,getJSON(`https://data-api.polymarket.com/trades?user=${a}&limit=25&_=${Date.now()}`).catch(()=>[])).get(a),top:()=>top??=getJSON('https://data-api.polymarket.com/v1/leaderboard?timePeriod=ALL&orderBy=PNL&limit=10').then(r=>r.map(x=>x.proxyWallet)).catch(()=>[])}};
// The US API documents buyingPower/currentBalance as numbers, whereas a few
// early responses used money objects.  Support both without turning a valid
// scalar balance into $0.
function cash(j){const a=j?.balances||j?.accounts||j?.data||j,list=Array.isArray(a)?a:[a],r=list.find(x=>/USD|USDC/i.test(String(x?.currency||'')))||list[0]||{},v=r.buyingPower??r.buying_power??r.availableCash??r.currentBalance??r.balance??r.cash;return num(v?.value,v)}
function pos(x){const tk=x.marketSlug||x.market_slug||x.marketMetadata?.slug||x.market?.slug,n=num(x.netPositionDecimal,num(x.netPosition,num(x.quantity,x.position))),cost=num(x.cost?.value,num(x.costBasis?.value,num(x.marketExposure?.value)));return tk&&n?{tk,side:n<0?'no':'yes',count:Math.abs(n),cost:Math.abs(cost),raw:x}:null}
// The retail API has returned both arrays and keyed objects for paginated
// portfolio data. Normalize before iterating so credential verification never
// fails merely because an account has an empty/object-shaped position list.
const rows=x=>Array.isArray(x)?x:(x&&typeof x==='object'?Object.values(x):[]);
async function account(c){const[b,p]=await Promise.all([P.balance(c),P.positions(c)]);if(!b.ok)throw new Error(`Polymarket US balance: ${b.json?.error?.message||b.json?.message||b.status}`);if(!p.ok)throw new Error(`Polymarket US positions: ${p.json?.error?.message||p.json?.message||p.status}`);const all=new Map();for(const x of rows(p.json.positions||p.json.data||p.json)){const v=pos(x);if(v)all.set(v.tk,v)}return{cash:cash(b.json),pos:all}}
async function open(){const row=await db.one("SELECT * FROM bot WHERE id='me'"),cfg={...DEF,...J(row.cfg,{})};return{row,cfg,creds:await S.getCreds().catch(()=>null),st:J(row.state,{}),copies:J(row.positions,[]),logs:[],orders:0,disable:false}}
function bad(s,e,r){s.st.errs=(s.st.errs||0)+1;log(s,{...e,st:'error',note:r.json?.error?.message||r.json?.message||r.json?.raw||`Polymarket US error ${r.status}`});if(s.st.errs>=3){s.disable=true;log(s,{trader:'bot',title:'Bot paused after 3 Polymarket US errors',st:'error'})}}
function reconcile(s,a){for(const cp of[...s.copies]){const p=a.pos.get(cp.tk);if(!p||p.count<=0){s.copies=s.copies.filter(x=>x.id!==cp.id);log(s,{trader:cp.trader,title:cp.title,tk:cp.tk,act:'sell',st:'closed',note:'position is no longer open on Polymarket US'})}else cp.count=Math.min(cp.count,p.count)}}
// Taker fee (Polymarket US fee schedule): 0.0695 x contracts x p x (1-p)
const fee=(n,p)=>0.0695*n*p*(1-p);
// Count only real fills. NEW/CANCELED/EXPIRED events carry no new shares (an IOC's cancel event repeats cumQuantity).
function fills(r,side,p){let n=0,cost=0;for(const x of r.json?.executions||[]){if(!/PARTIAL_FILL|EXECUTION_TYPE_FILL$/.test(String(x.type)))continue;const q=num(x.lastShares);if(q<=0)continue;let px=num(x.lastPx?.value,NaN);
  // lastPx may be quoted as the YES price; convert to what this side paid, sanity-checked against the quote we traded at
  if(Number.isFinite(px)&&side==='no'&&Math.abs((1-px)-p)<Math.abs(px-p))px=1-px;n+=q;cost+=q*(Number.isFinite(px)&&Math.abs(px-p)<=.15?px:p)}return{n,cost}}
// live price to BUY this side right now (Polymarket US prices are YES prices: NO costs 1 - best YES bid)
const sidePrice=(q,side)=>side==='yes'?q.ask:1-q.bid;
async function buy(s,t,a,usd){const c=s.cfg,pm=Math.round(num(t.price)*100),base={trader:t.name||t.pseudonym||String(t.proxyWallet).slice(0,8),title:t.title,outcome:t.outcome,pm,usd,act:'buy'};
  const b=await M.resolve(t,c.thresh/100).catch(e=>({reason:`couldn't search Polymarket US (${String(e.message||e).slice(0,90)})`}));if(!b.m)return log(s,{...base,st:'skip',note:b.reason});
  const e={...base,tk:b.m.slug,kt:b.m.question||b.m.slug,side:b.side,asset:t.asset,how:b.how};
  const q=await P.bbo(b.m.slug).catch(()=>null);if(!q||!q.open)return log(s,{...e,st:'skip',note:`US market isn't open for trading${q?.state?` (${q.state.replace('MARKET_STATE_','').toLowerCase()})`:''}`});
  const p=sidePrice(q,b.side),ask=Math.round(p*100);e.ask=ask;
  if(!(p>0&&p<1))return log(s,{...e,st:'skip',note:'no sellers on Polymarket US right now'});
  if(ask>c.maxPrice)return log(s,{...e,st:'skip',note:`US price ${ask}¢ is above your ${c.maxPrice}¢ max`});
  if(ask>pm+c.slip)return log(s,{...e,st:'skip',note:`US price ${ask}¢ is more than ${c.slip}¢ above the trader's ${pm}¢`});
  if(ask<pm-20)return log(s,{...e,st:'skip',note:`US price ${ask}¢ is too far below the trader's ${pm}¢ to trust the match`});
  if(s.copies.some(x=>x.tk===e.tk)||a.pos.has(e.tk))return log(s,{...e,st:'skip',note:'you already hold this US market'});
  // size: % of buying power, taker fee included, never more than you have
  const budget=Math.min(a.cash*c.pct/100,orderCap(),Math.max(0,a.cash-.01));let n=Math.floor(budget/p);while(n>0&&n*p+fee(n,p)+.01>budget)n--;
  if(n<1)return log(s,{...e,st:'skip',note:`${c.pct}% of $${a.cash.toFixed(2)} can't buy one contract at ${ask}¢`});
  const exposure=s.copies.reduce((x,y)=>x+y.cost,0);if(exposure+n*p>(a.cash+exposure)*c.maxUse/100)return log(s,{...e,st:'skip',note:`would put more than ${c.maxUse}% of your money in copies`});
  if(s.orders++>=5)return log(s,{...e,st:'skip',note:'max 5 orders per check'});
  // immediate-or-cancel, may fill up to your limit (trader's price + your slippage, capped at your max price)
  const limit=Math.min(pm+c.slip,c.maxPrice)/100,bips=Math.max(0,Math.floor((limit-p)/p*1e4));
  const r=await P.order(s.creds,{slug:e.tk,side:e.side,quantity:n,slippageBips:bips});if(!r.ok)return bad(s,e,r);s.st.errs=0;
  const f=fills(r,e.side,p);if(f.n<=0)return log(s,{...e,count:n,st:'skip',note:`order for ${n} at ~${ask}¢ didn't fill — price moved`});
  a.cash-=f.cost+fee(f.n,f.cost/f.n);s.copies.push({id:crypto.randomBytes(6).toString('hex'),tk:e.tk,side:e.side,count:f.n,cost:f.cost,ask,asset:t.asset,trader:e.trader,title:t.title,kt:e.kt,t:Date.now()});
  log(s,{...e,count:f.n,st:'bought',note:`${f.n} at ~${Math.round(f.cost/f.n*100)}¢ (≈$${(f.cost+fee(f.n,f.cost/f.n)).toFixed(2)} incl. fee)${f.n<n?` · ${n-f.n} didn't fill`:''} · ${b.how}`})}
// close a copied position; only forget it once the exchange reports a fill, otherwise retry on the next check
async function sell(s,cp,why){const e={trader:cp.trader,title:cp.title,tk:cp.tk,side:cp.side,count:cp.count,act:'sell'};
  const q=await P.bbo(cp.tk).catch(()=>null);if(q&&!q.open){log(s,{...e,st:'skip',note:`${why}: market is ${String(q.state||'').replace('MARKET_STATE_','').toLowerCase()} — it settles automatically`});s.copies=s.copies.filter(x=>x.id!==cp.id);return}
  const p=q?(cp.side==='yes'?q.bid:1-q.ask):NaN,bips=Number.isFinite(p)&&p>0?Math.max(100,Math.floor(s.cfg.slip/100/p*1e4)):500;
  const r=await P.closePosition(s.creds,cp.tk,bips);if(!r.ok)return bad(s,e,r);
  const f=fills(r,cp.side,Number.isFinite(p)?p:.5);if(f.n<=0){s.st.retry=[...new Set([...(s.st.retry||[]),cp.id])];return log(s,{...e,st:'skip',note:`${why}: sell didn't fill — will retry`})}
  s.st.retry=(s.st.retry||[]).filter(x=>x!==cp.id);if(f.n>=cp.count-1e-9)s.copies=s.copies.filter(x=>x.id!==cp.id);else{cp.cost*=1-f.n/cp.count;cp.count-=f.n}
  log(s,{...e,count:f.n,st:'sold',note:`${why} · ${f.n} at ~${Math.round(f.cost/f.n*100)}¢`})}
async function save(s,en){await db.q("UPDATE bot SET enabled=$1, state=$2, positions=$3, lock_until=NULL, updated=$4 WHERE id='me'",[en??(s.row.enabled&&!s.disable),JSON.stringify(s.st),JSON.stringify(s.copies),Date.now()]);for(const l of s.logs)await db.q('INSERT INTO botlog (id, ts, entry) VALUES ($1,$2,$3)',[crypto.randomBytes(8).toString('hex'),l.t,JSON.stringify(l)]);if(s.logs.length)await db.q('DELETE FROM botlog WHERE ts<$1',[Date.now()-14*DAY])}
async function run(ctx=runCtx(),gap=0){if(gap){const r=await db.one("SELECT state FROM bot WHERE id='me'");if(Date.now()-(J(r?.state,{}).last||0)<gap)return{ran:false,why:'ran recently'}}const got=await db.one("UPDATE bot SET lock_until=$1 WHERE id='me' AND enabled=true AND (lock_until IS NULL OR lock_until<$2) RETURNING id",[Date.now()+55e3,Date.now()]);if(!got)return{ran:false};const s=await open();try{if(!s.creds){s.disable=true;log(s,{trader:'bot',title:'Bot paused — connect Polymarket US first',st:'error'});await save(s);return{ran:true,error:'no key'}}if(process.env.TRADING_DISABLED){s.disable=true;log(s,{trader:'bot',title:'Bot paused — TRADING_DISABLED is set',st:'error'});await save(s);return{ran:true}}let addrs=(await db.q('SELECT wallet FROM follows')).map(x=>x.wallet);if(!addrs.length)addrs=await ctx.top();addrs=addrs.slice(0,15);const now=Math.floor(Date.now()/1000);if(!s.st.seen2){s.st.since=now-60;s.st.seen2=[]}s.st.since=Math.max(s.st.since||now-60,now-600);const seen=new Map(s.st.seen2),acc=s.st.acc||{},trades=(await Promise.all(addrs.map(a=>ctx.trades(a)))).flat().filter(t=>t&&t.timestamp>=s.st.since&&!seen.has(tkey(t))).sort((a,b)=>a.timestamp-b.timestamp);if(!trades.length&&!(s.st.retry||[]).length&&Date.now()-(s.st.synced||0)<60e3){s.st.last=Date.now();s.st.watching=addrs.length;await save(s);return{ran:true,trades:0}}const a=await account(s.creds);reconcile(s,a);s.st.synced=Date.now();for(const id of[...(s.st.retry||[])]){const cp=s.copies.find(x=>x.id===id);if(cp)await sell(s,cp,'retrying sell');else s.st.retry=s.st.retry.filter(x=>x!==id)}for(const t of trades){if(s.disable)break;seen.set(tkey(t),t.timestamp);if(t.side==='SELL'){for(const cp of s.copies.filter(p=>p.asset===t.asset))await sell(s,cp,`${cp.trader} sold the source market`)}else if(t.side==='BUY'){const v=acc[`${t.proxyWallet}|${t.asset}`.toLowerCase()]||={usd:0};acc[`${t.proxyWallet}|${t.asset}`.toLowerCase()]=v;v.usd+=num(t.size)*num(t.price);v.t=t.timestamp;if(!v.fired&&v.usd>=s.cfg.minUsd){v.fired=1;await buy(s,t,a,v.usd)}}}s.st.seen2=[...seen].filter(x=>x[1]>=s.st.since);s.st.acc=Object.fromEntries(Object.entries(acc).filter(([,x])=>x.t>=now-600));s.st.last=Date.now();s.st.watching=addrs.length;await save(s);return{ran:true,trades:trades.length,logs:s.logs.length}}catch(e){s.st.last=Date.now();log(s,{trader:'bot',title:'Check failed: '+String(e.message||e).slice(0,140),st:'error'});await save(s).catch(()=>{});return{ran:true,error:String(e.message||e)}}}
async function manualSell(target){const s=await open();if(!s.creds)throw new Error('Connect Polymarket US first');for(const cp of target==='all'?[...s.copies]:s.copies.filter(x=>x.tk===String(target)))await sell(s,cp,'sold by you');await save(s,s.row.enabled&&!s.disable)}
module.exports={DEF,run,manualSell,open,account,J,orderCap,fills,fee};
