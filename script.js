// ═══════════════════════════════════════════════════════════════════════════
// Status XCMG – Relatório diário de equipamentos de apoio
// ═══════════════════════════════════════════════════════════════════════════

// ── Constantes ──────────────────────────────────────────────────────────────
const E_GREEN  = String.fromCodePoint(0x1F7E2); // 🟢
const E_YELLOW = String.fromCodePoint(0x1F7E1); // 🟡
const E_RED    = String.fromCodePoint(0x1F534); // 🔴

// Ordem usada na tela, no relatório e no resumo operacional
const TYPES = ['caminhoes', 'guindastes', 'empilhadeiras', 'carretas', 'guindauto'];

// Situação do equipamento ('' = operando)
const MAINT = { NONE: '', PREV: 'PREVENTIVA', CORR: 'CORRETIVA' };
const OP_WITH  = 'COM OPERADOR';
const OP_NONE  = 'SEM OPERADOR';
const OP_VALE  = 'OPERAÇÃO VALE';
const OP_VALUES = [OP_WITH, OP_NONE, OP_VALE];
const SIG_WITH = 'COM SINALEIRO';
const SIG_NONE = 'SEM SINALEIRO';

const ADM_TAGS = ['1JA405 - ADM', '1JA406 - ADM'];
// Únicas empilhadeiras de Operação Vale
const VALE_TAGS = ['1JA371', '1JA375'];

const DEDICATED_SUPPORT_TEAMS = {
  '1JA343': 'GPA/TRUCKLESS PREVENTIVA',
  '1JA347': 'ESCAVAÇÃO',
  '1JA377': 'VULCANIZAÇÃO',
  '1JA537': 'SOTREQ',
  '1JA360': 'ELETRICA',
  '1JA410': 'PERFURAÇÃO',
  '1JA405 - ADM': 'TRACKSHIFT',
  '1JA406 - ADM': 'MATERIAIS PREVENTIVA',
};

const TYPE_INFO = {
  guindastes:    { title: 'Status dos Guindastes',            one: 'guindaste',    many: 'guindastes',    opOne: 'guindaste operacional',    opMany: 'guindastes operacionais' },
  carretas:      { title: 'Status das Carretas – Mina',       one: 'carreta',      many: 'carretas',      opOne: 'carreta operacional',      opMany: 'carretas operacionais' },
  caminhoes:     { title: 'Status dos Caminhões – Mina / Turno', one: 'caminhão',  many: 'caminhões',     opOne: 'caminhão operacional',     opMany: 'caminhões operacionais' },
  guindauto:     { title: 'Guindauto Sky Munck',              one: 'Sky Munck',    many: 'Sky Munck',     opOne: 'Sky Munck operacional',    opMany: 'Sky Munck operacionais' },
  empilhadeiras: { title: 'Status das Empilhadeiras',         one: 'empilhadeira', many: 'empilhadeiras', opOne: 'empilhadeira operacional', opMany: 'empilhadeiras operacionais' },
};

const WEEKDAYS = ['DOMINGO', 'SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA', 'SEXTA-FEIRA', 'SÁBADO'];

const DATA_STORAGE_KEY    = 'xcmgEquipmentData';
const HISTORY_STORAGE_KEY = 'xcmgHistoryV2';
const LEGACY_HISTORY_KEY  = 'relatorioHistory';
const PENDING_EVENTS_KEY  = 'pendingEquipmentEvents';
const PENDING_HISTORY_KEY = 'pendingHistoryV2';
const THEME_KEY           = 'xcmg-theme';
const HISTORY_COLLECTION  = 'relatorio_history';
const SHARED_DOC          = 'current_state/live';
const HISTORY_LIMIT       = 500;

const CLIENT_ID = (() => {
  try {
    let id = sessionStorage.getItem('xcmgClientId');
    if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('xcmgClientId', id); }
    return id;
  } catch { return Math.random().toString(36).slice(2); }
})();

// ── Utilidades ──────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (v === undefined || v === null || v === false) return;
    if (k === 'class') node.className = v;
    else if (k === 'value') node.value = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k in node && typeof v !== 'string') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  });
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null || c === false) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

function readJSON(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.warn('localStorage cheio:', e); }
}

function normalizeTag(tag) {
  return String(tag || '').trim().replace(/\s+/g, ' ').toUpperCase();
}
// TAG "base" para comparações no histórico (remove capacidade e asterisco)
function baseTag(tag) {
  const m = normalizeTag(tag).match(/1JA\d+/);
  return m ? m[0] : normalizeTag(tag).replace(/[*\s]+$/, '');
}

function pad(n) { return String(n).padStart(2, '0'); }
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function isoToBR(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '--/--/----';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function weekdayOf(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
}
function daysBetween(isoA, isoB) {
  const a = new Date(isoA + 'T00:00:00'), b = new Date(isoB + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}
function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

let _toastTimer;
function toast(msg, kind = 'info') {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { t.className = 'toast'; }, 3200);
}

function normalizeObservationText(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const inner = raw.replace(/^\(+|\)+$/g, '').trim().replace(/^OBS\s*:\s*/i, '').trim();
  return inner ? `(OBS: ${inner.toUpperCase()})` : '';
}

// ── Modelo do equipamento ───────────────────────────────────────────────────
// { tag, maintenance: ''|'PREVENTIVA'|'CORRETIVA', operator: OP_*|'' (''= não informado),
//   operatorName, signaler (só guindastes), sub, supportTeam, observations, manualFor? (ADM incluído manualmente: "data_turno") }

function isCrane(type) { return type === 'guindastes'; }

function normalizeEquip(raw, type) {
  const e = { ...raw };
  // Migração do formato antigo (operator guardava a manutenção)
  if (e.maintenance === undefined) {
    if (e.operator === 'MANUTENÇÃO PREVENTIVA') { e.maintenance = MAINT.PREV; e.operator = ''; }
    else if (e.operator === 'MANUTENÇÃO CORRETIVA') { e.maintenance = MAINT.CORR; e.operator = ''; }
    else e.maintenance = MAINT.NONE;
  }
  if (![MAINT.NONE, MAINT.PREV, MAINT.CORR].includes(e.maintenance)) e.maintenance = MAINT.NONE;
  if (!OP_VALUES.includes(e.operator)) e.operator = e.maintenance ? '' : OP_WITH;
  // "Operação Vale" é exclusiva das empilhadeiras 1JA371 e 1JA375
  if (e.operator === OP_VALE && !isValeEquip(e, type)) e.operator = '';
  if (isCrane(type)) {
    if (![SIG_WITH, SIG_NONE].includes(e.signaler)) e.signaler = SIG_WITH;
  } else {
    delete e.signaler;
  }
  ['tag', 'operatorName', 'sub', 'supportTeam', 'observations'].forEach(k => { e[k] = typeof e[k] === 'string' ? e[k] : ''; });
  delete e.onlyShifts; // regra antiga dos ADM (substituída por isActiveInShift)
  if (typeof e.manualFor !== 'string') delete e.manualFor;
  delete e.operatorStatus; delete e.signalerStatus;
  e.status = statusOf(e, type);
  return e;
}

function statusOf(e, type) {
  if (e.maintenance) return E_RED;
  if (e.operator !== OP_WITH && e.operator !== OP_VALE) return E_YELLOW;
  if (isCrane(type) && e.signaler === SIG_NONE) return E_YELLOW;
  return E_GREEN;
}
function operatorEmoji(e) {
  if (!e.operator) return E_YELLOW;
  return e.operator === OP_NONE ? E_YELLOW : E_GREEN;
}
function hasOperatorInfo(e) { return OP_VALUES.includes(e.operator); }

function isValeEquip(e, type) {
  return type === 'empilhadeiras' && VALE_TAGS.includes(baseTag(e.tag));
}
// Empilhadeiras que não são Operação Vale precisam do nome do operador
function needsOperatorName(e, type) {
  return type === 'empilhadeiras' && e.operator === OP_WITH && !String(e.operatorName || '').trim();
}
// Pendência que impede gerar o relatório ('' = ok)
function issueOf(e, type) {
  if (!hasOperatorInfo(e)) return 'informe se há operador';
  if (needsOperatorName(e, type)) return 'informe o nome do operador';
  return '';
}
function allIssues() {
  return TYPES.flatMap(t => activeItems(t).map(e => ({ e, type: t, msg: issueOf(e, t) }))).filter(x => x.msg);
}

// Estado resumido para histórico/métricas
function stateOf(e) {
  if (e.maintenance === MAINT.PREV) return 'preventiva';
  if (e.maintenance === MAINT.CORR) return 'corretiva';
  if (e.operator === OP_NONE) return 'semOperador';
  return 'operando';
}
const STATE_LABEL = { operando: 'Operando', semOperador: 'Sem operador', preventiva: 'Preventiva', corretiva: 'Corretiva', ausente: 'Fora do relatório' };
const STATE_CLASS = { operando: 'green', semOperador: 'yellow', preventiva: 'orange', corretiva: 'red', ausente: 'muted' };

function getDedicatedTeam(e) {
  return DEDICATED_SUPPORT_TEAMS[(e.tag || '').trim()] || DEDICATED_SUPPORT_TEAMS[(e.sub || '').trim()] || '';
}

function currentShift() { return $('shiftSelect')?.value || ''; }
function isAdmEquip(e) { return ADM_TAGS.includes(normalizeTag(e.tag)); }
function isWeekend() { return ['SÁBADO', 'DOMINGO'].includes($('weekdaySelect')?.value); }
// Regra ADM: segunda a sexta aparecem em todos os turnos;
// sábado e domingo nos turnos da noite (B e D) ficam ocultos, salvo inclusão manual.
function isAdmHiddenNow(shift = currentShift()) { return isWeekend() && (shift === 'B' || shift === 'D'); }
function admManualKey(shift = currentShift()) { return `${$('reportDate')?.value || ''}_${shift}`; }
function isActiveInShift(e, shift = currentShift()) {
  if (!isAdmEquip(e) || !isAdmHiddenNow(shift)) return true;
  return e.manualFor === admManualKey(shift); // incluído manualmente neste dia/turno
}
function activeItems(type, shift = currentShift()) {
  return DATA[type].filter(e => isActiveInShift(e, shift));
}

// ── Dados padrão ─────────────────────────────────────────────────────────────
const DEFAULT_DATA = {
  guindastes: [
    { tag: '1JA230 (70t)*' }, { tag: '1JA226 (110t)*' }, { tag: '1JA218 (250t)' },
    { tag: '1JA241 (250t)*' }, { tag: '1JA221 (110t)*' },
  ],
  carretas: [{ tag: '1JA268' }, { tag: '1JA273' }],
  caminhoes: [
    { tag: '1JA340', sub: '1JA343', supportTeam: 'ESTERIL' },
    { tag: '1JA366', sub: '1JA347', supportTeam: 'ESCAVAÇÃO' },
    { tag: '1JA406 - ADM', sub: '1JA537', supportTeam: 'SOTREQ' },
    { tag: '1JA377', maintenance: MAINT.CORR, operator: '', supportTeam: 'VULCANIZAÇÃO' },
    { tag: '1JA410', supportTeam: 'PERFURAÇÃO' },
    { tag: '1JA360', supportTeam: 'GPA/TRUCKLESS PREVENTIVA' },
    { tag: '1JA378', maintenance: MAINT.PREV, operator: '' },
    { tag: '1JA342', supportTeam: 'GPA/TRUCKLESS PREVENTIVA' },
    { tag: '1JA405 - ADM', sub: '1JA348', supportTeam: 'MATERIAIS' },
    { tag: '1JA536', supportTeam: 'TRAKSHIFT' },
    { tag: '1JA339', maintenance: MAINT.CORR, operator: '' },
  ],
  guindauto: [{ tag: '1JA416', maintenance: MAINT.CORR, operator: '' }],
  empilhadeiras: [
    { tag: '1JA369 (16t)' }, { tag: '1JA373 (16t)' }, { tag: '1JA371 (16t)', operator: OP_VALE },
    { tag: '1JA374 (7t)' }, { tag: '1JA375 (10t)', maintenance: MAINT.CORR, operator: OP_VALE }, { tag: '1JA376 (10t)' },
  ],
};

function normalizeData(src) {
  const out = {};
  TYPES.forEach(t => {
    const list = Array.isArray(src?.[t]) ? src[t] : [];
    out[t] = list.filter(x => x && typeof x === 'object').map(x => normalizeEquip(x, t));
  });
  return out;
}

let DATA = normalizeData(DEFAULT_DATA);

function loadSavedData() {
  const saved = readJSON(DATA_STORAGE_KEY, null);
  if (saved && typeof saved === 'object' && TYPES.some(t => Array.isArray(saved[t]))) {
    const norm = normalizeData(saved);
    TYPES.forEach(t => { if (Array.isArray(saved[t])) DATA[t] = norm[t]; });
  }
}
// Remove campos internos de interface (_editing, _open) antes de salvar/sincronizar
function cleanList(list) {
  return list.map(e => {
    const out = {};
    Object.keys(e).forEach(k => { if (!k.startsWith('_') && e[k] !== undefined) out[k] = e[k]; });
    return out;
  });
}
function cleanData() { return Object.fromEntries(TYPES.map(t => [t, cleanList(DATA[t])])); }
function saveDataLocal() { writeJSON(DATA_STORAGE_KEY, cleanData()); }

// ── Firebase ─────────────────────────────────────────────────────────────────
let firebaseDb = null;
let _syncTimer = null;
let _localDirty = false;
let _pendingRemoteState = null;
let _unsubscribeShared = null;
let _unsubscribeHistory = null;

function setSyncStatus(state) {
  const pill = $('syncPill'), label = $('syncLabel');
  if (!pill || !label) return;
  const map = {
    connecting: 'Conectando…', synced: 'Sincronizado', syncing: 'Salvando…', offline: 'Offline', error: 'Erro de sync',
  };
  pill.dataset.state = state;
  label.textContent = map[state] || map.connecting;
}

function hasFirebaseConfig(c) {
  return !!c && ['apiKey', 'authDomain', 'projectId', 'appId'].every(k => typeof c[k] === 'string' && c[k].trim());
}

// Inicia a sincronização dos dados — chamado por auth.js depois do login
async function startDataSync(db) {
  firebaseDb = db;
  try {
    await initSharedSync();
    subscribeHistory();
    flushPendingEvents();
    flushPendingHistory();
  } catch (err) {
    console.error('Falha ao iniciar sincronização:', err);
    setSyncStatus(navigator.onLine ? 'error' : 'offline');
  }
}

// Para a sincronização — chamado no logout
function stopDataSync() {
  if (_unsubscribeShared) { _unsubscribeShared(); _unsubscribeShared = null; }
  if (_unsubscribeHistory) { _unsubscribeHistory(); _unsubscribeHistory = null; }
  clearTimeout(_syncTimer);
  _localDirty = false;
  firebaseDb = null;
  setSyncStatus('offline');
}

function getFormFields() {
  return { reportDate: $('reportDate').value, shiftSelect: $('shiftSelect').value, weekdaySelect: $('weekdaySelect').value };
}
function applyFormFields(f) {
  if (!f) return;
  if (f.reportDate) $('reportDate').value = f.reportDate;
  if (f.shiftSelect) $('shiftSelect').value = f.shiftSelect;
  if (f.weekdaySelect) $('weekdaySelect').value = f.weekdaySelect;
}

// Evita destruir o que o usuário está digitando: aplica estado remoto só fora de edição
function isEditingEquipment() {
  const a = document.activeElement;
  return !!(a && a.closest && a.closest('.equip-list') && /INPUT|TEXTAREA|SELECT/.test(a.tagName));
}

function applySharedState(d) {
  if (!d) return;
  if (_localDirty) return; // nossa versão local é mais nova e será enviada em seguida
  if (isEditingEquipment()) { _pendingRemoteState = d; return; }
  _pendingRemoteState = null;
  applyFormFields(d.form);
  const norm = normalizeData(d);
  TYPES.forEach(t => { if (Array.isArray(d[t])) DATA[t] = norm[t]; });
  renderAll();
}

document.addEventListener('focusout', () => {
  setTimeout(() => {
    if (_pendingRemoteState && !isEditingEquipment()) applySharedState(_pendingRemoteState);
  }, 50);
});

function scheduleSharedSave() {
  _localDirty = true;
  _pendingRemoteState = null; // nossa edição substitui qualquer estado remoto adiado
  clearTimeout(_syncTimer);
  setSyncStatus('syncing');
  _syncTimer = setTimeout(pushSharedState, 1200);
}

async function pushSharedState() {
  clearTimeout(_syncTimer);
  if (!firebaseDb) { _localDirty = false; setSyncStatus('offline'); return; }
  const payload = {
    ...cleanData(), form: getFormFields(), writer: CLIENT_ID,
    updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
  };
  try {
    await firebaseDb.doc(SHARED_DOC).set(payload);
    _localDirty = false;
    _pendingRemoteState = null;
    setSyncStatus('synced');
  } catch (err) {
    console.error('Erro ao sincronizar:', err);
    _localDirty = false;
    setSyncStatus('error');
  }
}

async function initSharedSync() {
  if (!firebaseDb) return;
  setSyncStatus('connecting');
  try {
    const snap = await firebaseDb.doc(SHARED_DOC).get();
    if (snap.exists) applySharedState(snap.data());
    else await pushSharedState();
    setSyncStatus('synced');
  } catch (err) {
    console.error('Erro ao carregar estado compartilhado:', err);
    setSyncStatus('error');
  }
  if (_unsubscribeShared) return;
  _unsubscribeShared = firebaseDb.doc(SHARED_DOC).onSnapshot(snap => {
    if (!snap.exists || snap.metadata.hasPendingWrites) return;
    const d = snap.data();
    if (d.writer === CLIENT_ID) { if (!_localDirty) setSyncStatus('synced'); return; } // eco da nossa escrita
    applySharedState(d);
    setSyncStatus('synced');
  }, err => { console.error('Listener do estado:', err); setSyncStatus('error'); });
}

// Eventos de inclusão/exclusão (auditoria)
function logEquipmentEvent(action, type, e) {
  const payload = {
    action, equipmentType: type, tag: e.tag || '', maintenance: e.maintenance || '', operator: e.operator || '',
    sub: e.sub || '', supportTeam: e.supportTeam || '', observations: e.observations || '', clientCreatedAt: new Date().toISOString(),
    user: window.CURRENT_USER?.username || '',
  };
  sendEvent(payload).then(ok => { if (!ok) writeJSON(PENDING_EVENTS_KEY, [...readJSON(PENDING_EVENTS_KEY, []), payload]); });
}
async function sendEvent(payload) {
  if (!firebaseDb) return false;
  try {
    await firebaseDb.collection('equipment_events').add({ ...payload, createdAt: window.firebase.firestore.FieldValue.serverTimestamp() });
    return true;
  } catch (err) { console.error('Falha ao gravar evento:', err); return false; }
}
async function flushPendingEvents() {
  const pending = readJSON(PENDING_EVENTS_KEY, []);
  if (!pending.length || !firebaseDb) return;
  const failed = [];
  for (const p of pending) if (!(await sendEvent(p))) failed.push(p);
  writeJSON(PENDING_EVENTS_KEY, failed);
}

// ── Mutação + persistência ───────────────────────────────────────────────────
function commit({ rerender = false } = {}) {
  TYPES.forEach(t => DATA[t].forEach(e => {
    if (e.operator === OP_VALE && !isValeEquip(e, t)) e.operator = ''; // ex.: TAG editada
    e.status = statusOf(e, t);
  }));
  saveDataLocal();
  scheduleSharedSave();
  if (rerender) renderAll(); else renderKpis();
}

// ── Renderização dos equipamentos ────────────────────────────────────────────
function segmented(options, current, onPick) {
  const wrap = el('div', { class: 'seg' });
  options.forEach(([value, label, tone]) => {
    const b = el('button', { type: 'button', class: `seg-btn tone-${tone || 'neutral'}${value === current ? ' active' : ''}`, text: label });
    b.addEventListener('click', () => {
      if (value === current) return;
      onPick(value);
    });
    wrap.appendChild(b);
  });
  return wrap;
}

function renderEquipCard(e, type) {
  const status = statusOf(e, type);
  const inactive = !isActiveInShift(e);
  const card = el('div', {
    class: `equip-card st-${status === E_RED ? 'red' : status === E_YELLOW ? 'yellow' : 'green'}${inactive ? ' inactive' : ''}${issueOf(e, type) ? ' needs-op' : ''}${isValeEquip(e, type) ? ' vale' : ''}`,
  });
  const vale = isValeEquip(e, type);

  // ── Cabeçalho: status + TAG + ações
  const tagInput = el('input', {
    type: 'text', class: 'tag-input', value: e.tag, placeholder: 'TAG (ex: 1JA123)', readOnly: !!e.tag && !e._editing,
  });
  tagInput.addEventListener('change', () => {
    const next = tagInput.value.trim();
    if (!next) { tagInput.value = e.tag; return; }
    if (normalizeTag(next) !== normalizeTag(e.tag) && isDuplicateTag(next, e)) {
      toast(`A TAG ${next} já existe na lista.`, 'error');
      tagInput.value = e.tag;
      return;
    }
    e.tag = next;
    delete e._editing;
    commit({ rerender: true });
  });

  const editBtn = el('button', {
    type: 'button', class: `icon-btn sm${e._editing ? ' active' : ''}`, title: 'Editar TAG', text: '✏️',
    onclick: () => {
      e._editing = !e._editing;
      tagInput.readOnly = !e._editing;
      editBtn.classList.toggle('active', !!e._editing);
      if (e._editing) { tagInput.focus(); tagInput.select(); }
    },
  });
  const delBtn = el('button', {
    type: 'button', class: 'icon-btn sm danger', title: 'Excluir equipamento', text: '🗑',
    onclick: () => {
      if (!window.confirm(`Excluir ${e.tag ? 'o equipamento ' + e.tag : 'este equipamento'}?`)) return;
      logEquipmentEvent('deleted', type, e);
      const i = DATA[type].indexOf(e);
      if (i !== -1) DATA[type].splice(i, 1);
      commit({ rerender: true });
    },
  });

  card.appendChild(el('div', { class: 'equip-head' }, [
    el('span', { class: `state-pill ${stateTone(e, type)}`, text: stateText(e, type) }),
    tagInput,
    // ADM incluído manualmente em fim de semana (turno B/D): permite retirar só deste turno
    !inactive && isAdmEquip(e) && isAdmHiddenNow() ? el('button', {
      type: 'button', class: 'badge manual', title: 'Retirar deste turno (não exclui o equipamento)', text: 'Manual ✕',
      onclick: () => { delete e.manualFor; commit({ rerender: true }); toast(`${e.tag} retirado deste turno.`); },
    }) : null,
    vale ? el('span', { class: 'vale-badge', title: 'Empilhadeira exclusiva de Operação Vale', text: '🏷 OPERAÇÃO VALE' }) : null,
    el('div', { class: 'row-actions' }, [editBtn, delBtn]),
  ]));

  // ── Situação
  card.appendChild(el('div', { class: 'equip-line' }, [
    el('span', { class: 'line-label', text: 'Situação' }),
    segmented([
      [MAINT.NONE, 'Operacional', 'green'],
      [MAINT.PREV, 'Preventiva', 'orange'],
      [MAINT.CORR, 'Corretiva', 'red'],
    ], e.maintenance, v => {
      const enteringMaint = !e.maintenance && v;
      e.maintenance = v;
      // Ao entrar em manutenção o operador deve ser confirmado explicitamente
      // (exceto Operação Vale, que só muda com confirmação)
      if (enteringMaint && e.operator !== OP_VALE) e.operator = '';
      if (!v && !hasOperatorInfo(e)) e.operator = OP_WITH;
      commit({ rerender: true });
    }),
  ]));

  // ── Operador (obrigatório inclusive em manutenção)
  const opName = el('input', {
    type: 'text', class: 'opname-input', placeholder: '👤 Nome do operador', value: e.operatorName,
    oninput: ev => {
      e.operatorName = ev.target.value;
      const issue = issueOf(e, type);
      needBadge.textContent = issue ? `⚠ ${issue[0].toUpperCase()}${issue.slice(1)}` : '';
      needBadge.classList.toggle('hidden', !issue);
      card.classList.toggle('needs-op', !!issue);
      commit();
    },
  });
  const opOptions = [[OP_WITH, 'Com operador', 'green'], [OP_NONE, 'Sem operador', 'yellow']];
  if (vale) opOptions.push([OP_VALE, 'Operação Vale', 'blue']);
  const opLine = el('div', { class: 'equip-line' }, [
    el('span', { class: 'line-label', text: 'Operador' }),
    segmented(opOptions, e.operator, v => {
      if (vale && e.operator === OP_VALE && !window.confirm(
        `ATENÇÃO: ${e.tag} é empilhadeira de OPERAÇÃO VALE.\n\nConfirma alterar para "${v}"?`)) return;
      e.operator = v;
      commit({ rerender: true });
    }),
  ]);
  if (e.operator === OP_WITH) opLine.appendChild(opName);
  const issue = issueOf(e, type);
  const needBadge = el('span', { class: `need-badge${issue ? '' : ' hidden'}`, text: issue ? `⚠ ${issue[0].toUpperCase()}${issue.slice(1)}` : '' });
  opLine.appendChild(needBadge);
  card.appendChild(opLine);

  // ── Sinaleiro (guindastes)
  if (isCrane(type)) {
    card.appendChild(el('div', { class: 'equip-line' }, [
      el('span', { class: 'line-label', text: 'Sinaleiro' }),
      segmented([[SIG_WITH, 'Com sinaleiro', 'green'], [SIG_NONE, 'Sem sinaleiro', 'yellow']], e.signaler, v => {
        e.signaler = v; commit({ rerender: true });
      }),
    ]));
  }

  // ── Detalhes (substituição, apoio, observações)
  const dedicated = getDedicatedTeam(e);
  if (!e.supportTeam && dedicated) e.supportTeam = dedicated;
  const summaryBits = [];
  if (e.sub) summaryBits.push(`↔ Sub ${e.sub}`);
  if (e.supportTeam) summaryBits.push(`Apoio ${e.supportTeam}`);
  if (e.observations) summaryBits.push('📝 Obs');
  const details = el('details', { class: 'equip-details', open: !!e._open });
  details.addEventListener('toggle', () => { e._open = details.open; });
  details.appendChild(el('summary', {}, [
    el('span', { text: 'Detalhes' }),
    el('span', { class: 'details-summary', text: summaryBits.join(' · ') || 'substituição, apoio, observações' }),
  ]));

  const subInput = el('input', {
    type: 'text', placeholder: 'Substitui a TAG (ex: 1JA339)', value: e.sub,
    onchange: ev => { e.sub = ev.target.value.trim().toUpperCase(); commit({ rerender: true }); },
  });
  const supportInput = el('input', {
    type: 'text', placeholder: 'Equipe que recebe apoio', value: e.supportTeam,
    class: dedicated && e.supportTeam && e.supportTeam !== dedicated ? 'diverged' : '',
    onchange: ev => {
      const next = ev.target.value.trim().toUpperCase();
      if (dedicated && next && next !== dedicated &&
          !window.confirm(`O equipamento ${e.tag} é dedicado à equipe ${dedicated}.\n\nDeseja realmente destiná-lo para ${next}?`)) {
        ev.target.value = e.supportTeam || dedicated;
        return;
      }
      e.supportTeam = next;
      commit({ rerender: true });
    },
  });
  const obsInput = el('textarea', {
    rows: 2, placeholder: 'Observações', value: e.observations.replace(/^\(OBS:\s*|\)$/g, ''),
    oninput: ev => { e.observations = normalizeObservationText(ev.target.value); commit(); },
  });
  details.appendChild(el('div', { class: 'details-grid' }, [
    el('label', { class: 'mini-field' }, [el('span', { text: 'Substituição' }), subInput]),
    el('label', { class: 'mini-field' }, [
      el('span', { text: 'Apoio' }), supportInput,
      dedicated ? el('small', { class: 'dedicated', text: `🔒 Dedicado: ${dedicated}` }) : null,
    ]),
    el('label', { class: 'mini-field wide' }, [el('span', { text: 'Observações' }), obsInput]),
  ]));
  card.appendChild(details);

  return card;
}

function isDuplicateTag(tag, current = null) {
  const n = normalizeTag(tag);
  return !!n && TYPES.some(t => DATA[t].some(e => e !== current && normalizeTag(e.tag) === n));
}

function sortForDisplay(type, list) {
  if (type !== 'caminhoes') return list;
  // Dedicados primeiro, ADM por último
  return [...list].sort((a, b) => {
    const aAdm = isAdmEquip(a), bAdm = isAdmEquip(b);
    if (aAdm !== bAdm) return aAdm ? 1 : -1;
    const aDed = !!getDedicatedTeam(a), bDed = !!getDedicatedTeam(b);
    if (aDed !== bDed) return aDed ? -1 : 1;
    return 0;
  });
}

// Texto e cor da etiqueta de status do card
function stateText(e, type) {
  if (e.maintenance === MAINT.PREV) return 'Preventiva';
  if (e.maintenance === MAINT.CORR) return 'Corretiva';
  if (!hasOperatorInfo(e)) return 'Falta informar';
  if (e.operator === OP_NONE) return 'Sem operador';
  if (isCrane(type) && e.signaler === SIG_NONE) return 'Sem sinaleiro';
  return e.operator === OP_VALE ? 'Operação Vale' : 'Operando';
}
function stateTone(e, type) {
  if (e.maintenance === MAINT.PREV) return 'orange';
  if (e.maintenance === MAINT.CORR) return 'red';
  return statusOf(e, type) === E_YELLOW ? 'yellow' : 'green';
}

// Filtro rápido da tela de relatório (não altera os dados)
let reportFilter = 'all';
const REPORT_FILTERS = {
  all:     () => true,
  pending: (e, t) => !!issueOf(e, t),
  maint:   e => !!e.maintenance,
  noop:    e => e.operator === OP_NONE,
};

const COLLAPSE_KEY = 'xcmgCollapsed';
function getCollapsed() { return readJSON(COLLAPSE_KEY, []); }

function renderAll() {
  const collapsed = getCollapsed();
  const filterFn = REPORT_FILTERS[reportFilter] || REPORT_FILTERS.all;
  TYPES.forEach(type => {
    const list = $(`list-${type}`);
    const section = list.closest('.equip-section');
    list.innerHTML = '';
    const items = sortForDisplay(type, DATA[type])
      .filter(e => isActiveInShift(e))
      .filter(e => filterFn(e, type));
    if (!items.length) {
      list.appendChild(el('p', { class: 'empty', text: reportFilter === 'all' ? 'Nenhum equipamento cadastrado.' : 'Nenhum equipamento neste filtro.' }));
    }
    items.forEach(e => list.appendChild(renderEquipCard(e, type)));

    const active = activeItems(type);
    const c = countStates(active);
    $(`count-${type}`).textContent = active.length;
    const pend = active.filter(e => issueOf(e, type)).length;
    $(`stats-${type}`).innerHTML =
      `<span class="mini green" title="Operando">${c.operando}</span>`
      + (c.semOperador ? `<span class="mini yellow" title="Sem operador">${c.semOperador}</span>` : '')
      + (c.preventiva + c.corretiva ? `<span class="mini red" title="Em manutenção">${c.preventiva + c.corretiva}</span>` : '')
      + (pend ? `<span class="mini warn" title="Pendências">⚠ ${pend}</span>` : '');
    // Com filtro ativo, esconde seções vazias; seção recolhida abre sozinha se houver resultado filtrado
    section.classList.toggle('hidden', reportFilter !== 'all' && !items.length);
    section.classList.toggle('collapsed', reportFilter === 'all' && collapsed.includes(type));
  });
  updateAdmButtons();
  renderKpis();
}

function countStates(items) {
  const c = { total: 0, operando: 0, semOperador: 0, preventiva: 0, corretiva: 0, semOperadorTotal: 0, semSinaleiro: 0 };
  items.forEach(e => {
    c.total++;
    c[stateOf(e)]++;
    if (e.operator === OP_NONE) c.semOperadorTotal++;
    if (e.signaler === SIG_NONE) c.semSinaleiro++;
  });
  return c;
}

function kpiHtml(c) {
  const disp = c.total ? Math.round(((c.total - c.preventiva - c.corretiva) / c.total) * 100) : 0;
  const k = (cls, n, label) => `<div class="kpi ${cls}"><b>${n}</b><span>${label}</span></div>`;
  return `<div class="kpi blue kpi-main"><b>${disp}%</b><span>Disponibilidade · ${c.total - c.preventiva - c.corretiva} de ${c.total} fora de manutenção</span><i class="bar"><i style="width:${disp}%"></i></i></div>`
    + k('green', c.operando, 'Operando') + k('yellow', c.semOperador, 'Sem operador')
    + k('orange', c.preventiva, 'Preventiva') + k('red', c.corretiva, 'Corretiva');
}

function renderKpis() {
  const all = TYPES.flatMap(t => activeItems(t));
  $('liveKpis').innerHTML = kpiHtml(countStates(all));
  const issues = allIssues();
  const alertBox = $('pendingAlert');
  if (issues.length) {
    alertBox.textContent = `⚠ Pendências: ${issues.map(x => `${x.e.tag || '(sem TAG)'} – ${x.msg}`).join('; ')}`;
    alertBox.classList.remove('hidden');
  } else alertBox.classList.add('hidden');
  const pb = $('pendingBtn');
  pb.textContent = `⚠ ${issues.length} pendência${issues.length > 1 ? 's' : ''}`;
  pb.classList.toggle('hidden', !issues.length);
}

// Leva o usuário até a primeira pendência
function goToFirstPending() {
  if (reportFilter !== 'all' && reportFilter !== 'pending') setReportFilter('all');
  const card = document.querySelector('#view-report .equip-card.needs-op');
  if (!card) return;
  card.closest('.equip-section')?.classList.remove('collapsed');
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.add('flash');
  setTimeout(() => card.classList.remove('flash'), 1400);
}

function setReportFilter(f) {
  reportFilter = f;
  document.querySelectorAll('#reportFilterChips .chip').forEach(c => c.classList.toggle('active', c.dataset.filter === f));
  renderAll();
  if (f !== 'all' && !document.querySelector('#view-report .equip-card')) toast('Nenhum equipamento neste filtro. ✅', 'success');
}

// Botões "+ ADM": aparecem quando o ADM não está no relatório
// (foi excluído, ou está oculto no fim de semana turno B/D)
function updateAdmButtons() {
  [['1JA405 - ADM', 'addAdm405Btn'], ['1JA406 - ADM', 'addAdm406Btn']].forEach(([tag, id]) => {
    const existing = DATA.caminhoes.find(e => normalizeTag(e.tag) === tag);
    const btn = $(id);
    if (!btn) return;
    btn.classList.toggle('hidden', !!existing && isActiveInShift(existing) || (!existing && isDuplicateTag(tag)));
    btn.textContent = existing ? `+ Incluir ${tag} neste turno` : `+ ${tag}`;
  });
  const note = $('admNote');
  if (note) note.classList.toggle('hidden', !isAdmHiddenNow());
}

function addAdm(tag) {
  const existing = DATA.caminhoes.find(e => normalizeTag(e.tag) === tag);
  if (!existing) { addEquipment('caminhoes', tag); return; }
  existing.manualFor = admManualKey();
  commit({ rerender: true });
  toast(`${tag} incluído manualmente neste turno.`, 'success');
}

function addEquipment(type, tag = '') {
  if (tag && isDuplicateTag(tag)) { toast(`A TAG ${tag} já existe na lista.`, 'error'); return; }
  const item = normalizeEquip({ tag, maintenance: MAINT.NONE, operator: OP_WITH }, type);
  if (!tag) item._editing = true;
  DATA[type].push(item);
  logEquipmentEvent('added', type, item);
  commit({ rerender: true });
  if (!tag) {
    const cards = $(`list-${type}`).querySelectorAll('.tag-input');
    const input = cards[cards.length - 1];
    if (input) { input.scrollIntoView({ behavior: 'smooth', block: 'center' }); input.focus(); }
  }
}

// ── Texto do relatório ───────────────────────────────────────────────────────
function operatorText(e) {
  const op = e.operator || 'OPERADOR NÃO INFORMADO';
  // Operação Vale não leva nome de operador
  return e.operatorName && e.operator === OP_WITH ? `${op} – ${e.operatorName.trim()}` : op;
}
function subText(e) { return e.sub ? ` SUB ${E_RED}${e.sub}` : ''; }

const STATUS_ORDER = { [E_GREEN]: 0, [E_YELLOW]: 1, [E_RED]: 2 };
function sortByStatus(list, type) {
  return [...list].sort((a, b) => STATUS_ORDER[statusOf(a, type)] - STATUS_ORDER[statusOf(b, type)]);
}

function buildReport() {
  const shift = currentShift();
  let t = `*Status XCMG MINA ${isoToBR($('reportDate').value)}*\n\nTURNO ${shift}\n\n${$('weekdaySelect').value}\n\n`;

  TYPES.forEach(type => {
    const items = sortByStatus(activeItems(type, shift), type);
    t += `\n*${TYPE_INFO[type].title}*\n\n`;
    items.forEach(e => {
      const st = statusOf(e, type);
      const maint = e.maintenance ? `MANUTENÇÃO ${e.maintenance}` : '';
      if (isCrane(type)) {
        t += `${st} *${e.tag}*${subText(e)}${maint ? ' ' + maint : ''}\n`;
        if (e.supportTeam) t += `- APOIO ${e.supportTeam}\n`;
        t += `${operatorEmoji(e)} ${operatorText(e)}\n`;
        t += `${e.signaler === SIG_NONE ? E_YELLOW : E_GREEN} ${e.signaler}\n`;
      } else {
        const opPart = maint ? `${maint} / ${operatorText(e)}` : operatorText(e);
        t += `${st} *${e.tag}*${subText(e)} ${opPart}${e.supportTeam ? ' - APOIO ' + e.supportTeam : ''}\n`;
      }
      const obs = normalizeObservationText(e.observations);
      if (obs) t += `${obs}\n`;
      t += '\n';
    });
  });

  t += `\n*Legenda:*\n\n${E_GREEN} Com operador\n${E_YELLOW} Sem operador\n${E_RED} Manutenção Corretiva/Preventiva\n`;
  t += `\n${buildOperationalSummary(shift)}`;
  return t;
}

function buildOperationalSummary(shift) {
  const lines = [];
  const tags = list => `(${list.map(e => e.tag).join(' - ')})`;
  // Em manutenção: destaca quem está sem operador
  const maintTags = list => `(${list.map(e => e.operator === OP_NONE ? `${e.tag} SEM OPERADOR` : e.tag).join(' - ')})`;
  // Operacionais: identifica Operação Vale
  const opTags = list => `(${list.map(e => e.operator === OP_VALE ? `${e.tag} OPERAÇÃO VALE` : e.tag).join(' - ')})`;
  // Falta de operador: indica se o equipamento também está em manutenção
  const noOpTags = list => `(${list.map(e => e.maintenance ? `${e.tag} EM ${e.maintenance}` : e.tag).join(' - ')})`;
  TYPES.forEach(type => {
    const items = activeItems(type, shift);
    if (!items.length) return;
    const info = TYPE_INFO[type];
    const pl = (n, one, many) => (n > 1 ? many : one);
    const operational = items.filter(e => !e.maintenance && e.operator !== OP_NONE);
    const prev = items.filter(e => e.maintenance === MAINT.PREV);
    const corr = items.filter(e => e.maintenance === MAINT.CORR);
    const noOp = items.filter(e => e.operator === OP_NONE);
    const noSig = items.filter(e => e.signaler === SIG_NONE);
    if (operational.length) lines.push(`${operational.length} *${pl(operational.length, info.opOne, info.opMany)}* ${opTags(operational)}`);
    if (prev.length) lines.push(`${prev.length} *${pl(prev.length, info.one, info.many)} em preventiva* ${maintTags(prev)}`);
    if (corr.length) lines.push(`${corr.length} *${pl(corr.length, info.one, info.many)} em corretiva* ${maintTags(corr)}`);
    if (noOp.length) lines.push(`${noOp.length} ${pl(noOp.length, 'operador a menos de', 'operadores a menos de')} *${pl(noOp.length, info.one, info.many)}* ${noOpTags(noOp)}`);
    if (noSig.length) lines.push(`${noSig.length} ${pl(noSig.length, 'sinaleiro a menos de', 'sinaleiros a menos de')} *${pl(noSig.length, info.one, info.many)}* ${tags(noSig)}`);
  });
  if (!lines.length) lines.push('Nenhum equipamento registrado.');
  return `*Resumo Operacional*\n\n${lines.join('\n\n')}`;
}

function snapshotCurrent(shift = currentShift()) {
  return TYPES.flatMap(type => activeItems(type, shift).map(e => ({
    type, tag: e.tag, maintenance: e.maintenance, operator: e.operator, operatorName: e.operatorName || '',
    signaler: e.signaler || '', sub: e.sub || '', supportTeam: e.supportTeam || '', observations: e.observations || '',
  })));
}

function validateBeforeGenerate() {
  const all = TYPES.flatMap(t => activeItems(t));
  const noTag = all.filter(e => !e.tag.trim());
  if (noTag.length) { toast('Há equipamento sem TAG. Preencha ou exclua antes de gerar.', 'error'); return false; }
  const issues = allIssues();
  if (issues.length) {
    toast(`Pendências: ${issues.map(x => `${x.e.tag} – ${x.msg}`).join('; ')}`, 'error');
    $('pendingAlert').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// HISTÓRICO
// Cada item: { id, reportDate (YYYY-MM-DD), shift, weekday, savedAt (ISO), content, snapshot[] }
// 1 relatório por data + turno. Gerar novamente substitui.
// ═══════════════════════════════════════════════════════════════════════════
let HISTORY = [];
const historyFilter = { query: '', period: '30', shift: 'all', expanded: new Set() };

function historyId(reportDate, shift) { return `${reportDate}_${shift}`; }

// Lê o texto antigo do relatório e reconstrói os equipamentos (compatibilidade)
function parseReportText(content) {
  const out = [];
  let section = null;
  let current = null;
  const lines = String(content || '').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^\*legenda/i.test(line) || /^\*resumo/i.test(line)) break;
    if (/^\*/.test(line)) {
      if (/guindaste/i.test(line)) section = 'guindastes';
      else if (/carreta/i.test(line)) section = 'carretas';
      else if (/caminh/i.test(line)) section = 'caminhoes';
      else if (/guindauto|munck/i.test(line)) section = 'guindauto';
      else if (/empilhadeira/i.test(line)) section = 'empilhadeiras';
      continue;
    }
    if (!section) continue;
    const m = line.match(/^(🟢|🟡|🔴)\s*\*([^*]+)\*(.*)$/u);
    if (m) {
      const rest = m[3];
      current = { type: section, tag: m[2].trim(), maintenance: '', operator: '', signaler: '' };
      const sm = rest.match(/SUB\s*🔴?\s*(\S+)/u);
      if (sm) current.sub = sm[1];
      const am = rest.match(/APOIO\s+(.+)$/);
      if (am) current.supportTeam = am[1].trim();
      readFlags(current, rest);
      if (section !== 'guindastes' && !current.operator && !current.maintenance) current.operator = OP_WITH;
      out.push(current);
      continue;
    }
    if (current && current.type === 'guindastes' && /^(🟢|🟡|🔴)/u.test(line)) {
      if (/SINALEIRO/.test(line)) current.signaler = /SEM SINALEIRO/.test(line) ? SIG_NONE : SIG_WITH;
      else readFlags(current, line);
    }
  }
  return out;
}
function readFlags(e, text) {
  if (/MANUTENÇÃO PREVENTIVA/.test(text)) e.maintenance = MAINT.PREV;
  else if (/MANUTENÇÃO CORRETIVA/.test(text)) e.maintenance = MAINT.CORR;
  if (/SEM OPERADOR/.test(text)) e.operator = OP_NONE;
  else if (/OPERAÇÃO VALE/.test(text)) e.operator = OP_VALE;
  else if (/COM OPERADOR/.test(text)) e.operator = OP_WITH;
}

function parseReportHeader(content) {
  const text = String(content || '');
  const dm = text.match(/MINA\s+(\d{2})\/(\d{2})\/(\d{4})/);
  const sm = text.match(/TURNO\s+([A-D])/i);
  const wm = text.match(/\n(DOMINGO|SEGUNDA-FEIRA|TERÇA-FEIRA|QUARTA-FEIRA|QUINTA-FEIRA|SEXTA-FEIRA|SÁBADO)\n/);
  return {
    reportDate: dm ? `${dm[3]}-${dm[2]}-${dm[1]}` : '',
    shift: sm ? sm[1].toUpperCase() : '',
    weekday: wm ? wm[1] : '',
  };
}

function normalizeHistoryItem(raw) {
  if (!raw || typeof raw.content !== 'string' || !raw.content.trim()) return null;
  const header = parseReportHeader(raw.content);
  let savedAt = raw.savedAtISO || raw.clientCreatedAt || raw.date || '';
  if (raw.savedAt && typeof raw.savedAt.toDate === 'function') savedAt = raw.savedAt.toDate().toISOString();
  else if (typeof raw.savedAt === 'string') savedAt = raw.savedAt;
  if (isNaN(new Date(savedAt))) savedAt = '';
  const reportDate = raw.reportDate || header.reportDate || (savedAt ? savedAt.slice(0, 10) : '');
  const shift = raw.shift || header.shift || '?';
  if (!reportDate) return null;
  const snapshot = Array.isArray(raw.snapshot) && raw.snapshot.length ? raw.snapshot : parseReportText(raw.content);
  return {
    id: historyId(reportDate, shift),
    reportDate, shift,
    weekday: raw.weekday || header.weekday || weekdayOf(reportDate),
    savedAt: savedAt || `${reportDate}T12:00:00.000Z`,
    content: raw.content,
    savedBy: typeof raw.savedBy === 'string' ? raw.savedBy : '',
    snapshot: snapshot.map(s => ({ ...s, state: stateOf(s) })),
  };
}

// Mantém o mais recente por data+turno e ordena (mais novo primeiro)
function mergeHistory(...lists) {
  const map = new Map();
  lists.flat().forEach(raw => {
    const it = raw && raw.snapshot && raw.id ? raw : normalizeHistoryItem(raw);
    if (!it) return;
    const prev = map.get(it.id);
    if (!prev || it.savedAt >= prev.savedAt) map.set(it.id, it);
  });
  return [...map.values()].sort((a, b) =>
    a.reportDate !== b.reportDate ? (a.reportDate < b.reportDate ? 1 : -1) : (a.savedAt < b.savedAt ? 1 : -1)
  ).slice(0, HISTORY_LIMIT);
}

function loadLocalHistory() {
  HISTORY = mergeHistory(readJSON(HISTORY_STORAGE_KEY, []), readJSON(LEGACY_HISTORY_KEY, []), readJSON(PENDING_HISTORY_KEY, []));
}
function persistLocalHistory() { writeJSON(HISTORY_STORAGE_KEY, HISTORY); }

function toFirestoreHistory(item) {
  return {
    reportDate: item.reportDate, shift: item.shift, weekday: item.weekday, content: item.content,
    snapshot: item.snapshot.map(({ state, ...rest }) => rest),
    savedAtISO: item.savedAt, clientCreatedAt: item.savedAt, savedBy: item.savedBy || '',
    savedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
  };
}

async function saveHistoryRemote(item) {
  if (!firebaseDb) { queuePendingHistory(item); return false; }
  try {
    await firebaseDb.collection(HISTORY_COLLECTION).doc(item.id).set(toFirestoreHistory(item));
    return true;
  } catch (err) {
    console.error('Erro ao salvar histórico:', err);
    queuePendingHistory(item);
    return false;
  }
}
function queuePendingHistory(item) {
  const pending = readJSON(PENDING_HISTORY_KEY, []).filter(p => p.id !== item.id);
  pending.push(item);
  writeJSON(PENDING_HISTORY_KEY, pending);
}
async function flushPendingHistory() {
  if (!firebaseDb) return;
  const pending = readJSON(PENDING_HISTORY_KEY, []);
  if (!pending.length) return;
  writeJSON(PENDING_HISTORY_KEY, []);
  for (const item of pending) await saveHistoryRemote(item);
}

function subscribeHistory() {
  if (!firebaseDb || _unsubscribeHistory) return;
  _unsubscribeHistory = firebaseDb.collection(HISTORY_COLLECTION)
    .orderBy('savedAt', 'desc').limit(HISTORY_LIMIT)
    .onSnapshot(snap => {
      if (snap.metadata.hasPendingWrites) return;
      const remote = [];
      snap.forEach(doc => remote.push(doc.data() || {}));
      HISTORY = mergeHistory(remote, readJSON(PENDING_HISTORY_KEY, []), HISTORY);
      persistLocalHistory();
      if (!$('view-history').classList.contains('hidden')) renderHistory();
      if (!$('view-metrics').classList.contains('hidden')) renderMetrics();
    }, err => console.error('Listener do histórico:', err));
}

async function saveCurrentReport(content) {
  const reportDate = $('reportDate').value || todayISO();
  const shift = currentShift();
  const item = normalizeHistoryItem({
    reportDate, shift, weekday: $('weekdaySelect').value, content,
    snapshot: snapshotCurrent(shift), savedAt: new Date().toISOString(),
    savedBy: window.CURRENT_USER?.name || window.CURRENT_USER?.username || '',
  });
  HISTORY = mergeHistory([item], HISTORY);
  persistLocalHistory();
  const ok = await saveHistoryRemote(item);
  if (firebaseDb) {
    firebaseDb.collection('equipment_snapshots').add({
      savedAt: window.firebase.firestore.FieldValue.serverTimestamp(), clientSavedAt: item.savedAt,
      reportDate, shift, ...cleanData(),
    }).catch(err => console.warn('Snapshot não salvo:', err));
  }
  return ok;
}

// ── Filtros e análise ─────────────────────────────────────────────────────────
function filteredHistory() {
  const q = historyFilter.query.trim().toUpperCase();
  const minDate = historyFilter.period === 'all' ? '' : (() => {
    const d = new Date(); d.setDate(d.getDate() - Number(historyFilter.period));
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  })();
  return HISTORY.filter(h =>
    (historyFilter.shift === 'all' || h.shift === historyFilter.shift) &&
    (!minDate || h.reportDate >= minDate) &&
    (!q || h.content.toUpperCase().includes(q))
  );
}

function stateMap(item) {
  const m = new Map();
  (item?.snapshot || []).forEach(s => m.set(baseTag(s.tag), s));
  return m;
}

function diffReports(newer, older) {
  if (!older) return [];
  const a = stateMap(older), b = stateMap(newer);
  const changes = [];
  b.forEach((s, key) => {
    const prev = a.get(key);
    if (!prev) { changes.push({ tag: s.tag, from: 'ausente', to: s.state }); return; }
    if (prev.state !== s.state) changes.push({ tag: s.tag, from: prev.state, to: s.state });
    else if (s.maintenance && prev.operator !== s.operator && s.operator) changes.push({ tag: s.tag, from: prev.state, to: s.state, note: `operador: ${s.operator.toLowerCase()}` });
  });
  a.forEach((s, key) => { if (!b.has(key)) changes.push({ tag: s.tag, from: s.state, to: 'ausente' }); });
  const rank = { corretiva: 0, preventiva: 1, semOperador: 2, operando: 3, ausente: 4 };
  return changes.sort((x, y) => rank[x.to] - rank[y.to]);
}

function buildInsights(items) {
  // items em ordem do mais novo para o mais antigo
  const perTag = new Map();
  [...items].reverse().forEach(h => {
    h.snapshot.forEach(s => {
      const key = baseTag(s.tag);
      if (!perTag.has(key)) perTag.set(key, { tag: s.tag, type: s.type, entries: [] });
      perTag.get(key).entries.push({ date: h.reportDate, shift: h.shift, state: s.state, operator: s.operator });
    });
  });
  const latest = items[0];
  const nowInMaint = [];
  if (latest) {
    latest.snapshot.filter(s => s.state === 'preventiva' || s.state === 'corretiva').forEach(s => {
      const rec = perTag.get(baseTag(s.tag));
      // Conta quantos relatórios consecutivos (do mais novo pra trás) está em manutenção
      let since = latest.reportDate, streak = 0;
      for (let i = rec.entries.length - 1; i >= 0; i--) {
        const st = rec.entries[i].state;
        if (st !== 'preventiva' && st !== 'corretiva') break;
        streak++; since = rec.entries[i].date;
      }
      nowInMaint.push({ ...s, since, streak, days: daysBetween(since, latest.reportDate) + 1 });
    });
    nowInMaint.sort((a, b) => b.days - a.days || b.streak - a.streak);
  }
  const ranking = [...perTag.values()].map(r => {
    const maint = r.entries.filter(e => e.state === 'preventiva' || e.state === 'corretiva').length;
    const corr = r.entries.filter(e => e.state === 'corretiva').length;
    const noOp = r.entries.filter(e => e.operator === OP_NONE).length;
    const transitions = r.entries.reduce((n, e, i, arr) => n + (i && arr[i - 1].state !== e.state ? 1 : 0), 0);
    return { tag: r.tag, total: r.entries.length, maint, corr, noOp, transitions, avail: r.entries.length ? 1 - maint / r.entries.length : 1 };
  });
  const mostMaint = ranking.filter(r => r.maint).sort((a, b) => b.maint - a.maint || b.corr - a.corr).slice(0, 5);
  const mostNoOp = ranking.filter(r => r.noOp).sort((a, b) => b.noOp - a.noOp).slice(0, 5);
  const flaky = ranking.filter(r => r.transitions >= 3).sort((a, b) => b.transitions - a.transitions).slice(0, 5);

  let totalEq = 0, totalMaint = 0;
  items.forEach(h => h.snapshot.forEach(s => { totalEq++; if (s.state === 'preventiva' || s.state === 'corretiva') totalMaint++; }));
  const avgAvail = totalEq ? Math.round((1 - totalMaint / totalEq) * 100) : null;

  const totalNoOp = ranking.reduce((n, r) => n + r.noOp, 0);
  return { perTag, nowInMaint, mostMaint, mostNoOp, flaky, avgAvail, totalNoOp, count: items.length };
}

// ── Renderização do histórico ─────────────────────────────────────────────────
function pill(state, text) { return `<span class="pill ${STATE_CLASS[state]}">${escapeHtml(text ?? STATE_LABEL[state])}</span>`; }
function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function renderHistory() {
  const items = filteredHistory();
  renderInsights(items);
  renderTagTimeline(items);

  const list = $('historyList');
  list.innerHTML = '';
  if (!items.length) {
    list.appendChild(el('div', { class: 'card empty', text: HISTORY.length ? 'Nenhum relatório encontrado com esses filtros.' : 'Nenhum relatório salvo ainda. Gere um relatório na aba “Relatório”.' }));
    return;
  }

  let lastDate = '';
  items.forEach((h, idx) => {
    if (h.reportDate !== lastDate) {
      lastDate = h.reportDate;
      list.appendChild(el('div', { class: 'day-sep', text: `${isoToBR(h.reportDate)} · ${h.weekday}` }));
    }
    // Relatório anterior cronologicamente (no histórico completo, não só filtrado)
    const prev = HISTORY[HISTORY.indexOf(h) + 1];
    const allChanges = diffReports(h, prev);
    const changes = allChanges.filter(ch => ch.from !== 'ausente' && ch.to !== 'ausente');
    const added = allChanges.filter(ch => ch.from === 'ausente').map(ch => ch.tag);
    const removed = allChanges.filter(ch => ch.to === 'ausente').map(ch => ch.tag);
    const extra = (added.length ? `<li><span class="pill">+ ${added.length} incluído(s)</span> <span class="muted">${escapeHtml(added.join(', '))}</span></li>` : '')
      + (removed.length ? `<li><span class="pill">− ${removed.length} fora do relatório</span> <span class="muted">${escapeHtml(removed.join(', '))}</span></li>` : '');
    const c = countStates(h.snapshot);
    const expanded = historyFilter.expanded.has(h.id);

    const card = el('article', { class: 'card hist-card' });
    card.innerHTML = `
      <div class="hist-head">
        <span class="shift-badge">Turno ${escapeHtml(h.shift)}</span>
        <span class="hist-saved">salvo ${escapeHtml(formatDateTime(h.savedAt))}${h.savedBy ? ` por ${escapeHtml(h.savedBy)}` : ''}</span>
        <div class="hist-counts">
          ${pill('operando', `${c.operando} operando`)}
          ${c.semOperador ? pill('semOperador', `${c.semOperador} s/ operador`) : ''}
          ${c.preventiva ? pill('preventiva', `${c.preventiva} preventiva`) : ''}
          ${c.corretiva ? pill('corretiva', `${c.corretiva} corretiva`) : ''}
        </div>
      </div>
      <div class="hist-changes">
        ${!prev ? '<span class="muted">Primeiro relatório registrado.</span>'
          : !allChanges.length ? `<span class="muted">Sem mudanças desde o turno ${escapeHtml(prev.shift)} de ${escapeHtml(isoToBR(prev.reportDate))}.</span>`
          : `<span class="muted">Mudanças desde o turno ${escapeHtml(prev.shift)} de ${escapeHtml(isoToBR(prev.reportDate))}:</span>
             <ul>${changes.map(ch => `<li><b>${escapeHtml(ch.tag)}</b> ${pill(ch.from)} → ${pill(ch.to)}${ch.note ? ` <span class="muted">(${escapeHtml(ch.note)})</span>` : ''}</li>`).join('')}${extra}</ul>`}
      </div>`;
    const actions = el('div', { class: 'hist-actions' }, [
      el('button', { class: 'btn btn-ghost btn-sm', text: expanded ? 'Ocultar texto' : 'Ver texto', onclick: () => {
        expanded ? historyFilter.expanded.delete(h.id) : historyFilter.expanded.add(h.id); renderHistory();
      } }),
      el('button', { class: 'btn btn-ghost btn-sm', text: '📄 Copiar', onclick: () => copyText(h.content) }),
    ]);
    card.appendChild(actions);
    if (expanded) card.appendChild(el('pre', { class: 'output', text: h.content }));
    list.appendChild(card);
  });
}

function renderInsights(items) {
  const box = $('historyInsights');
  if (!items.length) { box.innerHTML = ''; return; }
  const ins = buildInsights(items);
  const row = (label, value) => `<li><span>${label}</span><b>${value}</b></li>`;
  box.innerHTML = `
    <section class="card insights">
      <div class="card-head">
        <h2 class="section-title">💡 Análise do período <span class="muted small">${ins.count} relatório(s)</span></h2>
        <button class="info-btn" data-help="insights" title="Ajuda">i</button>
      </div>
      <div class="kpis">
        <div class="kpi blue"><b>${ins.avgAvail ?? '–'}%</b><span>Disponibilidade média</span></div>
        <div class="kpi red"><b>${ins.nowInMaint.length}</b><span>Em manutenção agora</span></div>
        <div class="kpi yellow"><b>${ins.totalNoOp}</b><span>Faltas de operador</span></div>
      </div>
      <div class="insight-grid">
        <div>
          <h3>🔧 Em manutenção no último relatório</h3>
          ${ins.nowInMaint.length ? `<ul class="rank">${ins.nowInMaint.map(s => row(
            `${escapeHtml(s.tag)} ${pill(s.state)} <span class="muted">${escapeHtml(s.operator ? s.operator.toLowerCase() : 'operador não informado')}</span>`,
            `${s.days === 1 ? 'desde hoje' : `há ${s.days} dias`} <span class="muted">(${s.streak} turno${s.streak > 1 ? 's' : ''})</span>`
          )).join('')}</ul>` : '<p class="muted">Nenhum equipamento em manutenção. 🎉</p>'}
        </div>
        <div>
          <h3>📉 Mais tempo em manutenção</h3>
          ${ins.mostMaint.length ? `<ul class="rank">${ins.mostMaint.map(r => row(
            `${escapeHtml(r.tag)} <span class="muted">${r.corr} corretiva</span>`,
            `${r.maint}/${r.total} relatórios · ${Math.round(r.avail * 100)}% disp.`
          )).join('')}</ul>` : '<p class="muted">Sem manutenções no período.</p>'}
        </div>
        <div>
          <h3>👤 Mais faltas de operador</h3>
          ${ins.mostNoOp.length ? `<ul class="rank">${ins.mostNoOp.map(r => row(escapeHtml(r.tag), `${r.noOp} turno${r.noOp > 1 ? 's' : ''}`)).join('')}</ul>` : '<p class="muted">Nenhuma falta registrada.</p>'}
        </div>
        ${ins.flaky.length ? `<div>
          <h3>🔁 Instáveis (muitas trocas de status)</h3>
          <ul class="rank">${ins.flaky.map(r => row(escapeHtml(r.tag), `${r.transitions} trocas`)).join('')}</ul>
        </div>` : ''}
      </div>
    </section>`;
}

// Linha do tempo por TAG quando a busca corresponde a um equipamento
function renderTagTimeline(items) {
  const box = $('historyTimeline');
  const q = historyFilter.query.trim().toUpperCase();
  box.innerHTML = '';
  if (q.length < 3 || !items.length) return;
  const tags = new Map();
  items.forEach(h => h.snapshot.forEach(s => {
    if (normalizeTag(s.tag).includes(q) || normalizeTag(s.sub).includes(q)) tags.set(baseTag(s.tag), s.tag);
  }));
  if (!tags.size || tags.size > 6) return;
  const chrono = [...items].reverse();
  const section = el('section', { class: 'card' }, [el('div', { class: 'card-head' }, [
    el('h2', { class: 'section-title', text: '🕒 Linha do tempo do equipamento' }),
    el('button', { class: 'info-btn', 'data-help': 'timeline', title: 'Ajuda', text: 'i' }),
  ])]);
  tags.forEach((label, key) => {
    const entries = chrono.map(h => ({ h, s: h.snapshot.find(s => baseTag(s.tag) === key) }));
    const present = entries.filter(x => x.s);
    const maint = present.filter(x => x.s.state === 'preventiva' || x.s.state === 'corretiva').length;
    const strip = el('div', { class: 'timeline' });
    entries.forEach(({ h, s }) => {
      const st = s ? s.state : 'ausente';
      strip.appendChild(el('span', {
        class: `tl-dot ${STATE_CLASS[st]}`,
        title: `${isoToBR(h.reportDate)} turno ${h.shift}: ${STATE_LABEL[st]}${s && s.operator ? ' · ' + s.operator : ''}${s && s.supportTeam ? ' · apoio ' + s.supportTeam : ''}`,
      }));
    });
    section.appendChild(el('div', { class: 'tl-row' }, [
      el('div', { class: 'tl-head' }, [
        el('b', { text: label }),
        el('span', { class: 'muted small', text: `${present.length} relatórios · ${maint} em manutenção · ${present.length ? Math.round((1 - maint / present.length) * 100) : 0}% disponível` }),
      ]),
      strip,
    ]));
  });
  section.appendChild(el('div', { class: 'tl-legend' }, ['operando', 'semOperador', 'preventiva', 'corretiva', 'ausente'].map(st =>
    el('span', {}, [el('span', { class: `tl-dot ${STATE_CLASS[st]}` }), STATE_LABEL[st]]))));
  box.appendChild(section);
}

// ═══════════════════════════════════════════════════════════════════════════
// MÉTRICAS
// ═══════════════════════════════════════════════════════════════════════════
const metricsFilter = { shift: 'all', month: todayISO().slice(0, 7) };
let metricsChart = null;

function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function renderMetrics() {
  const rows = HISTORY
    .filter(h => h.reportDate.startsWith(metricsFilter.month))
    .filter(h => metricsFilter.shift === 'all' || h.shift === metricsFilter.shift)
    .map(h => ({ day: h.reportDate, shift: h.shift, ...countStates(h.snapshot) }))
    .sort((a, b) => a.day !== b.day ? (a.day < b.day ? -1 : 1) : a.shift.localeCompare(b.shift));

  const chartEl = $('metricsChart');
  const tableWrapper = $('metricsTableWrapper');
  if (metricsChart) { metricsChart.destroy(); metricsChart = null; }

  if (!rows.length) {
    chartEl.parentElement.classList.add('hidden');
    $('metricsKpis').innerHTML = '';
    tableWrapper.innerHTML = '<p class="empty">Nenhum relatório neste mês.</p>';
    return;
  }
  chartEl.parentElement.classList.remove('hidden');

  const sum = rows.reduce((acc, r) => {
    ['total', 'operando', 'semOperador', 'preventiva', 'corretiva'].forEach(k => { acc[k] = (acc[k] || 0) + r[k]; });
    return acc;
  }, {});
  const avg = k => (sum[k] / rows.length).toFixed(1).replace('.', ',');
  const disp = sum.total ? Math.round(((sum.total - sum.preventiva - sum.corretiva) / sum.total) * 100) : 0;
  $('metricsKpis').innerHTML = `
    <div class="kpi"><b>${rows.length}</b><span>Relatórios</span></div>
    <div class="kpi green"><b>${avg('operando')}</b><span>Operando (média)</span></div>
    <div class="kpi yellow"><b>${avg('semOperador')}</b><span>S/ operador (média)</span></div>
    <div class="kpi orange"><b>${avg('preventiva')}</b><span>Preventiva (média)</span></div>
    <div class="kpi red"><b>${avg('corretiva')}</b><span>Corretiva (média)</span></div>
    <div class="kpi blue"><b>${disp}%</b><span>Disponibilidade</span></div>`;

  if (window.Chart) {
    const text = cssVar('--text'), grid = cssVar('--border');
    metricsChart = new Chart(chartEl, {
      type: 'bar',
      data: {
        labels: rows.map(r => `${r.day.slice(8, 10)}/${r.day.slice(5, 7)}${metricsFilter.shift === 'all' ? ` ${r.shift}` : ''}`),
        datasets: [
          { label: 'Operando',     data: rows.map(r => r.operando),    backgroundColor: cssVar('--green') },
          { label: 'Sem operador', data: rows.map(r => r.semOperador), backgroundColor: cssVar('--yellow') },
          { label: 'Preventiva',   data: rows.map(r => r.preventiva),  backgroundColor: cssVar('--orange') },
          { label: 'Corretiva',    data: rows.map(r => r.corretiva),   backgroundColor: cssVar('--red') },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        datasets: { bar: { maxBarThickness: 48 } },
        plugins: { legend: { labels: { color: text } }, tooltip: { mode: 'index', intersect: false } },
        scales: {
          x: { stacked: true, ticks: { color: text }, grid: { display: false } },
          y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1, color: text }, grid: { color: grid } },
        },
      },
    });
  }

  tableWrapper.innerHTML = `<table class="metrics-table"><thead><tr>
      <th>Data</th><th>Turno</th><th>Operando</th><th>S/ operador</th><th>Preventiva</th><th>Corretiva</th><th>Disp.</th>
    </tr></thead><tbody>${rows.map(r => `<tr>
      <td>${isoToBR(r.day)}</td><td>${r.shift}</td><td>${r.operando}</td><td>${r.semOperador}</td>
      <td>${r.preventiva}</td><td>${r.corretiva}</td>
      <td>${r.total ? Math.round(((r.total - r.preventiva - r.corretiva) / r.total) * 100) : 0}%</td>
    </tr>`).join('')}</tbody></table>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Eventos de interface
// ═══════════════════════════════════════════════════════════════════════════
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = el('textarea', { value: text, style: 'position:fixed;opacity:0' });
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch { toast('Não foi possível copiar.', 'error'); ta.remove(); return; }
    ta.remove();
  }
  toast('Texto copiado!', 'success');
}

function showView(view) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
  ['report', 'history', 'metrics', 'admin'].forEach(v => $(`view-${v}`).classList.toggle('hidden', v !== view));
  if (view === 'history') renderHistory();
  if (view === 'metrics') renderMetrics();
  if (view === 'admin') renderAdmin(); // auth.js
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setupChips(containerId, onPick) {
  $(containerId).addEventListener('click', ev => {
    const b = ev.target.closest('.chip');
    if (!b) return;
    $(containerId).querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === b));
    onPick(b.dataset.shift);
  });
}

function setupTheme() {
  const html = document.documentElement;
  const btn = $('themeToggleBtn');
  const apply = theme => {
    html.dataset.theme = theme;
    btn.textContent = theme === 'dark' ? '☀️' : '🌙';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b1120' : '#f0f4f8');
  };
  apply(localStorage.getItem(THEME_KEY) || 'dark');
  btn.addEventListener('click', () => {
    const next = html.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    apply(next);
    if (!$('view-metrics').classList.contains('hidden')) renderMetrics();
  });
}

function setupInstall() {
  let deferred;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('installBanner').classList.remove('hidden'); });
  $('installBtn').addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    $('installBanner').classList.add('hidden');
  });
  $('closeInstallBanner').addEventListener('click', () => $('installBanner').classList.add('hidden'));
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js').catch(() => {}));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AJUDA (botões ⓘ)
// ═══════════════════════════════════════════════════════════════════════════
const HELP = {
  cabecalho: {
    title: '📅 Turno do relatório',
    html: `<ul>
      <li><b>Data:</b> dia a que o relatório se refere. O <b>dia da semana</b> é preenchido sozinho ao mudar a data.</li>
      <li><b>Turno:</b> A, B, C ou D.</li>
      <li>Caminhões <b>ADM</b> (1JA405 e 1JA406): de <b>segunda a sexta</b> entram automaticamente no relatório. No <b>sábado e domingo</b>, nos turnos da noite (<b>B e D</b>), ficam ocultos e só entram se forem incluídos manualmente.</li>
      <li>Essas informações são <b>compartilhadas</b>: quem abrir o app em outro aparelho vê a mesma data e turno.</li>
    </ul>`,
  },
  painel: {
    title: '📈 Visão geral',
    html: `<ul>
      <li><b>Disponibilidade:</b> percentual de equipamentos que <b>não</b> estão em manutenção.</li>
      <li><b>Operando / Sem operador / Preventiva / Corretiva:</b> contagem do turno atual, atualizada a cada mudança.</li>
      <li>A faixa amarela lista as <b>pendências</b> (ex.: falta informar o operador). O relatório só é gerado quando não houver pendências.</li>
    </ul>`,
  },
  filtro: {
    title: '🔎 Mostrar (filtro rápido)',
    html: `<p>Mostra só os equipamentos que interessam no momento. <b>Não altera</b> o relatório.</p>
    <ul>
      <li><b>⚠ Pendências:</b> equipamentos com informação faltando.</li>
      <li><b>🔧 Manutenção:</b> em preventiva ou corretiva.</li>
      <li><b>👤 Sem operador:</b> equipamentos sem operador, inclusive os que estão em manutenção.</li>
    </ul>`,
  },
  equipamento: {
    title: '🧰 Como preencher um equipamento',
    html: `<ol>
      <li><b>Situação:</b> toque em <b>Operacional</b>, <b>Preventiva</b> ou <b>Corretiva</b>.</li>
      <li><b>Operador:</b> sempre informe <b>Com</b> ou <b>Sem operador</b>, mesmo que o equipamento esteja em manutenção. Ao colocar em manutenção, o app pede essa confirmação de novo.</li>
      <li><b>Nome do operador:</b> aparece quando é “Com operador” e sai no relatório.</li>
      <li><b>Detalhes</b> (toque para abrir):
        <ul>
          <li><b>Substituição:</b> TAG do equipamento que este está substituindo.</li>
          <li><b>Apoio:</b> equipe atendida. Equipamentos dedicados mostram 🔒 e pedem confirmação para trocar.</li>
          <li><b>Observações:</b> saem no relatório como “(OBS: …)”.</li>
        </ul>
      </li>
      <li><b>✏️</b> libera a edição da TAG; <b>🗑</b> exclui o equipamento (pede confirmação).</li>
      <li>A <b>cor da borda</b> e a etiqueta no topo do card mostram o status: verde = operando, amarelo = sem operador/sinaleiro, laranja = preventiva, vermelho = corretiva.</li>
      <li>Toque no título da seção para <b>recolher/expandir</b>.</li>
    </ol>`,
  },
  caminhoes: {
    title: '🚚 Caminhões',
    html: `<ul>
      <li>Os caminhões <b>dedicados</b> a uma equipe aparecem primeiro; os <b>ADM</b> aparecem por último.</li>
      <li><b>1JA405 - ADM</b> e <b>1JA406 - ADM</b>:
        <ul>
          <li><b>Segunda a sexta:</b> aparecem automaticamente em todos os turnos.</li>
          <li><b>Sábado e domingo, turnos B e D (noite):</b> ficam ocultos. Para incluir, toque em “+ Incluir 1JA405/1JA406 - ADM neste turno”. A inclusão vale só para aquela data e turno.</li>
          <li>Para retirar um ADM incluído manualmente, toque na etiqueta <b>Manual ✕</b> do card (o equipamento não é excluído).</li>
        </ul>
      </li>
      <li>Equipe dedicada (🔒) vem preenchida; trocar pede confirmação e fica destacado em laranja.</li>
    </ul>`,
    more: 'equipamento',
  },
  guindastes: {
    title: '🏗️ Guindastes',
    html: `<ul>
      <li>Além do operador, informe o <b>sinaleiro</b> (com/sem). Sem sinaleiro deixa o guindaste amarelo e aparece no resumo.</li>
      <li>No relatório, cada guindaste sai em linhas separadas: equipamento, apoio, operador e sinaleiro.</li>
    </ul>`,
    more: 'equipamento',
  },
  empilhadeiras: {
    title: '🏭 Empilhadeiras',
    html: `<ul>
      <li><b>Somente 1JA371 e 1JA375 são Operação Vale.</b> Elas têm o selo azul <b>🏷 OPERAÇÃO VALE</b>, e mudar isso pede confirmação.</li>
      <li>As demais <b>não</b> aceitam Operação Vale e <b>exigem o nome do operador</b> quando estão “Com operador”.</li>
    </ul>`,
    more: 'equipamento',
  },
  carretas: { title: '🚛 Carretas', html: '<p>Preencha situação e operador de cada carreta.</p>', more: 'equipamento' },
  guindauto: { title: '🔧 Guindauto Sky Munck', html: '<p>Preencha situação e operador do Sky Munck.</p>', more: 'equipamento' },
  envio: {
    title: '📤 Gerar e enviar o relatório',
    html: `<ol>
      <li>Se aparecer <b>⚠ pendências</b>, toque nele para ir direto ao equipamento que falta preencher.</li>
      <li><b>📋 Gerar e salvar:</b> monta o texto e grava no <b>Histórico</b> (1 por data + turno; gerar de novo atualiza o do mesmo turno).</li>
      <li><b>📄 Copiar:</b> copia o texto para colar no WhatsApp.</li>
      <li>Ordem do relatório: <b>Caminhões → Guindastes → Empilhadeiras → Carretas → Sky Munck</b>, seguido da legenda e do <b>Resumo Operacional</b>.</li>
      <li>No resumo, equipamentos em manutenção sem operador aparecem como “SEM OPERADOR”, e a falta de operador mostra se o equipamento está em manutenção.</li>
    </ol>`,
  },
  sync: {
    title: '☁️ Sincronização',
    html: `<ul>
      <li><b>Sincronizado:</b> todos os aparelhos veem as mesmas informações.</li>
      <li><b>Salvando…:</b> enviando sua última alteração.</li>
      <li><b>Offline:</b> sem internet. O que você fizer fica salvo no aparelho e é enviado quando a conexão voltar.</li>
    </ul>`,
  },
  historico: {
    title: '📚 Histórico',
    html: `<ul>
      <li>Cada relatório gerado fica salvo por <b>data e turno</b>.</li>
      <li><b>Busca:</b> digite uma TAG (ex.: 1JA377), nome de operador ou equipe.</li>
      <li><b>Período</b> e <b>turno</b> filtram a lista e a análise.</li>
      <li>Cada relatório mostra as <b>mudanças em relação ao relatório anterior</b> (ex.: Operando → Corretiva).</li>
      <li><b>Ver texto</b> abre o relatório completo; <b>Copiar</b> copia o texto dele.</li>
    </ul>`,
  },
  insights: {
    title: '💡 Análise do período',
    html: `<ul>
      <li><b>Disponibilidade média:</b> percentual de equipamentos fora de manutenção nos relatórios do período.</li>
      <li><b>Em manutenção no último relatório:</b> há quantos dias e turnos seguidos cada um está parado.</li>
      <li><b>Mais tempo em manutenção:</b> equipamentos que mais aparecem em preventiva/corretiva.</li>
      <li><b>Mais faltas de operador</b> e <b>instáveis</b> (que trocam muito de status).</li>
    </ul>`,
  },
  timeline: {
    title: '🕒 Linha do tempo',
    html: `<p>Aparece quando você busca uma TAG. Cada quadradinho é um relatório, do mais antigo (esquerda) para o mais novo (direita). Toque ou passe o mouse sobre ele para ver data, turno e operador.</p>`,
  },
  backup: {
    title: '💾 Exportar / Importar',
    html: `<ul>
      <li><b>Exportar</b> baixa uma cópia de todo o histórico (arquivo .json).</li>
      <li><b>Importar</b> carrega um arquivo exportado e envia para todos os aparelhos. Relatórios da mesma data e turno não são duplicados.</li>
    </ul>`,
  },
  login: {
    title: '🔑 Entrar no app',
    html: `<ul>
      <li>Digite o <b>usuário</b> e a <b>senha</b> que o administrador passou para você.</li>
      <li>No <b>primeiro acesso</b>, o app pede para você criar uma senha só sua.</li>
      <li>Esqueceu a senha? Peça ao administrador uma <b>nova senha provisória</b>.</li>
      <li>Depois de entrar, o aparelho continua conectado até você tocar em <b>👤 → Sair</b>.</li>
    </ul>`,
  },
  senha: {
    title: '🔐 Minha conta',
    html: `<ul>
      <li>Toque em <b>👤</b> no topo para ver quem está conectado.</li>
      <li><b>Alterar senha:</b> informe a senha atual e a nova (mínimo de 6 caracteres).</li>
      <li><b>Sair:</b> desconecta este aparelho. Use em celulares compartilhados.</li>
      <li>Cada relatório salvo registra <b>quem gerou</b> (aparece no Histórico).</li>
    </ul>`,
  },
  admin: {
    title: '🛡️ Criar usuários',
    html: `<ol>
      <li>Preencha o <b>nome</b> e o <b>usuário</b> (login, sem espaços, ex.: <i>joao.silva</i>).</li>
      <li>A <b>senha provisória</b> já vem gerada (🎲 gera outra). Você também pode digitar uma.</li>
      <li>Escolha o <b>perfil</b>: <b>Usuário</b> usa o app; <b>Administrador</b> também gerencia usuários.</li>
      <li>Toque em <b>Criar usuário</b> e use <b>📄 Copiar dados de acesso</b> para mandar pelo WhatsApp.</li>
      <li>No primeiro acesso, a pessoa é obrigada a trocar a senha provisória.</li>
    </ol>`,
  },
  usuarios: {
    title: '👥 Gerenciar usuários',
    html: `<ul>
      <li><b>🔑 Nova senha:</b> define uma senha provisória (para quem esqueceu a senha).</li>
      <li><b>⛔ Desativar:</b> bloqueia o acesso na hora, sem apagar o cadastro. <b>✅ Ativar</b> libera de novo.</li>
      <li><b>⭐ Tornar admin / 👤 Tornar usuário:</b> muda o perfil.</li>
      <li><b>🗑 Excluir:</b> remove o acesso definitivamente.</li>
      <li>“<b>Aguardando 1º acesso</b>” indica que a pessoa ainda não trocou a senha provisória.</li>
      <li>A conta <b>admin</b> principal não pode ser desativada nem excluída.</li>
    </ul>`,
  },
  metricas: {
    title: '📊 Métricas',
    html: `<ul>
      <li>Escolha o <b>mês</b> e, se quiser, um <b>turno</b>.</li>
      <li>Os cartões mostram a média de equipamentos por status em cada relatório e a disponibilidade do mês.</li>
      <li>O gráfico empilha, por relatório: operando, sem operador, preventiva e corretiva. A tabela traz os números de cada dia.</li>
    </ul>`,
  },
};

function openHelp(key) {
  const dlg = $('helpDialog');
  if (key === 'guia') {
    $('helpTitle').textContent = '❓ Como usar o app';
    const order = ['login', 'senha', 'cabecalho', 'painel', 'filtro', 'equipamento', 'caminhoes', 'guindastes', 'empilhadeiras', 'envio', 'sync', 'historico', 'insights', 'timeline', 'backup', 'metricas'];
    if (window.CURRENT_USER?.role === 'admin') order.push('admin', 'usuarios');
    $('helpBody').innerHTML = `<p class="muted">Toque em um tópico para ver os detalhes. Em todo o app, o botão <span class="info-btn inline">i</span> explica a parte em que está.</p>
      <div class="help-topics">${order.map(k => `<button class="help-topic" data-goto="${k}">${HELP[k].title}</button>`).join('')}</div>`;
  } else {
    const h = HELP[key];
    if (!h) return;
    $('helpTitle').textContent = h.title;
    $('helpBody').innerHTML = h.html
      + (h.more ? `<button class="help-topic" data-goto="${h.more}">${HELP[h.more].title} →</button>` : '')
      + `<button class="help-link" data-goto="guia">← Todos os tópicos</button>`;
  }
  if (!dlg.open) dlg.showModal();
  $('helpBody').scrollTop = 0;
}

function setupEvents() {
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => showView(t.dataset.view)));

  document.querySelectorAll('.add-btn').forEach(b => b.addEventListener('click', () => addEquipment(b.dataset.add)));
  $('addAdm405Btn').addEventListener('click', () => addAdm('1JA405 - ADM'));
  $('addAdm406Btn').addEventListener('click', () => addAdm('1JA406 - ADM'));

  // Ajuda (botões ⓘ, inclusive os criados dinamicamente)
  document.addEventListener('click', ev => {
    const h = ev.target.closest('[data-help]');
    if (!h) return;
    ev.stopPropagation();
    openHelp(h.dataset.help);
  }, true);
  $('helpClose').addEventListener('click', () => $('helpDialog').close());
  $('helpDialog').addEventListener('click', ev => { if (ev.target === $('helpDialog')) $('helpDialog').close(); });
  $('helpBody').addEventListener('click', ev => {
    const link = ev.target.closest('[data-goto]');
    if (link) openHelp(link.dataset.goto);
  });

  // Recolher/expandir seções
  document.querySelectorAll('.equip-section .section-head').forEach(head => head.addEventListener('click', () => {
    const type = head.closest('.equip-section').dataset.type;
    const set = new Set(getCollapsed());
    set.has(type) ? set.delete(type) : set.add(type);
    writeJSON(COLLAPSE_KEY, [...set]);
    head.closest('.equip-section').classList.toggle('collapsed', set.has(type));
  }));

  // Filtro rápido e pendências
  $('reportFilterChips').addEventListener('click', ev => {
    const b = ev.target.closest('.chip');
    if (b) setReportFilter(b.dataset.filter);
  });
  $('pendingBtn').addEventListener('click', goToFirstPending);

  // Cabeçalho
  $('reportDate').addEventListener('change', () => {
    if ($('reportDate').value) $('weekdaySelect').value = weekdayOf($('reportDate').value);
    renderAll(); // dia da semana muda a regra dos ADM
    scheduleSharedSave();
  });
  $('weekdaySelect').addEventListener('change', () => { renderAll(); scheduleSharedSave(); });
  $('shiftSelect').addEventListener('change', () => { renderAll(); scheduleSharedSave(); });

  $('generateBtn').addEventListener('click', async () => {
    if (!validateBeforeGenerate()) return;
    const report = buildReport();
    $('output').textContent = report;
    $('outputCard').classList.remove('hidden');
    $('outputCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    const ok = await saveCurrentReport(report);
    toast(ok ? `Relatório do turno ${currentShift()} salvo no histórico.` : 'Salvo neste aparelho. Será enviado quando houver conexão.', ok ? 'success' : 'info');
  });
  $('copyBtn').addEventListener('click', () => {
    const issues = allIssues();
    if (issues.length) toast(`Atenção: ${issues.map(x => `${x.e.tag} – ${x.msg}`).join('; ')}`, 'error');
    copyText(buildReport());
  });

  // Histórico
  let searchTimer;
  $('historySearch').addEventListener('input', ev => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { historyFilter.query = ev.target.value; renderHistory(); }, 200);
  });
  $('historyPeriod').addEventListener('change', ev => { historyFilter.period = ev.target.value; renderHistory(); });
  setupChips('historyShiftChips', s => { historyFilter.shift = s; renderHistory(); });

  $('exportHistoryBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(HISTORY, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `historico-xcmg-${todayISO()}.json` });
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });
  $('importHistoryInput').addEventListener('change', ev => {
    const file = ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const arr = JSON.parse(reader.result);
        if (!Array.isArray(arr)) throw new Error('formato');
        const imported = mergeHistory(arr);
        HISTORY = mergeHistory(imported, HISTORY);
        persistLocalHistory();
        for (const item of imported) await saveHistoryRemote(item);
        renderHistory();
        toast(`${imported.length} relatório(s) importado(s).`, 'success');
      } catch {
        toast('Arquivo inválido.', 'error');
      } finally {
        ev.target.value = '';
      }
    };
    reader.readAsText(file);
  });

  // Métricas
  $('metricsMonth').value = metricsFilter.month;
  $('metricsMonth').addEventListener('change', ev => { metricsFilter.month = ev.target.value || todayISO().slice(0, 7); renderMetrics(); });
  setupChips('metricsShiftChips', s => { metricsFilter.shift = s; renderMetrics(); });

  window.addEventListener('online', () => {
    if (!firebaseDb) return; // sem login: a sincronização começa ao entrar
    setSyncStatus('connecting'); initSharedSync(); flushPendingEvents(); flushPendingHistory();
  });
  window.addEventListener('offline', () => setSyncStatus('offline'));
}

// ── Inicialização ────────────────────────────────────────────────────────────
// Roda depois que todos os scripts (inclusive auth.js) foram carregados
document.addEventListener('DOMContentLoaded', function init() {
  setupTheme();
  setupInstall();
  const today = todayISO();
  $('reportDate').value = today;
  $('weekdaySelect').value = weekdayOf(today);
  loadSavedData();
  loadLocalHistory();
  persistLocalHistory();
  try { localStorage.removeItem(LEGACY_HISTORY_KEY); } catch {} // migrado para o novo formato
  setupEvents();
  renderAll();
  initAuth(); // auth.js: login → startDataSync()
});
