// ═══════════════════════════════════════════════════════════════════════════
// Login, troca de senha e área Admin (Firebase Authentication)
//
// • Usuários entram com "usuário + senha". Por baixo, cada usuário é uma conta
//   e-mail/senha do Firebase com e-mail interno  <usuario>@xcmg-apoio.app
// • usernames/{usuario} → { uid, email }  (consulta pública para o login)
// • users/{uid}         → { username, name, role, active, mustChangePassword }
// • Primeiro acesso do admin: usuário "admin" + senha inicial. A conta é criada
//   na hora e a troca de senha é obrigatória.
// ═══════════════════════════════════════════════════════════════════════════

const AUTH_EMAIL_DOMAIN = 'xcmg-apoio.app';
const ADMIN_USERNAME = 'admin';
const ADMIN_EMAIL = `${ADMIN_USERNAME}@${AUTH_EMAIL_DOMAIN}`;
// SHA-256 da senha inicial do admin (só vale enquanto a conta admin não existe)
const DEFAULT_ADMIN_HASH = 'ce9b8106404041be58bb91ef03a2338cbea52ac316f3ea3dd80c6e76ed8d1072';
const SESSION_KEY = 'xcmgSession';
const MIN_PASSWORD = 6;
const SECONDARY_APP = 'xcmg-admin-create';

let fb = null;              // { app, auth, db }
let _authStarted = false;
let _loginPassword = '';    // guardada só até a troca obrigatória do 1º acesso
let _forcedPwd = false;
let _unsubscribeUsers = null;
let USERS = [];

window.CURRENT_USER = null;

// ── Utilidades ──────────────────────────────────────────────────────────────
function normalizeUsername(v) { return String(v || '').trim().toLowerCase(); }
function isValidUsername(u) { return /^[a-z0-9._-]{3,30}$/.test(u); }
function emailFor(username, suffix = '') { return `${username}${suffix}@${AUTH_EMAIL_DOMAIN}`; }
function serverTs() { return window.firebase.firestore.FieldValue.serverTimestamp(); }
function isAdminUser() { return window.CURRENT_USER?.role === 'admin'; }

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function generatePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const arr = crypto.getRandomValues(new Uint32Array(8));
  return [...arr].map(n => chars[n % chars.length]).join('');
}

function authErrorMessage(err) {
  const code = err?.code || '';
  if (['auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-login-credentials', 'auth/user-not-found'].includes(code)) return 'Usuário ou senha incorretos.';
  if (code === 'auth/too-many-requests') return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  if (code === 'auth/network-request-failed' || code === 'unavailable') return 'Sem conexão com a internet.';
  if (code === 'auth/weak-password') return `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`;
  if (code === 'auth/operation-not-allowed') return 'O login por senha não está ativado no Firebase (Authentication → Método de login → E-mail/senha).';
  if (code === 'auth/requires-recent-login') return 'Por segurança, saia e entre de novo antes de trocar a senha.';
  if (code === 'permission-denied') return 'Sem permissão. As regras do Firestore precisam ser publicadas.';
  return err?.message || 'Erro inesperado.';
}

// ── Tela de login ───────────────────────────────────────────────────────────
function setLocked(locked) {
  document.body.classList.toggle('locked', locked);
  $('loginScreen').classList.toggle('hidden', !locked);
  if (locked) setTimeout(() => $('loginUser')?.focus(), 50);
}
function loginMessage(text, kind = 'error') {
  const box = $('loginError');
  box.textContent = text || '';
  box.className = `login-msg ${kind}${text ? '' : ' hidden'}`;
}
function setLoginBusy(busy, label) {
  $('loginBtn').disabled = busy;
  $('loginBtn').textContent = busy ? (label || 'Entrando…') : 'Entrar';
}

async function initAuth() {
  if (_authStarted) return;
  _authStarted = true;
  setupAuthUI();

  const config = window.FIREBASE_CONFIG || window.firebaseConfig;
  if (!window.firebase || !hasFirebaseConfig(config)) {
    // Sem Firebase (ex.: sem internet no carregamento): só entra quem já tinha sessão aqui
    const cached = readJSON(SESSION_KEY, null);
    if (cached) { applySession(cached); setLocked(false); setSyncStatus('offline'); }
    else { setLocked(true); loginMessage('Sem conexão. Conecte-se à internet para entrar.'); }
    return;
  }

  const app = window.firebase.apps.find(a => a.name === '[DEFAULT]') || window.firebase.initializeApp(config);
  fb = { app, auth: app.auth(), db: app.firestore() };
  setLocked(true);
  setLoginBusy(true, 'Verificando…');
  fb.auth.onAuthStateChanged(user => { handleAuthState(user).catch(err => console.error('Auth:', err)); });
}

async function handleAuthState(user) {
  setLoginBusy(false);
  if (!user) { endSession(); return; }
  if (user.isAnonymous) { await fb.auth.signOut(); return; } // sessões antigas (antes do login)

  let profile = null;
  try {
    const snap = await fb.db.collection('users').doc(user.uid).get();
    if (snap.exists) profile = snap.data();
    else if (user.email === ADMIN_EMAIL) profile = await createAdminProfile(user);
  } catch (err) {
    const cached = readJSON(SESSION_KEY, null);
    if (cached && cached.uid === user.uid) profile = cached; // sem internet: usa a sessão salva
    else {
      console.error('Perfil:', err);
      await fb.auth.signOut();
      loginMessage(authErrorMessage(err));
      return;
    }
  }

  if (!profile || profile.active === false) {
    await fb.auth.signOut();
    loginMessage(profile ? 'Usuário desativado. Fale com o administrador.' : 'Usuário sem cadastro no app. Fale com o administrador.');
    return;
  }

  const session = {
    uid: user.uid, username: profile.username, name: profile.name || profile.username,
    role: profile.role === 'admin' ? 'admin' : 'user', mustChangePassword: !!profile.mustChangePassword, active: true,
  };
  writeJSON(SESSION_KEY, session);
  applySession(session);
  loginMessage('');
  setLocked(false);
  startDataSync(fb.db);
  fb.db.collection('users').doc(user.uid).update({ lastLoginAt: serverTs() }).catch(() => {});

  if (session.mustChangePassword) openPasswordDialog(true);
  else _loginPassword = '';
}

// Primeiro acesso do admin: cria o perfil (as regras só permitem isso para o e-mail do admin)
async function createAdminProfile(user) {
  const profile = {
    username: ADMIN_USERNAME, name: 'Administrador', role: 'admin', active: true,
    mustChangePassword: true, createdAt: serverTs(),
  };
  const batch = fb.db.batch();
  batch.set(fb.db.collection('users').doc(user.uid), profile);
  batch.set(fb.db.collection('usernames').doc(ADMIN_USERNAME), { uid: user.uid, email: user.email });
  await batch.commit();
  return profile;
}

function applySession(s) {
  window.CURRENT_USER = s;
  $('userMenuName').textContent = s.name;
  $('userMenuRole').textContent = s.role === 'admin' ? 'Administrador' : `@${s.username}`;
  document.body.classList.toggle('is-admin', s.role === 'admin');
  document.querySelector('.tab[data-view="admin"]').classList.toggle('hidden', s.role !== 'admin');
  if (s.role !== 'admin' && !$('view-admin').classList.contains('hidden')) showView('report');
}

function endSession() {
  stopDataSync();
  if (_unsubscribeUsers) { _unsubscribeUsers(); _unsubscribeUsers = null; }
  USERS = [];
  window.CURRENT_USER = null;
  // Não deixa dados de acesso (senha provisória) visíveis para o próximo a entrar
  $('newUserForm').reset();
  $('newUserPass').value = generatePassword();
  $('newUserMsg').textContent = '';
  $('newUserResult').innerHTML = '';
  $('newUserResult').classList.add('hidden');
  $('usersList').innerHTML = '<p class="empty">Carregando…</p>';
  $('loginPass').value = '';
  try { localStorage.removeItem(SESSION_KEY); } catch {}
  document.body.classList.remove('is-admin');
  document.querySelector('.tab[data-view="admin"]').classList.add('hidden');
  if (!$('view-admin').classList.contains('hidden')) showView('report');
  if ($('pwdDialog').open) $('pwdDialog').close();
  setLocked(true);
}

async function doLogin(ev) {
  ev.preventDefault();
  const username = normalizeUsername($('loginUser').value);
  const password = $('loginPass').value;
  if (!username || !password) { loginMessage('Informe usuário e senha.'); return; }
  if (!fb) { loginMessage('Sem conexão. Conecte-se à internet para entrar.'); return; }

  loginMessage('');
  setLoginBusy(true);
  try {
    let email = null, registered = false;
    const snap = await fb.db.collection('usernames').doc(username).get();
    if (snap.exists) { email = snap.data().email; registered = true; }
    else if (username === ADMIN_USERNAME) email = ADMIN_EMAIL;
    if (!email) throw { code: 'auth/user-not-found' };

    _loginPassword = password;
    try {
      await fb.auth.signInWithEmailAndPassword(email, password);
    } catch (err) {
      const notFound = ['auth/user-not-found', 'auth/invalid-credential', 'auth/invalid-login-credentials'].includes(err.code);
      // Primeiríssimo acesso: a conta admin ainda não existe e a senha é a inicial
      if (username === ADMIN_USERNAME && !registered && notFound && await sha256(password) === DEFAULT_ADMIN_HASH) {
        try { await fb.auth.createUserWithEmailAndPassword(ADMIN_EMAIL, password); }
        catch (e2) { throw e2.code === 'auth/email-already-in-use' ? { code: 'auth/wrong-password' } : e2; }
      } else throw err;
    }
    $('loginPass').value = '';
  } catch (err) {
    _loginPassword = '';
    loginMessage(authErrorMessage(err));
    setLoginBusy(false);
  }
}

async function doLogout() {
  if (!window.confirm('Sair do app?')) return;
  $('userMenu').open = false;
  if (fb) await fb.auth.signOut(); else endSession();
}

// ── Troca de senha ──────────────────────────────────────────────────────────
function openPasswordDialog(forced = false) {
  _forcedPwd = forced;
  const dlg = $('pwdDialog');
  $('pwdForm').reset();
  $('pwdMsg').textContent = '';
  $('pwdTitle').textContent = forced ? '🔐 Primeiro acesso: crie sua senha' : '🔐 Alterar senha';
  $('pwdIntro').textContent = forced
    ? 'Por segurança, troque a senha provisória por uma senha só sua antes de continuar.'
    : 'Informe a senha atual e a nova senha.';
  const needCurrent = !(forced && _loginPassword);
  $('pwdCurrentField').classList.toggle('hidden', !needCurrent);
  $('pwdCurrent').required = needCurrent;
  $('pwdCancel').classList.toggle('hidden', forced);
  $('userMenu').open = false;
  if (!dlg.open) dlg.showModal();
  setTimeout(() => (needCurrent ? $('pwdCurrent') : $('pwdNew')).focus(), 50);
}

async function savePassword(ev) {
  ev.preventDefault();
  const msg = $('pwdMsg');
  const current = _forcedPwd && _loginPassword ? _loginPassword : $('pwdCurrent').value;
  const next = $('pwdNew').value;
  const confirmNext = $('pwdConfirm').value;
  msg.textContent = '';
  if (next.length < MIN_PASSWORD) { msg.textContent = `A nova senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`; return; }
  if (next !== confirmNext) { msg.textContent = 'A confirmação não confere com a nova senha.'; return; }
  if (next === current) { msg.textContent = 'A nova senha precisa ser diferente da atual.'; return; }
  if (await sha256(next) === DEFAULT_ADMIN_HASH) { msg.textContent = 'Escolha uma senha diferente da senha inicial.'; return; }

  const btn = $('pwdSave');
  btn.disabled = true;
  try {
    const user = fb.auth.currentUser;
    const cred = window.firebase.auth.EmailAuthProvider.credential(user.email, current);
    await user.reauthenticateWithCredential(cred);
    await user.updatePassword(next);
    await fb.db.collection('users').doc(user.uid).update({ mustChangePassword: false, passwordChangedAt: serverTs() });
    _loginPassword = '';
    window.CURRENT_USER.mustChangePassword = false;
    writeJSON(SESSION_KEY, window.CURRENT_USER);
    $('pwdDialog').close();
    toast('Senha alterada com sucesso.', 'success');
  } catch (err) {
    msg.textContent = err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential'
      ? 'Senha atual incorreta.' : authErrorMessage(err);
    if (_forcedPwd) { _loginPassword = ''; $('pwdCurrentField').classList.remove('hidden'); $('pwdCurrent').required = true; }
  } finally {
    btn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ÁREA ADMIN
// ═══════════════════════════════════════════════════════════════════════════
function renderAdmin() {
  if (!isAdminUser() || !fb) return;
  if (!_unsubscribeUsers) {
    _unsubscribeUsers = fb.db.collection('users').onSnapshot(snap => {
      USERS = [];
      snap.forEach(doc => USERS.push({ uid: doc.id, ...doc.data() }));
      drawUsers();
    }, err => {
      console.error('Usuários:', err);
      $('usersList').innerHTML = `<p class="empty">${escapeHtml(authErrorMessage(err))}</p>`;
    });
  }
  drawUsers();
}

function tsToText(ts) {
  const d = ts && typeof ts.toDate === 'function' ? ts.toDate() : null;
  return d ? formatDateTime(d.toISOString()) : '';
}

function drawUsers() {
  const box = $('usersList');
  if (!box) return;
  const me = window.CURRENT_USER?.uid;
  const list = [...USERS].sort((a, b) =>
    (a.role === 'admin' ? 0 : 1) - (b.role === 'admin' ? 0 : 1) || String(a.name).localeCompare(String(b.name), 'pt-BR'));
  $('usersCount').textContent = list.length;
  if (!list.length) { box.innerHTML = '<p class="empty">Nenhum usuário cadastrado.</p>'; return; }
  box.innerHTML = '';
  list.forEach(u => {
    const isMe = u.uid === me;
    const isMainAdmin = u.username === ADMIN_USERNAME;
    const last = tsToText(u.lastLoginAt);
    const row = el('div', { class: `user-row${u.active === false ? ' off' : ''}` });
    row.innerHTML = `
      <div class="user-avatar">${escapeHtml((u.name || u.username || '?').trim().charAt(0).toUpperCase())}</div>
      <div class="user-info">
        <b>${escapeHtml(u.name || u.username)}${isMe ? ' <span class="muted small">(você)</span>' : ''}</b>
        <span class="muted small">@${escapeHtml(u.username)}${last ? ` · último acesso ${escapeHtml(last)}` : ' · nunca acessou'}</span>
        <div class="user-badges">
          <span class="pill ${u.role === 'admin' ? 'blue' : ''}">${u.role === 'admin' ? 'Administrador' : 'Usuário'}</span>
          <span class="pill ${u.active === false ? 'red' : 'green'}">${u.active === false ? 'Desativado' : 'Ativo'}</span>
          ${u.mustChangePassword ? '<span class="pill yellow">Aguardando 1º acesso</span>' : ''}
        </div>
      </div>`;
    const actions = el('div', { class: 'user-actions' });
    if (!isMe) {
      actions.appendChild(el('button', {
        class: 'btn btn-ghost btn-sm', text: '🔑 Nova senha', title: 'Definir uma nova senha provisória',
        onclick: () => resetUserPassword(u),
      }));
      if (!isMainAdmin) {
        actions.appendChild(el('button', {
          class: 'btn btn-ghost btn-sm', text: u.active === false ? '✅ Ativar' : '⛔ Desativar',
          onclick: () => updateUser(u, { active: u.active === false }, u.active === false ? 'ativado' : 'desativado'),
        }));
        actions.appendChild(el('button', {
          class: 'btn btn-ghost btn-sm', text: u.role === 'admin' ? '👤 Tornar usuário' : '⭐ Tornar admin',
          onclick: () => {
            const toAdmin = u.role !== 'admin';
            if (toAdmin && !window.confirm(`${u.name} poderá criar e gerenciar usuários. Confirmar?`)) return;
            updateUser(u, { role: toAdmin ? 'admin' : 'user' }, toAdmin ? 'agora é administrador' : 'agora é usuário');
          },
        }));
        actions.appendChild(el('button', {
          class: 'icon-btn sm danger', text: '🗑', title: 'Excluir usuário',
          onclick: () => deleteUser(u),
        }));
      }
    }
    row.appendChild(actions);
    box.appendChild(row);
  });
}

// Cria a conta no Firebase Auth usando uma 2ª instância, para o admin não ser deslogado
async function createAuthAccount(username, password) {
  const config = window.FIREBASE_CONFIG || window.firebaseConfig;
  const app2 = window.firebase.apps.find(a => a.name === SECONDARY_APP) || window.firebase.initializeApp(config, SECONDARY_APP);
  const auth2 = app2.auth();
  await auth2.setPersistence(window.firebase.auth.Auth.Persistence.NONE);
  let cred;
  try {
    cred = await auth2.createUserWithEmailAndPassword(emailFor(username), password);
  } catch (err) {
    if (err.code !== 'auth/email-already-in-use') throw err;
    // E-mail já usado (usuário excluído antes ou senha redefinida): cria com sufixo único
    cred = await auth2.createUserWithEmailAndPassword(emailFor(username, `.${Date.now().toString(36)}`), password);
  }
  const result = { uid: cred.user.uid, email: cred.user.email };
  await auth2.signOut();
  return result;
}

async function createUser(ev) {
  ev.preventDefault();
  const msg = $('newUserMsg');
  const name = $('newUserName').value.trim();
  const username = normalizeUsername($('newUserLogin').value);
  const password = $('newUserPass').value;
  const role = $('newUserRole').value === 'admin' ? 'admin' : 'user';
  msg.textContent = '';
  if (!name) { msg.textContent = 'Informe o nome.'; return; }
  if (!isValidUsername(username)) { msg.textContent = 'Usuário: 3 a 30 caracteres, só letras minúsculas, números, ponto, hífen ou _ (sem espaços).'; return; }
  if (password.length < MIN_PASSWORD) { msg.textContent = `Senha provisória: mínimo de ${MIN_PASSWORD} caracteres.`; return; }

  const btn = $('newUserBtn');
  btn.disabled = true;
  btn.textContent = 'Criando…';
  try {
    if ((await fb.db.collection('usernames').doc(username).get()).exists) {
      msg.textContent = `O usuário "${username}" já existe.`;
      return;
    }
    const { uid, email } = await createAuthAccount(username, password);
    const batch = fb.db.batch();
    batch.set(fb.db.collection('users').doc(uid), {
      username, name, role, active: true, mustChangePassword: true,
      createdAt: serverTs(), createdBy: window.CURRENT_USER.username,
    });
    batch.set(fb.db.collection('usernames').doc(username), { uid, email });
    await batch.commit();
    $('newUserForm').reset();
    $('newUserPass').value = generatePassword();
    showCredentials(name, username, password);
  } catch (err) {
    msg.textContent = authErrorMessage(err);
  } finally {
    btn.disabled = false;
    btn.textContent = '+ Criar usuário';
  }
}

// Mostra os dados de acesso para o admin repassar (com botão de copiar)
function showCredentials(name, username, password) {
  const text = `Acesso ao app Status XCMG\nEndereço: ${location.origin}${location.pathname}\nUsuário: ${username}\nSenha provisória: ${password}\n(No primeiro acesso o app pede para criar uma nova senha.)`;
  const box = $('newUserResult');
  box.innerHTML = '';
  box.appendChild(el('div', { class: 'cred-card' }, [
    el('b', { text: `✅ ${name} pode acessar o app:` }),
    el('pre', { text }),
    el('button', { class: 'btn btn-secondary btn-sm', text: '📄 Copiar dados de acesso', onclick: () => copyText(text) }),
  ]));
  box.classList.remove('hidden');
}

async function updateUser(u, changes, label) {
  try {
    await fb.db.collection('users').doc(u.uid).update(changes);
    toast(`${u.name || u.username} ${label}.`, 'success');
  } catch (err) { toast(authErrorMessage(err), 'error'); }
}

async function resetUserPassword(u) {
  const suggestion = generatePassword();
  const password = window.prompt(`Nova senha provisória para ${u.name} (@${u.username}).\nNo próximo acesso ele terá que trocá-la.`, suggestion);
  if (password === null) return;
  if (password.length < MIN_PASSWORD) { toast(`A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`, 'error'); return; }
  try {
    // O Firebase não deixa trocar a senha de outra pessoa pelo navegador:
    // cria uma nova conta para o mesmo usuário e desliga a antiga.
    const { uid, email } = await createAuthAccount(u.username, password);
    const { uid: oldUid, ...data } = u;
    const batch = fb.db.batch();
    batch.set(fb.db.collection('users').doc(uid), {
      ...data, active: true, mustChangePassword: true, resetAt: serverTs(), resetBy: window.CURRENT_USER.username,
    });
    batch.delete(fb.db.collection('users').doc(oldUid));
    batch.set(fb.db.collection('usernames').doc(u.username), { uid, email });
    await batch.commit();
    showCredentials(u.name, u.username, password);
    $('newUserResult').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (err) { toast(authErrorMessage(err), 'error'); }
}

async function deleteUser(u) {
  if (!window.confirm(`Excluir ${u.name} (@${u.username})?\n\nEle perde o acesso ao app imediatamente.`)) return;
  try {
    const batch = fb.db.batch();
    batch.delete(fb.db.collection('users').doc(u.uid));
    batch.delete(fb.db.collection('usernames').doc(u.username));
    await batch.commit();
    toast(`${u.name} excluído.`, 'success');
  } catch (err) { toast(authErrorMessage(err), 'error'); }
}

// ── Eventos ─────────────────────────────────────────────────────────────────
function setupAuthUI() {
  $('loginForm').addEventListener('submit', doLogin);
  $('loginShowPass').addEventListener('change', ev => { $('loginPass').type = ev.target.checked ? 'text' : 'password'; });
  $('logoutBtn').addEventListener('click', doLogout);
  $('changePwdBtn').addEventListener('click', () => openPasswordDialog(false));
  $('pwdForm').addEventListener('submit', savePassword);
  $('pwdCancel').addEventListener('click', () => $('pwdDialog').close());
  // Troca obrigatória: não deixa fechar com Esc
  $('pwdDialog').addEventListener('cancel', ev => { if (_forcedPwd) ev.preventDefault(); });
  $('newUserForm').addEventListener('submit', createUser);
  $('newUserGen').addEventListener('click', () => { $('newUserPass').value = generatePassword(); });
  $('newUserPass').value = generatePassword();
  $('newUserLogin').addEventListener('input', ev => {
    const clean = ev.target.value.toLowerCase().replace(/\s+/g, '.').normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (clean !== ev.target.value) ev.target.value = clean;
  });
  document.addEventListener('click', ev => {
    const menu = $('userMenu');
    if (menu.open && !menu.contains(ev.target)) menu.open = false;
  });
}
