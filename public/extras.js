// Settings extras: (1) the Claude connection (MCP) card, (2) wallpapers with plugin support.
/* ====================== Claude connection ====================== */
async function mcpMount(token) {
  const el = $('#mcpcard'); if (!el) return; let st; try { st = await mtapi('mcpinfo'); } catch (e) { el.innerHTML = `<div class="card pad"><h2>Claude connection</h2><div class=mut style="margin-top:6px">${esc(e.message)}</div></div>`; return; }
  const url = location.origin + '/mcp', T = token || '<your token>', cmd = `claude mcp add --transport http mimic ${url} --header "Authorization: Bearer ${T}"`,
    cfg = JSON.stringify({ mcpServers: { mimic: { command: 'npx', args: ['-y', 'mcp-remote', url, '--header', `Authorization:Bearer ${T}`] } } }, null, 2), link = `${url}?token=${T}`;
  const blk = (t, txt) => `<div class=mcpb><div class="row sb"><b>${t}</b><button class="btn sm" data-copy>Copy</button></div><pre>${esc(txt)}</pre></div>`;
  el.innerHTML = `<div class="card pad"><div class="row sb wrapf" style="gap:10px"><div><h2>Claude connection</h2><div class=mut style="font-size:13px;margin-top:4px;max-width:46ch">Let Claude see your Trade chart (even a picture of it), change it, read your accounts and bots, and place paper trades.</div></div>${st.has ? '<span class="pill up">On</span>' : '<span class="pill n">Off</span>'}</div>
   ${st.has ? `<div class=mut style="font-size:12.5px;margin-top:12px">${token ? 'Your token is shown once. Copy it now.' : 'Connected. ' + (st.last ? 'Last used ' + new Date(st.last).toLocaleString() + '.' : 'Not used yet.') + ' The token is hidden for safety: make a new one to see it again.'}</div>` : ''}
   ${token ? `<div style="margin-top:12px;display:grid;gap:10px">${blk('Claude Code (terminal)', cmd)}${blk('Claude Desktop (claude_desktop_config.json)', cfg)}${blk('Connector URL (apps that only take a link)', link)}</div>` : ''}
   ${st.has ? `<div class="row sb" style="margin-top:14px"><div><div style="font-weight:500">Allow Claude to trade</div><div class=mut style="font-size:12.5px">Paper money only. Off = Claude can look but not place or close orders.</div></div><button class="trsw ${st.trade ? 'on' : ''}" id=mcpTr role=switch aria-checked=${st.trade} aria-label="Allow Claude to trade"><i></i></button></div>` : ''}
   <div class=row style="gap:8px;margin-top:14px;flex-wrap:wrap"><button class="btn pri" id=mcpNew>${st.has ? 'Make a new token' : 'Create connection'}</button>${st.has ? '<button class="btn danger" id=mcpOff>Turn off</button>' : ''}</div>
   <details style="margin-top:14px"><summary class=mut style="cursor:pointer;font-size:13px">What can Claude do?</summary><div class=mut style="font-size:13px;line-height:1.6;margin-top:8px">See your chart and a snapshot of it, read any symbol's candles and 39 indicators, get a plain-English technical read, change your symbol, timeframe, style and indicators, draw lines on your chart, read your Manual and Opposite Bot accounts, place paper orders, end the trading day, and list, start, stop and backtest the strategy bots. The Trade tab must be open for it to see or change your live chart. Claude.ai's website connectors need a sign-in flow this does not have: use Claude Code or Claude Desktop, or a connector that accepts the link above.</div></details></div>`;
  el.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(b.closest('.mcpb').querySelector('pre').textContent); b.textContent = 'Copied'; setTimeout(() => b.textContent = 'Copy', 1500); } catch (e) { toast('Select and copy the text'); } });
  $('#mcpNew').onclick = async () => { if (st.has && !confirm('Make a new token? The old one stops working.')) return; try { const r = await mtapi('mcpnew', {}); mcpMount(r.token); } catch (e) { toast(esc(e.message)); } };
  if ($('#mcpOff')) $('#mcpOff').onclick = async () => { if (!confirm('Turn off the Claude connection? The token stops working.')) return; await mtapi('mcprevoke', {}); mcpMount(); };
  if ($('#mcpTr')) $('#mcpTr').onclick = async () => { await mtapi('mcptrade', { on: !st.trade }); mcpMount(token); };
}

/* ====================== Wallpapers (with plugin support) ====================== */
// A wallpaper is: nothing, a built-in animated one, an image or video (from the device or a link), or a PLUGIN: one HTML file that draws the background.
// Plugins run in a sandboxed frame (scripts only: no access to your account, storage or the page) and get theme updates by postMessage.
const WPDEF = { kind: 'none', id: '', url: '', mime: '', dim: 55, blur: 0, cards: 'frost', anim: true, col: 'auto' };
const wpGet = () => ({ ...WPDEF, ...LS.get('wp', {}) }), wpSave = o => { LS.set('wp', { ...wpGet(), ...o }); wpApply(); };
const wpPlugins = () => LS.get('wp:plugins', []);
const WPCOL = { auto: ['Auto', null], blue: ['Blue', [21, 70, 255]], violet: ['Violet', [139, 92, 246]], pink: ['Pink', [236, 72, 153]], orange: ['Orange', [245, 130, 30]], green: ['Green', [18, 161, 80]], mono: ['Grey', [160, 160, 170]] };
const WPHEAD = `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;overflow:hidden;background:transparent}canvas{position:fixed;inset:0;width:100%;height:100%}</style><canvas id=c></canvas><script>
const cv=document.getElementById('c'),g=cv.getContext('2d');let T={dark:false,accent:[21,70,255],paused:false};addEventListener('message',e=>{if(e.data&&e.data.type==='mimic:theme')T=Object.assign(T,e.data)});
const DPR=Math.min(devicePixelRatio||1,2);function fit(){cv.width=innerWidth*DPR;cv.height=innerHeight*DPR;g.setTransform(DPR,0,0,DPR,0,0)}addEventListener('resize',fit);fit();
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;let last=0,t0=0;function loop(t){requestAnimationFrame(loop);if(document.hidden||T.paused||t-last<33)return;last=t;draw((t-t0)/1000,innerWidth,innerHeight)}
`;
const WPTAIL = `\nif(reduce){setTimeout(()=>draw(5,innerWidth,innerHeight),150);addEventListener('message',()=>draw(5,innerWidth,innerHeight))}else requestAnimationFrame(loop);</script>`;
const wpDoc = js => WPHEAD + js + WPTAIL;
const WPB = [
  { id: 'aurora', name: 'Aurora', g: 'linear-gradient(135deg,#1546ff55,#8b5cf655,#12a1a055)', js: `function draw(t,w,h){g.clearRect(0,0,w,h);const A=T.accent,H=[A,[139,80,255],[0,190,170]];g.globalCompositeOperation=T.dark?'lighter':'source-over';for(let i=0;i<4;i++){const x=w*(.5+.4*Math.sin(t*.12+i*1.7)),y=h*(.45+.35*Math.cos(t*.1+i*2.3)),R=Math.max(w,h)*(.45+.1*Math.sin(t*.2+i)),c=H[i%3],gr=g.createRadialGradient(x,y,0,x,y,R);gr.addColorStop(0,'rgba('+c+','+(T.dark?.32:.42)+')');gr.addColorStop(1,'rgba('+c+',0)');g.fillStyle=gr;g.fillRect(0,0,w,h)}}` },
  { id: 'mesh', name: 'Soft mesh', g: 'linear-gradient(135deg,#eceef4,#ff78a055,#5ac8ff55)', js: `function draw(t,w,h){const A=T.accent;g.fillStyle=T.dark?'rgb(10,10,14)':'rgb(238,240,246)';g.fillRect(0,0,w,h);[[.2,.2,A],[.8,.3,[255,120,160]],[.5,.85,[90,200,255]]].forEach((p,i)=>{const x=w*(p[0]+.12*Math.sin(t*.15+i*2)),y=h*(p[1]+.12*Math.cos(t*.13+i)),R=Math.max(w,h)*.6,gr=g.createRadialGradient(x,y,0,x,y,R);gr.addColorStop(0,'rgba('+p[2]+','+(T.dark?.45:.55)+')');gr.addColorStop(1,'rgba('+p[2]+',0)');g.fillStyle=gr;g.fillRect(0,0,w,h)})}` },
  { id: 'stars', name: 'Starfield', g: 'linear-gradient(135deg,#02030a,#1b2140)', js: `const S=Array.from({length:170},()=>({x:Math.random(),y:Math.random(),z:Math.random()*.9+.1,p:Math.random()*6}));function draw(t,w,h){g.fillStyle=T.dark?'#02030a':'#e9ecf4';g.fillRect(0,0,w,h);for(const s of S){const x=((s.x+t*.004*s.z)%1)*w,y=s.y*h,a=.3+.7*Math.abs(Math.sin(t*s.z+s.p));g.fillStyle=T.dark?'rgba(255,255,255,'+a*s.z+')':'rgba('+T.accent+','+a*s.z*.8+')';g.beginPath();g.arc(x,y,.6+s.z*1.4,0,7);g.fill()}}` },
  { id: 'waves', name: 'Waves', g: 'linear-gradient(180deg,#eef0f3,#1546ff33)', js: `function draw(t,w,h){g.clearRect(0,0,w,h);for(let k=0;k<4;k++){g.beginPath();g.moveTo(0,h);for(let x=0;x<=w;x+=8){g.lineTo(x,h*(.6+.07*k)+Math.sin(x/(130+k*40)+t*(.4+k*.12))*(18+k*8))}g.lineTo(w,h);g.closePath();g.fillStyle='rgba('+T.accent+','+(T.dark?.12+.05*k:.10+.05*k)+')';g.fill()}}` },
  { id: 'dots', name: 'Glow grid', g: 'radial-gradient(circle,#1546ff66 1px,transparent 1.5px) 0 0/10px 10px,#eef0f3', js: `function draw(t,w,h){g.clearRect(0,0,w,h);const s=36;for(let y=s/2;y<h;y+=s)for(let x=s/2;x<w;x+=s){const d=Math.hypot(x-w*(.5+.4*Math.sin(t*.3)),y-h*(.5+.4*Math.cos(t*.23))),a=Math.max(0,1-d/380);g.fillStyle=T.dark?'rgba(255,255,255,'+(.06+a*.5)+')':'rgba('+T.accent+','+(.10+a*.6)+')';g.beginPath();g.arc(x,y,1.2+a*2.2,0,7);g.fill()}}` },
];
const WPTEMPLATE = `<!doctype html>
<!-- Mimic wallpaper plugin: ONE html file. It runs in a sandbox (scripts only: no access to your account or the page).
     Mimic sends {type:'mimic:theme', dark:boolean, accent:[r,g,b], paused:boolean} by postMessage whenever the theme changes. -->
<meta name=viewport content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;overflow:hidden;background:transparent}canvas{position:fixed;inset:0;width:100%;height:100%}</style>
<canvas id=c></canvas>
<script>
const cv = document.getElementById('c'), g = cv.getContext('2d'); let T = { dark: false, accent: [21, 70, 255], paused: false };
addEventListener('message', e => { if (e.data && e.data.type === 'mimic:theme') T = Object.assign(T, e.data); });
function fit() { cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; g.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); } addEventListener('resize', fit); fit();
function frame(ms) { requestAnimationFrame(frame); if (document.hidden || T.paused) return; const t = ms / 1000, w = innerWidth, h = innerHeight;
  g.clearRect(0, 0, w, h);
  // draw your wallpaper here: a soft accent-coloured circle that drifts
  const gr = g.createRadialGradient(w / 2 + Math.sin(t) * 120, h / 2, 0, w / 2, h / 2, Math.max(w, h) * .6);
  gr.addColorStop(0, 'rgba(' + T.accent + ',.45)'); gr.addColorStop(1, 'rgba(' + T.accent + ',0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
requestAnimationFrame(frame);
</script>
`;
const idb = () => new Promise((ok, no) => { const r = indexedDB.open('mimic-wall', 1); r.onupgradeneeded = () => r.result.createObjectStore('f'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
const idbPut = async (k, v) => { const d = await idb(); return new Promise((ok, no) => { const t = d.transaction('f', 'readwrite'); t.objectStore('f').put(v, k); t.oncomplete = ok; t.onerror = () => no(t.error); }); };
const idbGet = async k => { const d = await idb(); return new Promise((ok, no) => { const r = d.transaction('f').objectStore('f').get(k); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }); };
let wpURL = null;
function wpTheme() { const f = document.querySelector('#wall iframe'); if (!f || !f.contentWindow) return; const c = wpGet(), dark = document.documentElement.dataset.theme == 'dark', col = WPCOL[c.col]?.[1] || (dark ? [130, 110, 255] : [21, 70, 255]);
  try { f.contentWindow.postMessage({ type: 'mimic:theme', dark, accent: col, paused: !c.anim }, '*'); } catch (e) {} }
async function wpApply() {
  const c = wpGet(); let el = document.getElementById('wall'); const B = document.body;
  if (c.kind == 'none') { el?.remove(); B.classList.remove('hasWall', 'wallfrost'); if (wpURL) { URL.revokeObjectURL(wpURL); wpURL = null; } return; }
  if (!el) { el = document.createElement('div'); el.id = 'wall'; el.setAttribute('aria-hidden', 'true'); el.innerHTML = '<div class=wmedia></div><div class=wdim></div>'; B.prepend(el); }
  B.classList.add('hasWall'); B.classList.toggle('wallfrost', c.cards == 'frost'); el.style.setProperty('--wdim', c.dim / 100); el.querySelector('.wmedia').style.filter = c.blur ? `blur(${c.blur}px)` : ''; el.querySelector('.wmedia').style.transform = c.blur ? 'scale(1.06)' : '';
  const key = JSON.stringify([c.kind, c.id, c.url, c.mime, (wpPlugins().find(p => p.id == c.id) || {}).html?.length]); if (el.dataset.k == key) { wpTheme(); return; } el.dataset.k = key; const m = el.querySelector('.wmedia'); m.innerHTML = '';
  const frame = (o) => { const f = document.createElement('iframe'); f.setAttribute('sandbox', 'allow-scripts'); f.setAttribute('referrerpolicy', 'no-referrer'); f.setAttribute('tabindex', '-1'); f.setAttribute('title', 'wallpaper'); Object.assign(f, o); f.onload = wpTheme; m.append(f); setTimeout(wpTheme, 400); };
  if (c.kind == 'builtin') { const b = WPB.find(x => x.id == c.id) || WPB[0]; frame({ srcdoc: wpDoc(b.js) }); }
  else if (c.kind == 'plugin') { const p = wpPlugins().find(x => x.id == c.id); if (p) frame({ srcdoc: p.html }); }
  else if (c.kind == 'link') frame({ src: c.url });
  else if (c.kind == 'image' || c.kind == 'video' || c.kind == 'file') { let url = c.url, mime = c.mime || (c.kind == 'video' ? 'video/mp4' : 'image/*');
    if (c.kind == 'file') { try { const blob = await idbGet('wall'); if (!blob) return; if (wpURL) URL.revokeObjectURL(wpURL); wpURL = url = URL.createObjectURL(blob); } catch (e) { return; } }
    if (/^video/.test(mime) || c.kind == 'video') { const v = document.createElement('video'); Object.assign(v, { src: url, autoplay: true, loop: true, muted: true, playsInline: true }); v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); m.append(v); v.play().catch(() => {}); }
    else { const i = document.createElement('img'); i.alt = ''; i.src = url; m.append(i); } }
}
function wallMount() {
  const el = $('#wallcard'); if (!el) return; const c = wpGet(), pl = wpPlugins();
  const tile = (on, label, bg, attrs, x) => `<button class="wptile ${on ? 'on' : ''}" ${attrs} style="--tb:${bg}"><span class=wpth></span><span class=wpn>${esc(label)}</span>${x || ''}</button>`;
  el.innerHTML = `<div class="card pad"><div class="row sb"><div><h2>Wallpaper</h2><div class=mut style="font-size:13px;margin-top:4px">Animated wallpapers, your own picture or video, or a plugin.</div></div></div>
   <div class=wpgrid>${tile(c.kind == 'none', 'None', 'var(--tile)', 'data-k=none')}${WPB.map(b => tile(c.kind == 'builtin' && c.id == b.id, b.name, b.g, `data-k=builtin data-id=${b.id}`)).join('')}${pl.map(p => tile(c.kind == 'plugin' && c.id == p.id, p.name, 'linear-gradient(135deg,var(--tile),var(--fill2))', `data-k=plugin data-id=${p.id}`, `<i class=wpx data-del=${p.id} title="Remove plugin">×</i>`)).join('')}
     ${tile(c.kind == 'file' || c.kind == 'image' || c.kind == 'video', 'Picture / video', 'var(--tile)', 'id=wpUp')}</div>
   <input type=file id=wpFile accept="image/*,video/mp4,video/webm,video/quicktime" hidden>
   ${c.kind != 'none' ? `<div class=wpset><label><span>Dimming <b class=num id=wpdv>${c.dim}%</b></span><input type=range id=wpDim min=0 max=90 value=${c.dim}></label><label><span>Blur <b class=num id=wpbv>${c.blur}px</b></span><input type=range id=wpBlur min=0 max=24 value=${c.blur}></label></div>
     <div class=wprow><span>Cards</span><div class=seg id=wpCards>${[['frost', 'Frosted'], ['solid', 'Solid']].map(([k, l]) => `<button data-v=${k} class="${c.cards == k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
     <div class=wprow><span>Animation</span><div class=seg id=wpAnim>${[[true, 'On'], [false, 'Paused']].map(([k, l]) => `<button data-v=${k} class="${c.anim == k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
     <div class=wprow><span>Colour</span><div class="seg wpcols" id=wpCol>${Object.entries(WPCOL).map(([k, [l, rgb]]) => `<button data-v=${k} title="${l}" class="${c.col == k ? 'on' : ''}"><i style="background:${rgb ? `rgb(${rgb})` : 'conic-gradient(#1546ff,#8b5cf6,#ec4899,#1546ff)'}"></i></button>`).join('')}</div></div>` : ''}
   <div class=wpadd><div class="row" style="gap:8px;flex-wrap:wrap"><input class=inp id=wpLink placeholder="Paste a link: image, video or plugin page" style="flex:1;min-width:200px"><button class=btn id=wpLinkGo>Use link</button></div>
    <div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap"><button class=btn id=wpPlug>Add plugin file…</button><button class=btn id=wpTpl>Download plugin template</button></div><input type=file id=wpPlugFile accept=".html,.htm,.js" hidden></div>
   <details style="margin-top:12px"><summary class=mut style="cursor:pointer;font-size:13px">Make or install a wallpaper plugin</summary><div class=mut style="font-size:13px;line-height:1.6;margin-top:8px">A plugin is one HTML file (or a .js file that defines <code>draw(t, w, h)</code>) that paints the background, usually on a canvas. It runs in a sandbox: it can draw and animate, but it cannot read your account, your trades or this page. Mimic sends it <code>{type:'mimic:theme', dark, accent:[r,g,b], paused}</code> by postMessage. Only install plugins from people you trust: a plugin can use your device's power and load whatever its own code asks for. Download the template to start.</div></details></div>`;
  const dim = v => { $('#wpdv') && ($('#wpdv').textContent = v + '%'); };
  el.querySelectorAll('.wptile').forEach(b => b.onclick = e => { if (e.target.dataset.del) { LS.set('wp:plugins', wpPlugins().filter(p => p.id != e.target.dataset.del)); if (c.id == e.target.dataset.del) wpSave({ kind: 'none' }); wallMount(); e.stopPropagation(); return; } if (b.id == 'wpUp') { $('#wpFile').click(); return; } wpSave({ kind: b.dataset.k, id: b.dataset.id || '', url: '', ...(b.dataset.k == 'none' ? {} : { cards: wpGet().kind == 'none' ? 'frost' : wpGet().cards }) }); wallMount(); });
  $('#wpFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; const vid = /^video/.test(f.type); if (f.size > (vid ? 80 : 30) * 1048576) { toast(`Too big (max ${vid ? 80 : 30} MB)`); return; } try { await idbPut('wall', f); wpSave({ kind: 'file', mime: f.type, id: String(Date.now()), cards: 'frost', dim: wpGet().dim || 40 }); wallMount(); } catch (err) { toast('Could not save that file here'); } };
  $('#wpLinkGo').onclick = () => { const u = $('#wpLink').value.trim(); if (!/^https:\/\//i.test(u)) { toast('Use an https:// link'); return; } const kind = /\.(mp4|webm|mov)(\?|#|$)/i.test(u) ? 'video' : /\.(png|jpe?g|webp|gif|avif|svg)(\?|#|$)/i.test(u) ? 'image' : 'link'; if (kind == 'link' && !confirm('This link will run as a wallpaper plugin page in a sandbox. Only continue if you trust it.')) return; wpSave({ kind, url: u, id: '', mime: kind == 'video' ? 'video/mp4' : '', cards: 'frost' }); wallMount(); };
  $('#wpPlug').onclick = () => $('#wpPlugFile').click();
  $('#wpPlugFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; if (f.size > 300e3) { toast('Plugin too big (max 300 KB)'); return; } let t = await f.text(); const js = /\.js$/i.test(f.name); if (js) t = wpDoc(t); else if (!/<\w/.test(t)) { toast('That does not look like HTML'); return; }
    const p = { id: 'p' + Date.now().toString(36), name: f.name.replace(/\.(html?|js)$/i, '').slice(0, 24), html: t }; LS.set('wp:plugins', [...wpPlugins(), p]); wpSave({ kind: 'plugin', id: p.id, url: '', cards: 'frost' }); wallMount(); toast('Plugin added'); };
  $('#wpTpl').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([WPTEMPLATE], { type: 'text/html' })); a.download = 'mimic-wallpaper-plugin.html'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  const dm = $('#wpDim'); if (dm) { dm.oninput = () => { dim(dm.value); document.getElementById('wall')?.style.setProperty('--wdim', dm.value / 100); }; dm.onchange = () => wpSave({ dim: +dm.value }); const bl = $('#wpBlur'); bl.oninput = () => { $('#wpbv').textContent = bl.value + 'px'; }; bl.onchange = () => wpSave({ blur: +bl.value });
    $$('#wpCards button').forEach(b => b.onclick = () => { wpSave({ cards: b.dataset.v }); wallMount(); }); $$('#wpAnim button').forEach(b => b.onclick = () => { wpSave({ anim: b.dataset.v == 'true' }); wallMount(); }); $$('#wpCol button').forEach(b => b.onclick = () => { wpSave({ col: b.dataset.v }); wallMount(); }); }
}
function extrasMount() { mcpMount(); wallMount(); }
addEventListener('DOMContentLoaded', () => { wpApply(); }); addEventListener('themechange', wpTheme); matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => setTimeout(wpTheme, 50));
