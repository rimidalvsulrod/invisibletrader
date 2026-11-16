// No accounts: everyone is the built-in owner. These helpers remain so the pages that call them keep working.
async function signedIn(user) {
  OWNER = true; USER = user || USER; NOTES = null; await loadFollows(); renderSide(); setTimeout(() => typeof obCheck == 'function' && obCheck(), 700);
  fetch('/api/bot?op=state').then(r => r.ok ? r.json() : null).then(s => { if (s) { BOTON = s.enabled; TOPBAL = s.account?.total ?? s.account?.cash ?? null; renderSide(); } }).catch(() => {});
}
async function signOut() {}
function forget() {}
// shown only when the server has no database (the only reason `me` returns no user)
function authView(mode, email, then) {
  app.innerHTML = `<div class="card pad fade" style="max-width:420px;margin:7vh auto 0"><h2>Database not connected</h2><p class=mut style="margin-top:8px;font-size:14px">Set <code>DATABASE_URL</code> and reload. There are no logins.</p></div>`;
}
const accountPage = () => { location.hash = '#/'; };
