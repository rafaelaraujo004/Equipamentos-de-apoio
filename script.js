// ── Dados dos equipamentos ─────────────────────────────────────────────────────

// DATA inicializado após definição dos emojis (ver abaixo após carregamento)
let DATA;

// ── Emojis definidos via código para evitar problemas de encoding ─────────────────

const E_GREEN  = String.fromCodePoint(0x1F7E2); // 🟢
const E_YELLOW = String.fromCodePoint(0x1F7E1); // 🟡
const E_RED    = String.fromCodePoint(0x1F534); // 🔴

// ── Opções dos selects ──────────────────────────────────────────────────────────

const STATUS_CYCLE  = [E_GREEN, E_YELLOW, E_RED];
const OP_OPTIONS    = ['COM OPERADOR', 'SEM OPERADOR', 'OPERAÇÃO VALE', 'MANUTENÇÃO CORRETIVA', 'MANUTENÇÃO PREVENTIVA'];
const SIG_OPTIONS   = ['COM SINALEIRO', 'SEM SINALEIRO'];
const DEDICATED_SUPPORT_TEAMS = {
  '1JA343': 'GPA/TRUCKLESS PREVENTIVA',
  '1JA347': 'ESCAVAÇÃO',
  '1JA377': 'VULCANIZAÇÃO',
  '1JA537': 'SOTREQ',
  '1JA360': 'ELETRICA',
  '1JA410': 'PERFURAÇÃO',
};
const PENDING_EVENTS_KEY = 'pendingEquipmentEvents';
const DATA_STORAGE_KEY   = 'xcmgEquipmentData';

let firebaseDb = null;
let _saveTimer = null;

function saveData() {
  localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify(DATA));
}

function scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveData, 400);
}

function loadSavedData() {
  try {
    const saved = localStorage.getItem(DATA_STORAGE_KEY);
    if (!saved) return;
    const parsed = JSON.parse(saved);
    if (parsed && typeof parsed === 'object') {
      ['guindastes', 'carretas', 'caminhoes', 'guindauto', 'empilhadeiras'].forEach(key => {
        if (Array.isArray(parsed[key]) && parsed[key].length > 0) DATA[key] = parsed[key];
      });
    }
  } catch (e) {
    console.warn('Falha ao carregar dados salvos:', e);
  }
}

// ── Dados dos equipamentos (usa constantes de emoji) ─────────────────────────────

DATA = {
  guindastes: [
    { tag: '1JA230 (70t)*',  status: E_GREEN, operatorStatus: E_GREEN,  operator: 'COM OPERADOR', signalerStatus: E_GREEN, signaler: 'COM SINALEIRO', sub: '' },
    { tag: '1JA226 (110t)*', status: E_GREEN, operatorStatus: E_GREEN,  operator: 'COM OPERADOR', signalerStatus: E_GREEN, signaler: 'COM SINALEIRO', sub: '' },
    { tag: '1JA218 (250t)',  status: E_GREEN, operatorStatus: E_GREEN,  operator: 'COM OPERADOR', signalerStatus: E_GREEN, signaler: 'COM SINALEIRO', sub: '' },
    { tag: '1JA241 (250t)*', status: E_GREEN, operatorStatus: E_GREEN,  operator: 'COM OPERADOR', signalerStatus: E_GREEN, signaler: 'COM SINALEIRO', sub: '' },
    { tag: '1JA221 (110t)*', status: E_GREEN, operatorStatus: E_GREEN,  operator: 'COM OPERADOR', signalerStatus: E_GREEN, signaler: 'COM SINALEIRO', sub: '' },
  ],
  carretas: [
    { tag: '1JA268', status: E_GREEN,  operator: 'COM OPERADOR', sub: '' },
    { tag: '1JA273', status: E_GREEN,  operator: 'COM OPERADOR', sub: '' },
    { tag: '1JA259', status: E_GREEN,  operator: 'COM OPERADOR', sub: '' },
  ],
  caminhoes: [
    { tag: '1JA343', status: E_YELLOW, operator: 'SEM OPERADOR', sub: '' },
    { tag: '1JA347', status: E_GREEN,  operator: 'COM OPERADOR', sub: '' },
    { tag: '1JA537', status: E_GREEN,  operator: 'COM OPERADOR', sub: '' },
    { tag: '1JA377', status: E_GREEN,  operator: 'COM OPERADOR', sub: '' },
    { tag: '1JA410', status: E_GREEN,  operator: 'COM OPERADOR', sub: '' },
    { tag: '1JA360', status: E_GREEN,  operator: 'COM OPERADOR', sub: '' },
    { tag: '1JA378', status: E_GREEN,  operator: 'SEM OPERADOR', sub: '' },
    { tag: '1JA562', status: E_GREEN,  operator: 'COM OPERADOR', sub: '' },
    { tag: '1JA348', status: E_RED,    operator: 'COM OPERADOR', sub: '' },
    { tag: '1JA536', status: E_RED,    operator: 'COM OPERADOR', sub: '' },
    { tag: '1JA339', status: E_RED,    operator: 'MANUTENÇÃO CORRETIVA', sub: '' },
  ],
  guindauto: [
    { tag: '1JA416', status: E_RED, operator: 'COM OPERADOR', sub: '' },
  ],
  empilhadeiras: [
    { tag: '1JA369 (16t)', status: E_GREEN, operator: 'OPERAÇÃO VALE', sub: '' },
    { tag: '1JA373 (16t)',  status: E_GREEN, operator: 'COM OPERADOR',  sub: '' },
    { tag: '1JA371 (16t)', status: E_GREEN, operator: 'OPERAÇÃO VALE', sub: '' },
    { tag: '1JA374 (7t)',  status: E_GREEN, operator: 'COM OPERADOR',  sub: '' },
    { tag: '1JA375 (10t)', status: E_RED,   operator: 'OPERAÇÃO VALE', sub: '' },
    { tag: '1JA376 (10t)', status: E_GREEN, operator: 'COM OPERADOR',  sub: '' },
  ],
};

// ── Auxiliares ─────────────────────────────────────────────────────────────────

// Banner de instalação do app (PWA)
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById('installBanner').style.display = 'block';
});

// Registrar o service worker para PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const banner = document.getElementById('installBanner');
  const installBtn = document.getElementById('installBtn');
  const closeBtn = document.getElementById('closeInstallBanner');
  if (installBtn) {
    installBtn.onclick = async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          banner.style.display = 'none';
        }
        deferredPrompt = null;
      }
    };
  }
  if (closeBtn) {
    closeBtn.onclick = () => {
      banner.style.display = 'none';
    };
  }
});

function buildSelect(options, current, onChange) {
  const sel = document.createElement('select');
  options.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt;
    o.textContent = opt;
    if (opt === current) o.selected = true;
    sel.appendChild(o);
  });
  sel.addEventListener('change', () => onChange(sel.value));
  return sel;
}

function formatDate(val) {
  if (!val) return '--/--/----';
  const [y, m, d] = val.split('-');
  return `${d}/${m}/${y}`;
}

function updateTagEditState(input, isEditable) {
  input.readOnly = !isEditable;
  input.classList.toggle('editable', isEditable);
  input.title = isEditable
    ? 'Edite a TAG enquanto o equipamento estiver em manutenção'
    : 'A TAG só pode ser editada quando o equipamento estiver em vermelho';
}

function createTagField(equip, statusField = 'status') {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'equip-tag-input';
  input.value = equip.tag;
  input.addEventListener('input', () => { equip.tag = input.value.trim() || equip.tag; scheduleSave(); });
  updateTagEditState(input, equip[statusField] === E_RED);
  return input;
}

function createSupportTeamField(equip) {
  const dedicatedTeam = DEDICATED_SUPPORT_TEAMS[equip.tag] || '';
  if (!equip.supportTeam && dedicatedTeam) {
    equip.supportTeam = dedicatedTeam;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'equip-support-wrapper';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'equip-support-input';
  input.placeholder = 'Equipe para a qual esse equipamento dara apoio';
  input.value = equip.supportTeam || '';
  input.title = dedicatedTeam
    ? `Equipamento dedicado a ${dedicatedTeam}`
    : 'Informe a equipe que recebera apoio deste equipamento';

  if (dedicatedTeam) {
    input.classList.add('has-dedicated-team');
    if (equip.supportTeam && equip.supportTeam !== dedicatedTeam) {
      input.classList.add('support-team-diverged');
    }
  }

  input.addEventListener('change', () => {
    const nextValue = input.value.trim();
    if (dedicatedTeam && nextValue && nextValue !== dedicatedTeam) {
      const confirmed = window.confirm(
        `Autorizacao necessaria.\n\nO equipamento ${equip.tag} e dedicado a equipe ${dedicatedTeam}.\n\nDeseja realmente destina-lo para ${nextValue}?`
      );

      if (!confirmed) {
        input.value = equip.supportTeam || dedicatedTeam;
        return;
      }
    }

    equip.supportTeam = nextValue;
    if (dedicatedTeam) {
      input.classList.toggle('support-team-diverged', !!nextValue && nextValue !== dedicatedTeam);
    }
    scheduleSave();
  });

  wrapper.appendChild(input);

  if (dedicatedTeam) {
    const badge = document.createElement('span');
    badge.className = 'equip-support-badge';
    badge.textContent = `🔒 Dedicado: ${dedicatedTeam}`;
    badge.title = `Equipe dedicada fixa do equipamento ${equip.tag}`;
    wrapper.appendChild(badge);
  }

  return wrapper;
}

function getStatusFromOperator(value) {
  if (value === 'MANUTENÇÃO CORRETIVA' || value === 'MANUTENÇÃO PREVENTIVA') return E_RED;
  if (value === 'SEM OPERADOR' || value === 'SEM SINALEIRO') return E_YELLOW;
  return E_GREEN;
}

function hasFirebaseConfig(config) {
  if (!config || typeof config !== 'object') return false;
  const required = ['apiKey', 'authDomain', 'projectId', 'appId'];
  return required.every(k => typeof config[k] === 'string' && config[k].trim() !== '');
}

async function initFirebase() {
  if (!window.firebase) return;
  // Aceita tanto window.FIREBASE_CONFIG (template padrão) quanto
  // window.firebaseConfig (gerado automaticamente pelo console do Firebase)
  const config = window.FIREBASE_CONFIG || window.firebaseConfig;
  if (!hasFirebaseConfig(config)) return;

  try {
    const app = window.firebase.apps && window.firebase.apps.length
      ? window.firebase.app()
      : window.firebase.initializeApp(config);

    const auth = app.auth();
    if (!auth.currentUser) {
      await auth.signInAnonymously();
    }

    firebaseDb = app.firestore();
    flushPendingEvents();
  } catch (err) {
    console.error('Falha ao inicializar Firebase:', err);
    firebaseDb = null;
  }
}

function getPendingEvents() {
  return JSON.parse(localStorage.getItem(PENDING_EVENTS_KEY) || '[]');
}

function savePendingEvents(events) {
  localStorage.setItem(PENDING_EVENTS_KEY, JSON.stringify(events));
}

function queuePendingEvent(payload) {
  const events = getPendingEvents();
  events.push(payload);
  savePendingEvents(events);
}

function buildEventPayload(action, equipmentType, equip) {
  return {
    action,
    equipmentType,
    tag: equip.tag || '',
    status: equip.status || '',
    operator: equip.operator || '',
    sub: equip.sub || '',
    supportTeam: equip.supportTeam || '',
    clientCreatedAt: new Date().toISOString()
  };
}

async function sendEventToFirebase(payload) {
  if (!firebaseDb) return false;
  try {
    await firebaseDb.collection('equipment_events').add({
      ...payload,
      createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
    });
    return true;
  } catch (err) {
    console.error('Falha ao gravar evento no Firebase:', err);
    return false;
  }
}

async function flushPendingEvents() {
  const pending = getPendingEvents();
  if (!pending.length) return;

  const failed = [];
  for (const payload of pending) {
    const ok = await sendEventToFirebase(payload);
    if (!ok) failed.push(payload);
  }
  savePendingEvents(failed);
}

function logEquipmentEvent(action, equipmentType, equip) {
  const payload = buildEventPayload(action, equipmentType, equip);
  sendEventToFirebase(payload).then(ok => {
    if (!ok) queuePendingEvent(payload);
  });
}

async function saveSnapshotToFirebase() {
  const statusEl = document.getElementById('saveFirebaseStatus');
  const btn      = document.getElementById('saveFirebaseBtn');

  if (!firebaseDb) {
    statusEl.style.color = '#ef4444';
    statusEl.textContent = '⚠️ Firebase não conectado. Verifique as credenciais.';
    return;
  }

  btn.disabled     = true;
  btn.textContent  = '⏳ Salvando...';
  statusEl.textContent = '';

  const snapshot = {
    savedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
    clientSavedAt: new Date().toISOString(),
    guindastes:    DATA.guindastes,
    carretas:      DATA.carretas,
    caminhoes:     DATA.caminhoes,
    guindauto:     DATA.guindauto,
    empilhadeiras: DATA.empilhadeiras,
  };

  try {
    await firebaseDb.collection('equipment_snapshots').add(snapshot);
    btn.textContent      = '✅ Salvo!';
    statusEl.style.color = '#22c55e';
    statusEl.textContent = `Salvo em ${new Date().toLocaleString()}`;
  } catch (err) {
    console.error('Erro ao salvar snapshot:', err);
    btn.textContent      = '☁️ Salvar no Firebase';
    statusEl.style.color = '#ef4444';
    statusEl.textContent = '❌ Falha ao salvar. Tente novamente.';
  } finally {
    btn.disabled = false;
    setTimeout(() => {
      if (btn.textContent === '✅ Salvo!') btn.textContent = '☁️ Salvar no Firebase';
    }, 3000);
  }
}

function getEffectiveStatus(equip) {
  const states = [equip.status, equip.operatorStatus, equip.signalerStatus].filter(Boolean);
  if (states.includes(E_RED)) return E_RED;
  if (states.includes(E_YELLOW)) return E_YELLOW;
  return E_GREEN;
}

function applyCardStatusClass(element, status) {
  element.classList.remove('status-green', 'status-yellow', 'status-red');

  if (status === E_RED) element.classList.add('status-red');
  else if (status === E_YELLOW) element.classList.add('status-yellow');
  else element.classList.add('status-green');
}

function applyStatusBtnClass(button, status) {
  button.classList.remove('is-green', 'is-yellow', 'is-red');

  if (status === E_RED) button.classList.add('is-red');
  else if (status === E_YELLOW) button.classList.add('is-yellow');
  else button.classList.add('is-green');
}

function syncStatusButton(button, status) {
  button.textContent = status;
  applyStatusBtnClass(button, status);
}

// ── Renderização de uma linha de equipamento ────────────────────────────────────

function makeStatusBtn(equip, field, onChange) {
  const btn = document.createElement('button');
  btn.className = 'status-btn';
  btn.title = 'Clique para alterar';
  btn.type = 'button';
  syncStatusButton(btn, equip[field]);
  btn.addEventListener('click', () => {
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(equip[field]) + 1) % STATUS_CYCLE.length];
    equip[field] = next;
    syncStatusButton(btn, next);
    if (onChange) onChange(next);
  });
  return btn;
}

function renderRow(equip, type, onDelete) {
  // ── Guindastes: layout em 3 sub-linhas (equip / operador / sinaleiro) ──
  if (type === 'guindastes') {
    const card = document.createElement('div');
    card.className = 'guindaste-card';

    // Linha 1 — equipamento
    const line1 = document.createElement('div');
    line1.className = 'g-line g-line-primary';
    const tagInput = createTagField(equip, 'status');
    let opBtn;
    let sigBtn;

    const refreshVisualState = () => {
      syncStatusButton(equipBtn, equip.status);
      if (opBtn) syncStatusButton(opBtn, equip.operatorStatus);
      if (sigBtn) syncStatusButton(sigBtn, equip.signalerStatus);
      updateTagEditState(tagInput, equip.status === E_RED);
      applyCardStatusClass(card, getEffectiveStatus(equip));
      scheduleSave();
    };

    const equipBtn = makeStatusBtn(equip, 'status', refreshVisualState);
    const subInput = document.createElement('input');
    subInput.type        = 'text';
    subInput.className   = 'equip-sub-input';
    subInput.placeholder = '↔ Substitui (ex: 1JA339)';
    subInput.value       = equip.sub || '';
    subInput.title       = 'Preencha se este equipamento está substituindo outra tag em manutenção';
    subInput.addEventListener('input', () => { equip.sub = subInput.value.trim(); scheduleSave(); });
    line1.appendChild(equipBtn);
    line1.appendChild(tagInput);
    line1.appendChild(subInput);
    if (onDelete) {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'delete-btn';
      deleteBtn.title = 'Excluir equipamento';
      deleteBtn.textContent = '🗑';
      deleteBtn.addEventListener('click', onDelete);
      line1.appendChild(deleteBtn);
    }

    const supportInput = createSupportTeamField(equip);

    // Linha 2 — operador
    const line2 = document.createElement('div');
    line2.className = 'g-line';
    opBtn = makeStatusBtn(equip, 'operatorStatus', refreshVisualState);
    opBtn.classList.add('status-btn-sm');
    const opSel = buildSelect(OP_OPTIONS, equip.operator, v => {
      equip.operator = v;
      equip.operatorStatus = getStatusFromOperator(v);
      equip.status = getStatusFromOperator(v);
      refreshVisualState();
    });
    line2.appendChild(opBtn);
    line2.appendChild(opSel);

    // Linha 3 — sinaleiro
    const line3 = document.createElement('div');
    line3.className = 'g-line';
    sigBtn = makeStatusBtn(equip, 'signalerStatus', refreshVisualState);
    sigBtn.classList.add('status-btn-sm');
    const sigSel = buildSelect(SIG_OPTIONS, equip.signaler, v => {
      equip.signaler = v;
      equip.signalerStatus = getStatusFromOperator(v);
      refreshVisualState();
    });
    line3.appendChild(sigBtn);
    line3.appendChild(sigSel);

    card.appendChild(line1);
    card.appendChild(supportInput);
    card.appendChild(line2);
    card.appendChild(line3);
    refreshVisualState();
    return card;
  }

  // ── Demais equipamentos: linha única ──
  const row = document.createElement('div');
  let cls = 'equip-row';
  cls += ' no-signaler';
  row.className = cls;

  const tagInput = createTagField(equip, 'status');
  const refreshVisualState = () => {
    syncStatusButton(btn, equip.status);
    updateTagEditState(tagInput, equip.status === E_RED);
    applyCardStatusClass(row, getEffectiveStatus(equip));
    scheduleSave();
  };

  const btn = makeStatusBtn(equip, 'status', refreshVisualState);
  row.appendChild(btn);
  row.appendChild(tagInput);

  if (equip.operator !== undefined) {
    const opSel = buildSelect(OP_OPTIONS, equip.operator, v => {
      equip.operator = v;
      equip.status = getStatusFromOperator(v);
      refreshVisualState();
    });
    opSel.className = 'equip-operator';
    row.appendChild(opSel);
  }

  const subInput = document.createElement('input');
  subInput.type        = 'text';
  subInput.className   = 'equip-sub-input';
  subInput.placeholder = '↔ Substitui (ex: 1JA339)';
  subInput.value       = equip.sub || '';
  subInput.title       = 'Preencha se este equipamento está substituindo outra tag em manutenção';
  subInput.addEventListener('input', () => { equip.sub = subInput.value.trim(); scheduleSave(); });
  row.appendChild(subInput);

  const supportInput = createSupportTeamField(equip);
  row.appendChild(supportInput);

  if (onDelete) {
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete-btn';
    deleteBtn.title = 'Excluir equipamento';
    deleteBtn.textContent = '🗑';
    deleteBtn.addEventListener('click', onDelete);
    row.appendChild(deleteBtn);
  }

  refreshVisualState();
  return row;
}

function renderSection(listId, items, type) {
  const container = document.getElementById(listId);
  container.innerHTML = '';
  items.forEach((item, idx) => {
    const handleDelete = () => {
      const label = item.tag ? ` o equipamento ${item.tag}` : ' este equipamento';
      const confirmed = window.confirm(`Deseja realmente excluir${label}?`);
      if (!confirmed) return;
      logEquipmentEvent('deleted', type, item);
      items.splice(idx, 1);
      renderAll();
    };
    container.appendChild(renderRow(item, type, handleDelete));
  });
}

function renderAll() {
  saveData();
  renderSection('list-guindastes',    DATA.guindastes,    'guindastes');
  renderSection('list-carretas',      DATA.carretas,      'carretas');
  renderSection('list-caminhoes',     DATA.caminhoes,     'caminhoes');
  renderSection('list-guindauto',     DATA.guindauto,     'guindauto');
  renderSection('list-empilhadeiras', DATA.empilhadeiras, 'empilhadeiras');
}

// ── Construção do texto do relatório ───────────────────────────────────────────

const REPORT_TYPE_LABELS = {
  guindastes: {
    preventive: ['guindaste em preventiva', 'guindastes em preventiva'],
    corrective: ['guindaste em corretiva', 'guindastes em corretiva'],
    noOperator: ['guindaste', 'guindastes'],
  },
  carretas: {
    preventive: ['carreta em preventiva', 'carretas em preventiva'],
    corrective: ['carreta em corretiva', 'carretas em corretiva'],
    noOperator: ['carreta', 'carretas'],
  },
  caminhoes: {
    preventive: ['caminhão em preventiva', 'caminhões em preventiva'],
    corrective: ['caminhão em corretiva', 'caminhões em corretiva'],
    noOperator: ['caminhão', 'caminhões'],
  },
  guindauto: {
    preventive: ['munk em preventiva', 'munks em preventiva'],
    corrective: ['munk em corretiva', 'munks em corretiva'],
    noOperator: ['munk', 'munks'],
  },
  empilhadeiras: {
    preventive: ['empilhadeira em preventiva', 'empilhadeiras em preventiva'],
    corrective: ['empilhadeira em corretiva', 'empilhadeiras em corretiva'],
    noOperator: ['empilhadeira', 'empilhadeiras'],
  },
};

function buildOperationalSummary() {
  const lines = [];
  const sections = [
    ['guindastes', DATA.guindastes],
    ['carretas', DATA.carretas],
    ['caminhoes', DATA.caminhoes],
    ['guindauto', DATA.guindauto],
    ['empilhadeiras', DATA.empilhadeiras],
  ];

  for (const [type, items] of sections) {
    const labels = REPORT_TYPE_LABELS[type];
    const preventive = items.filter(item => item.operator === 'MANUTENÇÃO PREVENTIVA');
    const corrective = items.filter(item => item.operator === 'MANUTENÇÃO CORRETIVA');
    const noOperator = items.filter(item => item.operator === 'SEM OPERADOR');

    const formatTags = (list) => `(${list.map(item => item.tag).join(' - ')})`;

    if (preventive.length) {
      lines.push(
        `${preventive.length} ${labels.preventive[preventive.length > 1 ? 1 : 0]} ${formatTags(preventive)}`
      );
    }

    if (corrective.length) {
      lines.push(
        `${corrective.length} ${labels.corrective[corrective.length > 1 ? 1 : 0]} ${formatTags(corrective)}`
      );
    }

    if (noOperator.length) {
      lines.push(
        `${noOperator.length} ${noOperator.length > 1 ? 'operadores a menos de' : 'operador a menos de'} ${labels.noOperator[noOperator.length > 1 ? 1 : 0]} ${formatTags(noOperator)}`
      );
    }
  }

  if (!lines.length) {
    lines.push('Nenhum equipamento sem operador, em preventiva ou em corretiva.');
  }

  return `\n*Resumo Operacional*\n${lines.join('\n')}`;
}

function buildReport() {
  const date  = formatDate(document.getElementById('reportDate').value);
  const shift = document.getElementById('shiftSelect').value;
  const day   = document.getElementById('weekdaySelect').value;

  let t = `*Status XCMG MINA ${date}*\n\nTURNO ${shift}\n\n${day}\n\n`;

  // Guindastes
  t += `\n*Posicionamento dos Guindastes*\n`;
  DATA.guindastes.forEach(e => {
    t += `${e.status} ${e.tag}${e.sub ? ' SUB ' + E_RED + e.sub : ''}\n`;
    if (e.supportTeam) t += `APOIO ${e.supportTeam}\n`;
    t += `${e.operatorStatus} ${e.operator}\n`;
    t += `${e.signalerStatus} ${e.signaler}\n\n`;
  });

  // Carretas
  t += `*Status das Carretas – Mina*\n\n`;
  DATA.carretas.forEach(e => {
    t += `${e.status} ${e.tag}${e.sub ? ' SUB ' + E_RED + e.sub : ''} ${e.operator}${e.supportTeam ? ' APOIO ' + e.supportTeam : ''}\n`;
  });

  // Caminhões
  t += `\n*Status dos Caminhões – Mina / Turno*\n`;
  DATA.caminhoes.forEach(e => {
    t += `${e.status} ${e.tag}${e.sub ? ' SUB ' + E_RED + e.sub : ''} ${e.operator}${e.supportTeam ? ' APOIO ' + e.supportTeam : ''}\n`;
  });

  // Guindauto
  t += `\n*Guindauto Sky Munck*\n`;
  DATA.guindauto.forEach(e => {
    t += `${e.status} ${e.tag}${e.sub ? ' SUB ' + E_RED + e.sub : ''} ${(e.operator || '')}${e.supportTeam ? ' APOIO ' + e.supportTeam : ''}`.trimEnd() + `\n`;
  });

  // Empilhadeiras
  t += `\n*Status das Empilhadeiras*\n`;
  DATA.empilhadeiras.forEach(e => {
    t += `${e.status} ${e.tag}${e.sub ? ' SUB ' + E_RED + e.sub : ''} ${e.operator}${e.supportTeam ? ' APOIO ' + e.supportTeam : ''}\n`;
  });

  t += `\n*Legenda:*\n${E_GREEN} Com operador\n${E_YELLOW} Sem operador\n${E_RED} Manutenção Corretiva/preventiva`;
  t += `\n${buildOperationalSummary()}`;

  return t;
}

// ── Funções do histórico ──────────────────────────────────────────────────────
function getHistory() {
  return JSON.parse(localStorage.getItem('relatorioHistory') || '[]');
}
function saveHistory(arr) {
  localStorage.setItem('relatorioHistory', JSON.stringify(arr));
}
function addToHistory(report) {
  const arr = getHistory();
  const alreadyExists = arr.some(item => item.content === report);
  if (alreadyExists) return;
  arr.unshift({
    date: new Date().toLocaleString(),
    content: report
  });
  saveHistory(arr);
  saveHistoryToFirebase(arr[0]);
}

// Salva um item de histórico no Firebase
async function saveHistoryToFirebase(item) {
  if (!firebaseDb) return;
  try {
    await firebaseDb.collection('relatorio_history').add({
      ...item,
      savedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('Erro ao salvar histórico no Firebase:', err);
  }
}

function dedupeHistory(arr) {
  const seen = new Set();
  return arr.filter(item => {
    if (!item || typeof item.content !== 'string') return false;
    if (seen.has(item.content)) return false;
    seen.add(item.content);
    return true;
  });
}
function renderHistory() {
  const list = document.getElementById('historyList');
  if (!list) return;
  const arr = getHistory();
  list.innerHTML = '';
  if (arr.length === 0) {
    list.innerHTML = '<li style="color:#888">Nenhum relatório salvo ainda.</li>';
    return;
  }
  arr.forEach((item, idx) => {
    const li = document.createElement('li');
    li.style = 'border-bottom:1px solid #eee;padding:8px 0;';
    li.innerHTML = `<b style='color:#222'>${item.date}</b><br><pre style='white-space:pre-wrap;font-size:13px;background:#fff;color:#222;padding:8px;border-radius:4px;border:1px solid #e0e0e0;'>${item.content.replace(/</g,'&lt;')}</pre>`;
    list.appendChild(li);
  });
}

// ── Eventos ────────────────────────────────────────────────────────────────────
// Adicionar novos equipamentos
document.getElementById('addGuindasteBtn').addEventListener('click', () => {
  const item = { tag: '', status: E_GREEN, operatorStatus: E_GREEN, operator: 'COM OPERADOR', signalerStatus: E_GREEN, signaler: 'COM SINALEIRO', sub: '' };
  DATA.guindastes.push(item);
  logEquipmentEvent('added', 'guindastes', item);
  renderAll();
});
document.getElementById('addCarretaBtn').addEventListener('click', () => {
  const item = { tag: '', status: E_GREEN, operator: 'COM OPERADOR', sub: '' };
  DATA.carretas.push(item);
  logEquipmentEvent('added', 'carretas', item);
  renderAll();
});
document.getElementById('addCaminhaoBtn').addEventListener('click', () => {
  const item = { tag: '', status: E_GREEN, operator: 'COM OPERADOR', sub: '' };
  DATA.caminhoes.push(item);
  logEquipmentEvent('added', 'caminhoes', item);
  renderAll();
});
document.getElementById('addGuindautoBtn').addEventListener('click', () => {
  const item = { tag: '', status: E_GREEN, operator: 'COM OPERADOR', sub: '' };
  DATA.guindauto.push(item);
  logEquipmentEvent('added', 'guindauto', item);
  renderAll();
});
document.getElementById('addEmpilhadeiraBtn').addEventListener('click', () => {
  const item = { tag: '', status: E_GREEN, operator: 'COM OPERADOR', sub: '' };
  DATA.empilhadeiras.push(item);
  logEquipmentEvent('added', 'empilhadeiras', item);
  renderAll();
});
document.getElementById('generateBtn').addEventListener('click', () => {
  const out = document.getElementById('output');
  const report = buildReport();
  out.textContent = report;
  out.classList.remove('hidden');
  out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  addToHistory(report);
  renderHistory();
});
// Botão para alternar aba de histórico
document.getElementById('toggleHistoryBtn').addEventListener('click', () => {
  const sec = document.getElementById('historySection');
  if (sec.style.display === 'none') {
    sec.style.display = '';
    renderHistory();
  } else {
    sec.style.display = 'none';
  }
});

// Exportar histórico
document.getElementById('exportHistoryBtn').addEventListener('click', () => {
  const arr = getHistory();
  const blob = new Blob([JSON.stringify(arr, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'historico-relatorios.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// Importar histórico
document.getElementById('importHistoryInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      const arr = JSON.parse(ev.target.result);
      if (Array.isArray(arr)) {
        saveHistory(dedupeHistory(arr));
        renderHistory();
        alert('Histórico importado com sucesso!');
      } else {
        alert('Arquivo inválido.');
      }
    } catch {
      alert('Erro ao importar arquivo.');
    }
  };
  reader.readAsText(file);
});

document.getElementById('copyBtn').addEventListener('click', async () => {
  const btn = document.getElementById('copyBtn');
  await navigator.clipboard.writeText(buildReport());
  btn.textContent = '✅ Copiado!';
  setTimeout(() => { btn.textContent = '📄 Copiar'; }, 2500);
});


// ── Data padrão = hoje ─────────────────────────────────────────────────────────


(function setTodayDate() {
  const d   = new Date();
  const pad = n => String(n).padStart(2, '0');
  document.getElementById('reportDate').value =
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  // Dia da semana automático
  const days = ['DOMINGO','SEGUNDA-FEIRA','TERÇA-FEIRA','QUARTA-FEIRA',
                 'QUINTA-FEIRA','SEXTA-FEIRA','SÁBADO'];
  document.getElementById('weekdaySelect').value = days[d.getDay()];

  // Turno padrão sempre "C"
  document.getElementById('shiftSelect').value = 'C';
})();

// ── Init ───────────────────────────────────────────────────────────────────────

initFirebase();
flushPendingEvents();
window.addEventListener('online', flushPendingEvents);
loadSavedData();
renderAll();

document.getElementById('saveFirebaseBtn').addEventListener('click', saveSnapshotToFirebase);
