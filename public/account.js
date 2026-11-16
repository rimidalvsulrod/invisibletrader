// Log in with the owner email only (no password). Everything else in the app needs that session.
async function signedIn(user) {
  OWNER = true; USER = user || USER; NOTES = null; await loadFollows(); renderSide(); setTimeout(() => typeof obCheck == 'function' && obCheck(), 700);
  fetch('/api/bot?op=state').then(r => r.ok ? r.json() : null).then(s => { if (s) { BOTON = s.enabled; TOPBAL = s.account?.total ?? s.account?.cash ?? null; renderSide(); } }).catch(() => {});
}
function forget() { OWNER = false; USER = null; TOPBAL = null; BOTON = false; NOTES = null; setFol([]); renderSide(); }
async function signOut() { await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'logout' }) }).catch(() => {}); forget(); }
function authView(mode, email, then = route) {
  app.innerHTML = `<div class="card pad fade" style="max-width:420px;margin:7vh auto 0"><h2>Access code</h2><p class=mut style="margin:6px 0 10px;font-size:14px">Enter the owner email to continue.</p>
    <form id=af><input class=inp id=aem type=email placeholder="Email" autocomplete=username required><button class="btn pri" style="width:100%;margin-top:14px;height:46px">Enter</button><div id=aerr class=down style="font-size:13px;margin-top:10px"></div></form></div>`;
  $('#af').onsubmit = async e => { e.preventDefault(); $('#aerr').textContent = '';
    try {
      const r = await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'login', email: $('#aem').value }) }), j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Failed');
      const me = await fetch('/api/auth?op=me').then(x => x.json()); SETUP = me.setup || SETUP; await signedIn(me.user); then();
    } catch (x) { $('#aerr').textContent = x.message; } };
}
const accountPage = () => OWNER ? (location.hash = '#/') : authView('login', '', () => { location.hash = '#/'; route(); });
