// Função utilitária para extrair métricas de um relatório
function extractMetricsFromReport(reportText) {
  const E_R = String.fromCodePoint(0x1F534);
  const E_Y = String.fromCodePoint(0x1F7E1);
  const E_G = String.fromCodePoint(0x1F7E2);
  let operacionais = 0, preventiva = 0, corretiva = 0, semOperador = 0;

  const lines = reportText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Ignora linhas do Resumo Operacional (começam com dígito ou são cabeçalho)
    if (/^\d/.test(line.trim())) continue;

    const hasTag   = /1JA/.test(line);
    const isRedLine = line.startsWith(E_R);
    const isYellowLine = line.startsWith(E_Y);
    const isGreenLine  = line.startsWith(E_G);

    // Para carretas/caminhões/guindauto/empilhadeiras: status + tag + operador na mesma linha
    if (hasTag) {
      if (isRedLine) {
        if (line.includes('MANUTENÇÃO PREVENTIVA')) preventiva++;
        else if (line.includes('MANUTENÇÃO CORRETIVA')) corretiva++;
        else operacionais++; // vermelho por outro motivo (ex: substituindo)
      } else if (isYellowLine) {
        if (line.includes('SEM OPERADOR')) semOperador++;
        else operacionais++;
      } else if (isGreenLine) {
        operacionais++;
      }
      continue;
    }

    // Para guindastes: linha do operador vem separada (sem tag), começa com emoji
    if (!hasTag && (isRedLine || isYellowLine)) {
      if (isRedLine) {
        if (line.includes('MANUTENÇÃO PREVENTIVA')) preventiva++;
        else if (line.includes('MANUTENÇÃO CORRETIVA')) corretiva++;
      } else if (isYellowLine && line.includes('SEM OPERADOR')) {
        semOperador++;
      }
    }
  }

  return { operacionais, preventiva, corretiva, semOperador };
}

// Estado do filtro de turno nas métricas
let _metricsShiftFilter = 'all';

// Busca histórico do Firebase e renderiza gráfico/tabela
async function renderMetrics(shiftFilter) {
  if (shiftFilter !== undefined) _metricsShiftFilter = shiftFilter;
  const activeShift = _metricsShiftFilter || 'all';

  // Atualiza visual dos botões
  document.querySelectorAll('.shift-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.shift === activeShift);
  });

  const chartEl = document.getElementById('metricsChart');
  const tableWrapper = document.getElementById('metricsTableWrapper');
  // Buscar últimos relatórios do mês atual (ou usar histórico local)
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  let data = [];
  if (!firebaseDb) {
    data = getHistory().map(item => ({
      date: new Date(item.date || item.dateLabel),
      content: item.content
    }));
  } else {
    try {
      const snap = await firebaseDb.collection('relatorio_history')
        .orderBy('savedAt', 'asc')
        .get();
      snap.forEach(doc => {
        const d = doc.data();
        if (d.content && d.savedAt && d.savedAt.toDate) {
          const date = d.savedAt.toDate();
          if (date >= firstDay && date <= lastDay) {
            data.push({ date, content: d.content });
          }
        }
      });
    } catch (err) {
      console.error('Erro ao carregar métricas do Firebase:', err);
      data = getHistory().map(item => ({
        date: new Date(item.date || item.dateLabel),
        content: item.content
      }));
    }
  }
  // Agrupar por dia – cada relatório fica na sua própria entrada (1 por turno)
  // Chave: dia + turno para manter separados
  const daily = {};
  data.forEach(item => {
    const shift = extractShiftFromReport(item.content) || '?';
    const day = item.date.toISOString().slice(0, 10);
    const key = `${day}_${shift}`;
    daily[key] = { day, shift, content: item.content };
  });
  // Calcular métricas por entrada
  let metrics = Object.values(daily)
    .sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : a.shift.localeCompare(b.shift))
    .map(entry => {
      const m = extractMetricsFromReport(entry.content);
      return { day: entry.day, shift: entry.shift, ...m };
    });

  // Aplicar filtro de turno
  if (activeShift !== 'all') {
    metrics = metrics.filter(m => m.shift === activeShift);
  }
  if (!metrics.length) {
    chartEl.style.display = 'none';
    tableWrapper.innerHTML = '<p style="color:#e8edf7">Nenhum relatório disponível para este mês.</p>';
    return;
  }
  chartEl.style.display = '';
  // Gráfico
  if (window.metricsChartInstance) window.metricsChartInstance.destroy();
  window.metricsChartInstance = new Chart(chartEl, {
    type: 'bar',
    data: {
      labels: metrics.map(m => m.day.slice(8, 10) + '/' + m.day.slice(5, 7) + (activeShift === 'all' ? ` (${m.shift})` : '')),
      datasets: [
        { label: 'Operacionais',  data: metrics.map(m => m.operacionais), backgroundColor: 'rgba(34,197,94,0.7)',  borderColor: '#22c55e', borderWidth: 2 },
        { label: 'Preventiva',    data: metrics.map(m => m.preventiva),   backgroundColor: 'rgba(234,179,8,0.7)',  borderColor: '#eab308', borderWidth: 2 },
        { label: 'Corretiva',     data: metrics.map(m => m.corretiva),    backgroundColor: 'rgba(239,68,68,0.7)',  borderColor: '#ef4444', borderWidth: 2 },
        { label: 'Sem Operador',  data: metrics.map(m => m.semOperador),  backgroundColor: 'rgba(148,163,184,0.6)', borderColor: '#94a3b8', borderWidth: 2 },
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--text').trim() } },
        title: { display: true, text: 'Equipamentos por status (por dia)', color: getComputedStyle(document.documentElement).getPropertyValue('--text').trim() },
        tooltip: { mode: 'index', intersect: false }
      },
      scales: {
        x: { stacked: false, ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text').trim() }, grid: { color: getComputedStyle(document.documentElement).getPropertyValue('--border').trim() } },
        y: { beginAtZero: true, ticks: { stepSize: 1, color: getComputedStyle(document.documentElement).getPropertyValue('--text').trim() }, grid: { color: getComputedStyle(document.documentElement).getPropertyValue('--border').trim() } }
      }
    }
  });
  // Tabela detalhada
  let html = '<table class="metrics-table"><thead><tr><th>Data</th><th>🗃️ Turno</th><th>🟢 Operacionais</th><th>🟡 Preventiva</th><th>🔴 Corretiva</th><th>⚪ Sem Operador</th></tr></thead><tbody>';
  metrics.forEach(m => {
    html += `<tr><td>${m.day.split('-').reverse().join('/')}</td><td>${m.shift || '-'}</td><td>${m.operacionais}</td><td>${m.preventiva}</td><td>${m.corretiva}</td><td>${m.semOperador}</td></tr>`;
  });
  html += '</tbody></table>';
  tableWrapper.innerHTML = html;
}
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

// Equipamentos ADM: só visíveis (ativos) nos turnos A e C
const ADM_TAGS = ['1JA405 - ADM', '1JA406 - ADM'];
function isAdmShift() {
  const s = document.getElementById('shiftSelect')?.value || '';
  return s === 'A' || s === 'C';
}
// Retorna a equipe dedicada a um equipamento, verificando a TAG própria
// e também a TAG que ele está substituindo (campo sub).
function getDedicatedTeam(equip) {
  return DEDICATED_SUPPORT_TEAMS[(equip.tag || '').trim()]
      || DEDICATED_SUPPORT_TEAMS[(equip.sub || '').trim()]
      || '';
}

const DEDICATED_SUPPORT_TEAMS = {
  '1JA343': 'GPA/TRUCKLESS PREVENTIVA',
  '1JA347': 'ESCAVAÇÃO',
  '1JA377': 'VULCANIZAÇÃO',
  '1JA537': 'SOTREQ',
  '1JA360': 'ELETRICA',
  '1JA410': 'PERFURAÇÃO',
};
const PENDING_EVENTS_KEY = 'pendingEquipmentEvents';
const PENDING_HISTORY_KEY = 'pendingHistoryItems';
const DATA_STORAGE_KEY   = 'xcmgEquipmentData';

let firebaseDb = null;
let firebaseReady = false;
let _saveTimer = null;

// ── SINCRONIZAÇÃO EM TEMPO REAL ──────────────────────────────────────────────
const SHARED_DOC = 'current_state/live';
let _syncTimer = null;
let _applyingRemoteUpdate = false;
let _unsubscribeSharedState = null;

function getFormFields() {
  return {
    reportDate:    document.getElementById('reportDate')?.value    || '',
    shiftSelect:   document.getElementById('shiftSelect')?.value   || '',
    weekdaySelect: document.getElementById('weekdaySelect')?.value || '',
  };
}

function applyFormFields(form) {
  if (!form) return;
  const rd = document.getElementById('reportDate');
  const ss = document.getElementById('shiftSelect');
  const ws = document.getElementById('weekdaySelect');
  if (form.reportDate    && rd) rd.value = form.reportDate;
  if (form.shiftSelect   && ss) ss.value = form.shiftSelect;
  if (form.weekdaySelect && ws) ws.value = form.weekdaySelect;
}

function applySharedState(d) {
  if (!d) return;
  const KEYS = ['guindastes', 'carretas', 'caminhoes', 'guindauto', 'empilhadeiras'];
  let anyEquip = false;
  KEYS.forEach(k => {
    if (Array.isArray(d[k]) && d[k].length > 0) { DATA[k] = d[k]; anyEquip = true; }
  });
  if (anyEquip) renderAll();
  if (d.form) {
    applyFormFields(d.form);
    renderAll(); // Reaplica classe adm-inactive com o turno atualizado
  }
}

function setSyncStatus(state) {
  // state: 'connecting' | 'synced' | 'syncing' | 'offline' | 'error'
  const dot   = document.getElementById('syncDot');
  const label = document.getElementById('syncLabel');
  if (!dot || !label) return;
  const map = {
    connecting: { color: 'var(--muted)',   text: 'Conectando...' },
    synced:     { color: 'var(--green)',   text: '● Sincronizado' },
    syncing:    { color: 'var(--yellow)',  text: '↑ Sincronizando...' },
    offline:    { color: 'var(--muted)',   text: 'Sem conexão' },
    error:      { color: 'var(--red)',     text: '✕ Erro de sync' },
  };
  const s = map[state] || map.connecting;
  dot.style.background = s.color;
  label.style.color    = s.color;
  label.textContent    = s.text;
}

function scheduleSharedStateSave() {
  if (_applyingRemoteUpdate) return;
  clearTimeout(_syncTimer);
  setSyncStatus('syncing');
  _syncTimer = setTimeout(pushSharedState, 1500);
}

async function pushSharedState() {
  if (!firebaseDb) { setSyncStatus('offline'); return; }
  try {
    await firebaseDb.doc(SHARED_DOC).set({
      guindastes:    DATA.guindastes,
      carretas:      DATA.carretas,
      caminhoes:     DATA.caminhoes,
      guindauto:     DATA.guindauto,
      empilhadeiras: DATA.empilhadeiras,
      form: getFormFields(),
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
    });
    setSyncStatus('synced');
  } catch (err) {
    console.error('Erro ao sincronizar com Firebase:', err);
    setSyncStatus('error');
  }
}

function subscribeSharedState() {
  if (!firebaseDb || _unsubscribeSharedState) return;
  _unsubscribeSharedState = firebaseDb.doc(SHARED_DOC).onSnapshot(snap => {
    // Ignora eventos de escrita local (otimista) para evitar loop
    if (!snap.exists || snap.metadata.hasPendingWrites) return;
    _applyingRemoteUpdate = true;
    applySharedState(snap.data());
    _applyingRemoteUpdate = false;
    setSyncStatus('synced');
  }, err => {
    console.error('Erro no listener do Firebase:', err);
    setSyncStatus('error');
  });
}

async function initSharedSync() {
  if (!firebaseDb) { setSyncStatus('offline'); return; }
  setSyncStatus('connecting');
  // 1. Carrega estado atual (único para todos os dispositivos)
  try {
    const snap = await firebaseDb.doc(SHARED_DOC).get();
    if (snap.exists) {
      _applyingRemoteUpdate = true;
      applySharedState(snap.data());
      _applyingRemoteUpdate = false;
    } else {
      // Primeiro uso: publica o estado local como estado inicial compartilhado
      await pushSharedState();
    }
    setSyncStatus('synced');
  } catch (err) {
    console.error('Erro ao carregar estado inicial do Firebase:', err);
    setSyncStatus('error');
  }
  // 2. Escuta mudanças em tempo real
  subscribeSharedState();
}

function saveData() {
  localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify(DATA));
}

function scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveData, 400);
  scheduleSharedStateSave();
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
    { tag: '1JA268', status: E_GREEN, operator: 'COM OPERADOR', sub: '' },
    { tag: '1JA273', status: E_GREEN, operator: 'COM OPERADOR', sub: '' },
  ],
  caminhoes: [
    { tag: '1JA340', status: E_GREEN, operator: 'COM OPERADOR', sub: '1JA343', supportTeam: 'ESTERIL' },
    { tag: '1JA366', status: E_GREEN, operator: 'COM OPERADOR', sub: '1JA347', supportTeam: 'ESCAVAÇÃO' },
    { tag: '1JA406 - ADM', status: E_GREEN, operator: 'COM OPERADOR', sub: '1JA537', supportTeam: 'SOTREQ', onlyShifts: ['A', 'C'] },
    { tag: '1JA377', status: E_RED,   operator: 'MANUTENÇÃO CORRETIVA', sub: '', supportTeam: 'VULCANIZAÇÃO' },
    { tag: '1JA410', status: E_GREEN, operator: 'COM OPERADOR', sub: '', supportTeam: 'PERFURAÇÃO' },
    { tag: '1JA360', status: E_GREEN, operator: 'COM OPERADOR', sub: '', supportTeam: 'GPA/TRUCKLESS PREVENTIVA' },
    { tag: '1JA378', status: E_RED,   operator: 'MANUTENÇÃO PREVENTIVA', sub: '' },
    { tag: '1JA342', status: E_GREEN, operator: 'COM OPERADOR', sub: '', supportTeam: 'GPA/TRUCKLESS PREVENTIVA' },
    { tag: '1JA405 - ADM', status: E_GREEN, operator: 'COM OPERADOR', sub: '1JA348', supportTeam: 'MATERIAIS', onlyShifts: ['A', 'C'] },
    { tag: '1JA536', status: E_GREEN, operator: 'COM OPERADOR', sub: '', supportTeam: 'TRAKSHIFT' },
    { tag: '1JA339', status: E_RED,   operator: 'MANUTENÇÃO CORRETIVA', sub: '' },
  ],
  guindauto: [
    { tag: '1JA416', status: E_RED, operator: 'MANUTENÇÃO CORRETIVA', sub: '' },
  ],
  empilhadeiras: [
    { tag: '1JA369 (16t)', status: E_GREEN, operator: 'OPERAÇÃO VALE',      sub: '' },
    { tag: '1JA373 (16t)', status: E_GREEN, operator: 'COM OPERADOR',       sub: '' },
    { tag: '1JA371 (16t)', status: E_GREEN, operator: 'OPERAÇÃO VALE',      sub: '' },
    { tag: '1JA374 (7t)',  status: E_GREEN, operator: 'COM OPERADOR',       sub: '' },
    { tag: '1JA375 (10t)', status: E_RED,   operator: 'MANUTENÇÃO CORRETIVA', sub: '' },
    { tag: '1JA376 (10t)', status: E_GREEN, operator: 'COM OPERADOR',       sub: '' },
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
  // ── TEMA CLARO/ESCURO ──────────────────────────────────
  const html = document.documentElement;
  const themeBtn = document.getElementById('themeToggleBtn');
  const savedTheme = localStorage.getItem('xcmg-theme') || 'dark';
  html.dataset.theme = savedTheme;
  if (themeBtn) themeBtn.textContent = savedTheme === 'dark' ? '☀️' : '🌙';

  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const next = html.dataset.theme === 'dark' ? 'light' : 'dark';
      html.dataset.theme = next;
      localStorage.setItem('xcmg-theme', next);
      themeBtn.textContent = next === 'dark' ? '☀️' : '🌙';
      // Recarrega gráfico se estiver visível
      const metricsSec = document.getElementById('metricsSection');
      if (metricsSec && metricsSec.style.display !== 'none') renderMetrics();
    });
  }

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

function normalizeTag(tag) {
  return String(tag || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function isDuplicateTag(tag, currentEquip = null) {
  const normalized = normalizeTag(tag);
  if (!normalized) return false;

  const groups = ['guindastes', 'carretas', 'caminhoes', 'guindauto', 'empilhadeiras'];
  return groups.some(group =>
    (DATA[group] || []).some(e => e !== currentEquip && normalizeTag(e.tag) === normalized)
  );
}

function createTagField(equip, statusField = 'status') {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'equip-tag-input';
  input.value = equip.tag;
  input.addEventListener('change', () => {
    const nextTag = input.value.trim();
    const previousTag = equip.tag;

    if (!nextTag) {
      input.value = previousTag || '';
      return;
    }

    if (normalizeTag(nextTag) !== normalizeTag(previousTag) && isDuplicateTag(nextTag, equip)) {
      window.alert(`A TAG ${nextTag} ja existe na lista. Escolha outra TAG.`);
      input.value = previousTag || '';
      return;
    }

    equip.tag = nextTag;
    input.value = nextTag;
    scheduleSave();
  });
  updateTagEditState(input, equip[statusField] === E_RED);
  return input;
}

function createSupportTeamField(equip) {
  const dedicatedTeam = getDedicatedTeam(equip);
  const dedicatedSource = DEDICATED_SUPPORT_TEAMS[(equip.sub || '').trim()] && !DEDICATED_SUPPORT_TEAMS[(equip.tag || '').trim()]
    ? (equip.sub || '').trim()
    : (equip.tag || '').trim();
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
    const sourceLabel = dedicatedSource !== (equip.tag || '').trim()
      ? `${dedicatedSource} (substituído)`
      : dedicatedSource;
    badge.textContent = `🔒 Dedicado: ${dedicatedTeam} — ${sourceLabel}`;
    badge.title = `Equipe dedicada fixa do equipamento ${dedicatedSource}`;
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
    firebaseReady = true;
    flushPendingEvents();
    flushPendingHistoryItems();
    initSharedSync();
  } catch (err) {
    console.error('Falha ao inicializar Firebase:', err);
    firebaseDb = null;
    firebaseReady = false;
  }
}

function flushPendingHistoryItems() {
  if (!firebaseDb) return;
  const pending = getPendingHistoryItems();
  if (!pending.length) return;
  const remaining = [];
  pending.forEach(item => {
    saveHistoryToFirebase(item).catch(() => remaining.push(item));
  });
  savePendingHistoryItems(remaining);
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

function getPendingHistoryItems() {
  return JSON.parse(localStorage.getItem(PENDING_HISTORY_KEY) || '[]');
}

function savePendingHistoryItems(items) {
  localStorage.setItem(PENDING_HISTORY_KEY, JSON.stringify(items));
}

function queuePendingHistoryItem(item) {
  const items = getPendingHistoryItems();
  items.push(item);
  savePendingHistoryItems(items);
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
    statusEl.style.color = 'var(--red)';
    statusEl.textContent = '⚠️ Firebase não conectado. Verifique as credenciais.';
    return;
  }

  btn.disabled     = true;
  btn.textContent  = '⏳ Publicando...';
  statusEl.textContent = '';

  try {
    // Força publicação imediata do estado compartilhado (sem debounce)
    clearTimeout(_syncTimer);
    await pushSharedState();

    // Também salva snapshot histórico
    await firebaseDb.collection('equipment_snapshots').add({
      savedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      clientSavedAt: new Date().toISOString(),
      guindastes:    DATA.guindastes,
      carretas:      DATA.carretas,
      caminhoes:     DATA.caminhoes,
      guindauto:     DATA.guindauto,
      empilhadeiras: DATA.empilhadeiras,
    });

    btn.textContent      = '✅ Publicado!';
    statusEl.style.color = 'var(--green)';
    statusEl.textContent = `Sincronizado com todos os dispositivos em ${new Date().toLocaleString()}`;
  } catch (err) {
    console.error('Erro ao publicar estado:', err);
    btn.textContent      = '☁️ Publicar para todos';
    statusEl.style.color = 'var(--red)';
    statusEl.textContent = '❌ Falha ao publicar. Tente novamente.';
  } finally {
    btn.disabled = false;
    setTimeout(() => {
      if (btn.textContent === '✅ Publicado!') btn.textContent = '☁️ Publicar para todos';
      statusEl.textContent = '';
    }, 4000);
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

// Quando o botão principal de status muda: amarelo → SEM OPERADOR, vermelho → pergunta tipo
function handleMainStatusChange(next, equip, getOpSel, refresh, release) {
  if (next === E_GREEN) {
    equip.operator = 'COM OPERADOR';
    equip.operatorStatus = E_GREEN;
    const sel = getOpSel();
    if (sel) sel.value = 'COM OPERADOR';
    refresh();
    release(200);
  } else if (next === E_YELLOW) {
    equip.operator = 'SEM OPERADOR';
    equip.operatorStatus = E_YELLOW;
    const sel = getOpSel();
    if (sel) sel.value = 'SEM OPERADOR';
    refresh();
    release(200);
  } else if (next === E_RED) {
    // Adia o confirm para o próximo tick, evitando passthrough de touch
    setTimeout(() => {
      const isPreventiva = window.confirm(
        'Qual tipo de manutenção?\n\nOK → MANUTENÇÃO PREVENTIVA\nCancelar → MANUTENÇÃO CORRETIVA'
      );
      const tipo = isPreventiva ? 'MANUTENÇÃO PREVENTIVA' : 'MANUTENÇÃO CORRETIVA';
      equip.operator = tipo;
      equip.operatorStatus = E_RED;
      const sel = getOpSel();
      if (sel) sel.value = tipo;
      refresh();
      // 400ms de buffer após o confirm fechar para absorver ghost touches
      release(400);
    }, 50);
    // release será chamado dentro do setTimeout acima
  }
}

function makeStatusBtn(equip, field, onChange) {
  const btn = document.createElement('button');
  btn.className = 'status-btn';
  btn.title = 'Clique para alterar';
  btn.type = 'button';
  syncStatusButton(btn, equip[field]);
  // busy e release são por-botão (closure) — sem estado global compartilhado
  let busy = false;
  const release = (delay = 150) => setTimeout(() => { busy = false; }, delay);
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault(); // evita ghost click / duplo disparo em touch
  });
  btn.addEventListener('click', () => {
    if (busy) return;
    busy = true;
    const idx = STATUS_CYCLE.indexOf(equip[field]);
    const next = STATUS_CYCLE[(idx < 0 ? 0 : idx + 1) % STATUS_CYCLE.length];
    equip[field] = next;
    syncStatusButton(btn, next);
    if (onChange) {
      onChange(next, release);
    } else {
      release();
    }
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

    let opSel;
    const equipBtn = makeStatusBtn(equip, 'status', (next, release) => {
      handleMainStatusChange(next, equip, () => opSel, refreshVisualState, release);
    });
    const subInput = document.createElement('input');
    subInput.type        = 'text';
    subInput.className   = 'equip-sub-input';
    subInput.placeholder = '↔ Substitui (ex: 1JA339)';
    subInput.value       = equip.sub || '';
    subInput.title       = 'Preencha se este equipamento está substituindo outra tag em manutenção';
    subInput.addEventListener('input', () => {
      equip.sub = subInput.value.trim();
      const old = card.querySelector('.equip-support-wrapper');
      if (old) card.replaceChild(createSupportTeamField(equip), old);
      scheduleSave();
    });
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
    opBtn = makeStatusBtn(equip, 'operatorStatus', (_, release) => { refreshVisualState(); release(); });
    opBtn.classList.add('status-btn-sm');
    opSel = buildSelect(OP_OPTIONS, equip.operator, v => {
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
    sigBtn = makeStatusBtn(equip, 'signalerStatus', (_, release) => { refreshVisualState(); release(); });
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

  let opSel;
  const btn = makeStatusBtn(equip, 'status', (next, release) => {
    handleMainStatusChange(next, equip, () => opSel, refreshVisualState, release);
  });
  row.appendChild(btn);
  row.appendChild(tagInput);

  if (equip.operator !== undefined) {
    opSel = buildSelect(OP_OPTIONS, equip.operator, v => {
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
  subInput.addEventListener('input', () => {
    equip.sub = subInput.value.trim();
    const old = row.querySelector('.equip-support-wrapper');
    if (old) row.replaceChild(createSupportTeamField(equip), old);
    scheduleSave();
  });
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

function renderSection(listId, items, type, filterFn, postRenderFn, sortFn) {
  const container = document.getElementById(listId);
  container.innerHTML = '';
  let display = items.filter((_, i) => !filterFn || filterFn(items[i]));
  if (sortFn) display = [...display].sort(sortFn);
  display.forEach(item => {
    const handleDelete = () => {
      const label = item.tag ? ` o equipamento ${item.tag}` : ' este equipamento';
      const confirmed = window.confirm(`Deseja realmente excluir${label}?`);
      if (!confirmed) return;
      logEquipmentEvent('deleted', type, item);
      const realIdx = items.indexOf(item);
      if (realIdx !== -1) items.splice(realIdx, 1);
      renderAll();
    };
    const el = renderRow(item, type, handleDelete);
    if (postRenderFn) postRenderFn(el, item);
    container.appendChild(el);
  });
}

function setSectionCount(titleId, count) {
  const h2 = document.getElementById(titleId);
  if (!h2) return;
  let badge = h2.querySelector('.section-count');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'section-count';
    h2.appendChild(badge);
  }
  badge.textContent = count;
}

function renderAll() {
  saveData();
  const shift = document.getElementById('shiftSelect')?.value || '';
  const admShift = shift === 'A' || shift === 'C';

  renderSection('list-guindastes',    DATA.guindastes,    'guindastes');
  setSectionCount('title-guindastes', DATA.guindastes.length);

  renderSection('list-carretas',      DATA.carretas,      'carretas');
  setSectionCount('title-carretas', DATA.carretas.length);

  // Ordenação: dedicados primeiro, ADM por último
  const caminhoesSort = (a, b) => {
    const aAdm = ADM_TAGS.includes((a.tag || '').trim());
    const bAdm = ADM_TAGS.includes((b.tag || '').trim());
    const aDed = !!getDedicatedTeam(a);
    const bDed = !!getDedicatedTeam(b);
    if (aAdm !== bAdm) return aAdm ? 1 : -1;  // ADM vai para o fim
    if (aDed !== bDed) return aDed ? -1 : 1;  // Dedicado vai para o início
    return 0;
  };

  const caminhoesFilter = c => !c.onlyShifts || c.onlyShifts.includes(shift);
  renderSection('list-caminhoes',     DATA.caminhoes,     'caminhoes',
    caminhoesFilter,
    (el, item) => {
      if (ADM_TAGS.includes((item.tag || '').trim()) && !admShift && !item.sub) {
        el.classList.add('adm-inactive');
      }
    },
    caminhoesSort);
  setSectionCount('title-caminhoes', DATA.caminhoes.filter(caminhoesFilter).length);

  renderSection('list-guindauto',     DATA.guindauto,     'guindauto');
  setSectionCount('title-guindauto', DATA.guindauto.length);

  renderSection('list-empilhadeiras', DATA.empilhadeiras, 'empilhadeiras');
  setSectionCount('title-empilhadeiras', DATA.empilhadeiras.length);

  updateAdmButtons();
}

// ── Construção do texto do relatório ───────────────────────────────────────────

const REPORT_TYPE_LABELS = {
  guindastes: {
    preventive:   ['guindaste em preventiva', 'guindastes em preventiva'],
    corrective:   ['guindaste em corretiva',  'guindastes em corretiva'],
    noOperator:   ['guindaste', 'guindastes'],
    operational:  ['guindaste operacional', 'guindastes operacionais'],
  },
  carretas: {
    preventive:   ['carreta em preventiva',  'carretas em preventiva'],
    corrective:   ['carreta em corretiva',   'carretas em corretiva'],
    noOperator:   ['carreta', 'carretas'],
    operational:  ['carreta operacional', 'carretas operacionais'],
  },
  caminhoes: {
    preventive:   ['caminhão em preventiva', 'caminhões em preventiva'],
    corrective:   ['caminhão em corretiva',  'caminhões em corretiva'],
    noOperator:   ['caminhão', 'caminhões'],
    operational:  ['caminhão operacional', 'caminhões operacionais'],
  },
  guindauto: {
    preventive:   ['Sky Munck em preventiva', 'Sky Munck em preventiva'],
    corrective:   ['Sky Munck em corretiva',  'Sky Munck em corretiva'],
    noOperator:   ['Sky Munck', 'Sky Munck'],
    operational:  ['Sky Munck operacional', 'Sky Munck operacionais'],
  },
  empilhadeiras: {
    preventive:   ['empilhadeira em preventiva', 'empilhadeiras em preventiva'],
    corrective:   ['empilhadeira em corretiva',  'empilhadeiras em corretiva'],
    noOperator:   ['empilhadeira', 'empilhadeiras'],
    operational:  ['empilhadeira operacional', 'empilhadeiras operacionais'],
  },
};

function buildOperationalSummary() {
  const lines = [];
  const OP_OK = ['COM OPERADOR', 'OPERAÇÃO VALE'];
  const shift = document.getElementById('shiftSelect')?.value || '';

  const sections = [
    ['guindastes',    DATA.guindastes],
    ['carretas',      DATA.carretas],
    ['caminhoes',     DATA.caminhoes.filter(c => !c.onlyShifts || c.onlyShifts.includes(shift))],
    ['guindauto',     DATA.guindauto],
    ['empilhadeiras', DATA.empilhadeiras],
  ];

  for (const [type, items] of sections) {
    if (!items.length) continue;
    const labels     = REPORT_TYPE_LABELS[type];
    const preventive = items.filter(i => i.operator === 'MANUTENÇÃO PREVENTIVA');
    const corrective = items.filter(i => i.operator === 'MANUTENÇÃO CORRETIVA');
    const noOperator = items.filter(i => i.operator === 'SEM OPERADOR');
    const operational= items.filter(i => OP_OK.includes(i.operator));

    const formatTags = list => `(${list.map(i => i.tag).join(' - ')})`;
    const n1 = n => n > 1 ? 1 : 0;

    if (operational.length) {
      lines.push(`${operational.length} ${labels.operational[n1(operational.length)]} ${formatTags(operational)}`);
    }
    if (preventive.length) {
      lines.push(`${preventive.length} ${labels.preventive[n1(preventive.length)]} ${formatTags(preventive)}`);
    }
    if (corrective.length) {
      lines.push(`${corrective.length} ${labels.corrective[n1(corrective.length)]} ${formatTags(corrective)}`);
    }
    if (noOperator.length) {
      lines.push(`${noOperator.length} ${noOperator.length > 1 ? 'operadores a menos de' : 'operador a menos de'} ${labels.noOperator[n1(noOperator.length)]} ${formatTags(noOperator)}`);
    }
  }

  if (!lines.length) {
    lines.push('Nenhum equipamento registrado.');
  }

  return `\n*Resumo Operacional*\n${lines.join('\n')}`;
}

function buildReport() {
  const date  = formatDate(document.getElementById('reportDate').value);
  const shift = document.getElementById('shiftSelect').value;
  const day   = document.getElementById('weekdaySelect').value;

  // Ordena por status: verde → amarelo → vermelho
  const STATUS_ORDER = { [E_GREEN]: 0, [E_YELLOW]: 1, [E_RED]: 2 };
  const byStatus = (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);

  let t = `*Status XCMG MINA ${date}*\n\nTURNO ${shift}\n\n${day}\n\n`;

  // Guindastes
  t += `\n*Posicionamento dos Guindastes*\n`;
  [...DATA.guindastes].sort(byStatus).forEach(e => {
    t += `${e.status} ${e.tag}${e.sub ? ' SUB ' + E_RED + e.sub : ''}\n`;
    if (e.supportTeam) t += `- APOIO ${e.supportTeam}\n`;
    t += `${e.operatorStatus} ${e.operator}\n`;
    t += `${e.signalerStatus} ${e.signaler}\n\n`;
  });

  // Carretas
  t += `*Status das Carretas – Mina*\n\n`;
  [...DATA.carretas].sort(byStatus).forEach(e => {
    t += `${e.status} ${e.tag}${e.sub ? ' SUB ' + E_RED + e.sub : ''} ${e.operator}${e.supportTeam ? ' - APOIO ' + e.supportTeam : ''}\n`;
  });

  // Caminhões
  t += `\n*Status dos Caminhões – Mina / Turno*\n`;
  [...DATA.caminhoes].filter(e => !e.onlyShifts || e.onlyShifts.includes(shift)).sort(byStatus).forEach(e => {
    t += `${e.status} ${e.tag}${e.sub ? ' SUB ' + E_RED + e.sub : ''} ${e.operator}${e.supportTeam ? ' - APOIO ' + e.supportTeam : ''}\n`;
  });

  // Guindauto
  t += `\n*Guindauto Sky Munck*\n`;
  [...DATA.guindauto].sort(byStatus).forEach(e => {
    t += `${e.status} ${e.tag}${e.sub ? ' SUB ' + E_RED + e.sub : ''} ${(e.operator || '')}${e.supportTeam ? ' - APOIO ' + e.supportTeam : ''}`.trimEnd() + `\n`;
  });

  // Empilhadeiras
  t += `\n*Status das Empilhadeiras*\n`;
  [...DATA.empilhadeiras].sort(byStatus).forEach(e => {
    t += `${e.status} ${e.tag}${e.sub ? ' SUB ' + E_RED + e.sub : ''} ${e.operator}${e.supportTeam ? ' - APOIO ' + e.supportTeam : ''}\n`;
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

// Extrai a letra do turno do texto do relatório (linha "TURNO X")
function extractShiftFromReport(content) {
  const m = (content || '').match(/TURNO\s+([A-D])/i);
  return m ? m[1].toUpperCase() : null;
}

// Adiciona ou sobrescreve entrada do histórico (1 por turno)
// overwrite=true substitui a entrada existente do mesmo turno
function addToHistory(report, overwrite) {
  const arr = getHistory();
  const shift = extractShiftFromReport(report);
  const existingIdx = shift ? arr.findIndex(i => extractShiftFromReport(i.content) === shift) : -1;

  if (existingIdx !== -1 && !overwrite) return; // já existe, não substituir sem confirmação

  const item = {
    dateLabel: new Date().toLocaleString(),
    date: new Date().toISOString(),
    content: report
  };

  if (existingIdx !== -1) {
    arr.splice(existingIdx, 1); // remove a entrada antiga do mesmo turno
  }
  arr.unshift(item);
  saveHistory(arr);
  saveHistoryToFirebase(item);
}

// Gera um ID único baseado no conteúdo do relatório
function reportDocId(item) {
  // Usa a primeira linha do relatório (data/turno) como chave única
  const key = (item.content || '').split('\n').find(l => l.trim()) || item.date;
  return key.replace(/[^a-zA-Z0-9À-ÿ_\-]/g, '_').slice(0, 100);
}

// Salva um item de histórico no Firebase (sem duplicatas via ID)
async function saveHistoryToFirebase(item) {
  if (!firebaseDb) {
    queuePendingHistoryItem(item);
    return;
  }
  try {
    const docId = reportDocId(item);
    await firebaseDb.collection('relatorio_history').doc(docId).set({
      ...item,
      savedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      clientCreatedAt: item.date || new Date().toISOString(),
    }, { merge: false });
  } catch (err) {
    console.error('Erro ao salvar histórico no Firebase:', err);
    queuePendingHistoryItem(item);
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
    const dateLabel = item.dateLabel || item.date || 'Data desconhecida';
    li.innerHTML = `<b style='color:#222'>${dateLabel}</b><br><pre style='white-space:pre-wrap;font-size:13px;background:#fff;color:#222;padding:8px;border-radius:4px;border:1px solid #e0e0e0;'>${item.content.replace(/</g,'&lt;')}</pre>`;
    list.appendChild(li);
  });
}

// ── Eventos ────────────────────────────────────────────────────────────────────

// Controla visibilidade dos botões ADM e impede duplicatas
function updateAdmButtons() {
  const adm = isAdmShift();
  ADM_TAGS.forEach(tag => {
    const id = tag === '1JA405 - ADM' ? 'addAdm405Btn' : 'addAdm406Btn';
    const btn = document.getElementById(id);
    if (!btn) return;
    const alreadyInList = isDuplicateTag(tag);
    btn.style.display = (adm && !alreadyInList) ? '' : 'none';
  });
}

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

// Botões ADM – adicionam equipamento fixo se não estiver na lista
['1JA405 - ADM', '1JA406 - ADM'].forEach(tag => {
  const id = tag === '1JA405 - ADM' ? 'addAdm405Btn' : 'addAdm406Btn';
  document.getElementById(id)?.addEventListener('click', () => {
    if (isDuplicateTag(tag)) {
      window.alert(`A TAG ${tag} ja existe na lista.`);
      return;
    }
    const item = { tag, status: E_GREEN, operator: 'COM OPERADOR', sub: '' };
    DATA.caminhoes.push(item);
    logEquipmentEvent('added', 'caminhoes', item);
    renderAll();
  });
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

  const arr = getHistory();
  const shift = extractShiftFromReport(report);
  const existing = shift ? arr.find(i => extractShiftFromReport(i.content) === shift) : null;

  const statusEl = document.getElementById('saveFirebaseStatus');
  function showStatus(color, msg) {
    if (!statusEl) return;
    statusEl.style.color = color;
    statusEl.textContent = msg;
    setTimeout(() => { statusEl.textContent = ''; }, 4000);
  }

  if (existing && existing.content === report) {
    showStatus('#eab308', '⚠️ Relatório idêntico ao do Turno ' + shift + ' já salvo. Nenhuma alteração.');
  } else if (existing) {
    const confirm = window.confirm(
      `Já existe um relatório salvo para o Turno ${shift} (gerado em ${existing.dateLabel}).\n\nDeseja sobrescrever com o relatório atual?`
    );
    if (confirm) {
      addToHistory(report, true);
      showStatus('#22c55e', '✅ Relatório do Turno ' + shift + ' sobrescrito com sucesso.');
    } else {
      showStatus('#eab308', '⚠️ Relatório do Turno ' + shift + ' mantido sem alteração.');
    }
  } else {
    addToHistory(report, false);
    showStatus('#22c55e', '✅ Relatório do Turno ' + (shift || '?') + ' salvo no histórico.');
  }

  renderHistory();
});
// Botão para alternar aba de histórico

// Alternar aba de histórico
document.getElementById('toggleHistoryBtn').addEventListener('click', () => {
  const historySec = document.getElementById('historySection');
  const metricsSec = document.getElementById('metricsSection');
  if (historySec.style.display === 'none') {
    historySec.style.display = '';
    metricsSec.style.display = 'none';
    renderHistory();
  } else {
    historySec.style.display = 'none';
  }
});

// Alternar aba de métricas
document.getElementById('toggleMetricsBtn').addEventListener('click', () => {
  const historySec = document.getElementById('historySection');
  const metricsSec = document.getElementById('metricsSection');
  if (metricsSec.style.display === 'none') {
    metricsSec.style.display = '';
    historySec.style.display = 'none';
    renderMetrics();
  } else {
    metricsSec.style.display = 'none';
  }
});

// Filtros de turno nas métricas
document.querySelectorAll('.shift-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => renderMetrics(btn.dataset.shift));
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

  // Sincroniza cabeçalho com Firebase ao mudar
  ['reportDate', 'shiftSelect', 'weekdaySelect'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => scheduleSharedStateSave());
  });

  // Ao mudar turno: re-renderiza caminhões (ativa/desativa ADM) e atualiza botões
  document.getElementById('shiftSelect')?.addEventListener('change', () => renderAll());
})();

// ── Init ───────────────────────────────────────────────────────────────────────

initFirebase();
flushPendingEvents();
window.addEventListener('online', () => {
  setSyncStatus('connecting');
  flushPendingEvents();
  initSharedSync();
});
window.addEventListener('offline', () => setSyncStatus('offline'));
loadSavedData();
renderAll();

document.getElementById('saveFirebaseBtn').addEventListener('click', saveSnapshotToFirebase);
