// Accounts: log in / sign up / verify email / forgot password, and the Account page.
const authApi = async (op, data) => {
  const r = await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op, ...data }) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || 'Something went wrong'), { status: r.status }); return j;
};
// signed in: refresh everything that belongs to the account
async function signedIn(user) {
  OWNER = true; USER = user; NOTES = null; await loadFollows(); renderSide();
  fetch('/api/bot?op=state').then(r => r.ok ? r.json() : null).then(s => { if (s) { BOTON = s.enabled; TOPBAL = s.account?.total ?? s.account?.cash ?? null; renderSide(); } }).catch(() => {});
}
function forget() { OWNER = false; USER = null; TOPBAL = null; BOTON = false; NOTES = null; setFol([]); renderSide(); } // nothing of the last account stays on screen
async function signOut() { await authApi('logout').catch(() => {}); forget(); }

// mode: login | signup | verify | forgot | reset ; then: what to show once signed in
function authView(mode = 'login', email = '', then = route) {
  const T = { login: ['Log in', 'Your tracked traders, bot and Polymarket US connection are saved to your account.'], signup: ['Create your account', 'Free. We email you a code to confirm it is you.'],
    verify: ['Check your email', `We sent a 6-digit code to <b>${esc(email)}</b>. It expires in 15 minutes.`], forgot: ['Reset your password', "Enter your email and we'll send you a code."],
    reset: ['Choose a new password', `Enter the code we emailed to <b>${esc(email)}</b> and a new password.`] }[mode];
  const f = (id, type, ph, ac, extra = '') => `<input class=inp id=${id} type=${type} placeholder="${ph}" autocomplete=${ac} required style="margin-top:8px" ${extra}>`;
  app.innerHTML = `<div style="max-width:420px;margin:7vh auto 0" class="card pad fade"><div style="width:46px;height:46px;border-radius:13px;display:grid;place-items:center;background:var(--acbg);color:var(--ac)">${ic(mode == 'verify' || mode == 'reset' ? 'help' : 'lock', 22)}</div>
    <h2 style="margin-top:16px;font-size:22px">${T[0]}</h2><p class=mut style="margin:6px 0 10px;font-size:14px;line-height:1.5">${T[1]}</p>
    <form id=af>
      ${['login', 'signup', 'forgot'].includes(mode) ? f('aem', 'email', 'Email', 'username', `value="${esc(email)}"`) : ''}
      ${mode == 'login' ? f('apw', 'password', 'Password', 'current-password') : ''}
      ${mode == 'signup' ? f('apw', 'password', 'Password (8+ characters)', 'new-password', 'minlength=8') + f('apw2', 'password', 'Repeat password', 'new-password') : ''}
      ${mode == 'verify' || mode == 'reset' ? f('acode', 'text', '6-digit code', 'one-time-code', 'inputmode=numeric maxlength=6 pattern="[0-9]{6}"') : ''}
      ${mode == 'reset' ? f('apw', 'password', 'New password (8+ characters)', 'new-password', 'minlength=8') : ''}
      <button class="btn pri" style="width:100%;margin-top:14px;height:46px">${{ login: 'Log in', signup: 'Create account', verify: 'Confirm email', forgot: 'Send code', reset: 'Save new password' }[mode]}</button>
      <div id=aerr class=down style="font-size:13px;margin-top:10px"></div></form>
    <div class=mut style="font-size:13.5px;margin-top:14px;display:flex;flex-wrap:wrap;gap:6px 16px">
      ${mode == 'login' ? `<a href="#" data-m=signup style="color:var(--lnk)">Create an account</a><a href="#" data-m=forgot style="color:var(--lnk)">Forgot password?</a>` : ''}
      ${mode == 'signup' || mode == 'forgot' ? `<a href="#" data-m=login style="color:var(--lnk)">I have an account</a>` : ''}
      ${mode == 'verify' || mode == 'reset' ? `<a href="#" id=aresend style="color:var(--lnk)">Send a new code</a><a href="#" data-m=login style="color:var(--lnk)">Back to log in</a>` : ''}</div></div>`;
  $$('[data-m]').forEach(a => a.onclick = e => { e.preventDefault(); authView(a.dataset.m, $('#aem')?.value || email, then); });
  $('#aresend') && ($('#aresend').onclick = async e => { e.preventDefault(); try { await authApi('resend', { email, purpose: mode == 'reset' ? 'reset' : 'verify' }); toast('New code sent'); } catch (x) { $('#aerr').textContent = x.message; } });
  $('#acode')?.focus();
  $('#af').onsubmit = async e => {
    e.preventDefault(); const b = $('#af button'); b.disabled = true; $('#aerr').textContent = '';
    try {
      const em = $('#aem')?.value.trim() || email; let r;
      if (mode == 'signup' && $('#apw').value !== $('#apw2').value) throw new Error("Passwords don't match");
      if (mode == 'login') r = await authApi('login', { email: em, password: $('#apw').value });
      if (mode == 'signup') r = await authApi('signup', { email: em, password: $('#apw').value });
      if (mode == 'verify') r = await authApi('verify', { email, code: $('#acode').value.trim() });
      if (mode == 'forgot') { await authApi('forgot', { email: em }); return authView('reset', em, then); }
      if (mode == 'reset') r = await authApi('reset', { email, code: $('#acode').value.trim(), password: $('#apw').value });
      if (r.next == 'verify') return authView('verify', r.email || em, then);
      const me = await fetch('/api/auth?op=me').then(x => x.json()); SETUP = me.setup || SETUP; await signedIn(me.user);
      toast(mode == 'verify' ? 'Email confirmed. Welcome to Mimic' : mode == 'reset' ? 'Password changed' : 'Logged in'); then();
    } catch (x) { $('#aerr').textContent = x.message; b.disabled = false; }
  };
}

// Account page: email, password, sessions, delete; admin: email sending
async function accountPage() {
  if (!OWNER) return authView('login', '', () => { location.hash = '#/account'; accountPage(); });
  const u = USER, card = (h, body) => `<div class="card pad"><h2>${h}</h2>${body}</div>`, err = id => `<div id=${id} class=down style="font-size:13px;margin-top:8px"></div>`;
  app.innerHTML = `<div class="ph fade"><div><h1>Account</h1><p class=lead>Signed in as <b>${esc(u.email)}</b>. Your tracked traders, notes, bot and Polymarket US connection belong to this account only.</p></div><button class=btn id=xout>Log out</button></div>
    <div class=split><div class=grid>
      ${card('Password', `<form id=xpw><input class=inp id=xcur type=password placeholder="Current password" autocomplete=current-password required style="margin-top:10px"><input class=inp id=xnew type=password minlength=8 placeholder="New password (8+ characters)" autocomplete=new-password required style="margin-top:8px"><button class="btn pri" style="margin-top:10px">Change password</button>${err('xpwe')}</form><p class=mut style="font-size:12.5px;margin:10px 0 0">Changing it logs out your other devices.</p>`)}
      ${card('Email', `<form id=xem><input class=inp id=xnewem type=email placeholder="New email" required style="margin-top:10px"><input class=inp id=xempw type=password placeholder="Your password" autocomplete=current-password required style="margin-top:8px"><button class="btn pri" style="margin-top:10px">Send code to new email</button>${err('xeme')}</form>
        <form id=xemc hidden><input class=inp id=xemcode inputmode=numeric autocomplete=one-time-code placeholder="6-digit code" style="margin-top:10px"><button class="btn pri" style="margin-top:10px">Confirm new email</button>${err('xemce')}</form>`)}
    </div><div class=grid>
      ${card('Devices', `<p class=mut style="font-size:13px;margin:6px 0 12px">Lost a phone or logged in somewhere public? This logs out every device, including this one.</p><button class=btn id=xall>Log out everywhere</button>`)}
      ${u.admin ? card('Email sending (admin)', `<p class=mut style="font-size:13px;line-height:1.55;margin:6px 0 10px">Verification codes are sent from a Gmail account. Turn on 2-Step Verification for it, create an <b>App password</b> at myaccount.google.com/apppasswords, and paste it here.</p><div id=xmst class=mut style="font-size:13px">Checking…</div>
        <form id=xmail><input class=inp id=xmu type=email placeholder="Gmail address" style="margin-top:10px" required><input class=inp id=xmp type=password placeholder="16-letter app password" style="margin-top:8px" required><button class="btn pri" style="margin-top:10px">Save & send test email</button>${err('xmaile')}</form>`) : ''}
      ${card('Delete account', `<p class=mut style="font-size:13px;margin:6px 0 12px">Permanently removes your account, tracked traders, notes, bot history and the stored Polymarket US key. Your money on Polymarket US is not affected.</p><button class="btn danger" id=xdel>Delete my account</button>`)}
    </div></div>`;
  const busy = (f, fn) => async e => { e.preventDefault(); const b = f.querySelector('button'); b.disabled = true; try { await fn(); } catch (x) { (f.querySelector('.down') || {}).textContent = x.message; } b.disabled = false; };
  $('#xout').onclick = async () => { await signOut(); toast('Logged out'); location.hash = '#/'; };
  $('#xpw').onsubmit = busy($('#xpw'), async () => { await authApi('password', { current: $('#xcur').value, password: $('#xnew').value }); $('#xpw').reset(); toast('Password changed. Other devices were logged out'); });
  let newEm = '';
  $('#xem').onsubmit = busy($('#xem'), async () => { newEm = $('#xnewem').value.trim(); await authApi('emailstart', { email: newEm, password: $('#xempw').value }); $('#xem').hidden = true; $('#xemc').hidden = false; $('#xemcode').focus(); toast(`Code sent to ${esc(newEm)}`); });
  $('#xemc').onsubmit = busy($('#xemc'), async () => { const r = await authApi('emailconfirm', { email: newEm, code: $('#xemcode').value.trim() }); USER = r.user; toast('Email changed'); accountPage(); });
  $('#xall').onclick = async () => { if (!confirm('Log out of every device, including this one?')) return; await authApi('logoutall').catch(() => {}); forget(); toast('Logged out everywhere'); location.hash = '#/account'; route(); };
  $('#xdel').onclick = async () => {
    if (!confirm('Delete your Mimic account for good? This cannot be undone.')) return;
    try { if (SETUP.email) await authApi('code', { purpose: 'delete' }); } catch (x) { return toast(`<span class=down>${esc(x.message)}</span>`); }
    const v = prompt(SETUP.email ? `Enter the 6-digit code we emailed to ${u.email}` : 'Enter your password to confirm'); if (!v) return;
    try { await authApi('delete', SETUP.email ? { code: v.trim() } : { password: v }); forget(); toast('Account deleted'); location.hash = '#/'; }
    catch (x) { toast(`<span class=down>${esc(x.message)}</span>`); }
  };
  if (u.admin) {
    const st = s => { $('#xmst').innerHTML = s.set ? `Sending from <b>${esc(s.from)}</b>${s.source == 'env' ? ' (set in Vercel)' : ''}` : s.dev ? 'Not set up (local development prints codes to the console)' : '<span class=down>Not set up: new people cannot sign up until this is done</span>'; };
    authApi('mailstatus').then(st).catch(() => { $('#xmst').textContent = ''; });
    $('#xmail').onsubmit = busy($('#xmail'), async () => { st(await authApi('mail', { user: $('#xmu').value, pass: $('#xmp').value })); SETUP.email = true; $('#xmail').reset(); toast(`Test email sent to ${esc(u.email)}`); });
  }
}
