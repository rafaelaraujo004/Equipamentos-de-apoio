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
  ],
  guindauto: [
    { tag: '1JA416', status: E_RED },
  ],
  empilhadeiras: [
    { tag: '1JA369 (16t)', status: E_GREEN, operator: 'OPERAÇÃO VALE', sub: '' },
    { tag: 'JA373 (16t)',  status: E_GREEN, operator: 'COM OPERADOR',  sub: '' },
    { tag: '1JA371 (16t)', status: E_GREEN, operator: 'OPERAÇÃO VALE', sub: '' },
    { tag: '1JA374 (7t)',  status: E_GREEN, operator: 'COM OPERADOR',  sub: '' },
    { tag: '1JA375 (10t)', status: E_RED,   operator: 'OPERAÇÃO VALE', sub: '' },
    { tag: '1JA376 (10t)', status: E_GREEN, operator: 'COM OPERADOR',  sub: '' },
  ],
};

// ── Auxiliares ─────────────────────────────────────────────────────────────────

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

// ── Renderização de uma linha de equipamento ────────────────────────────────────

function makeStatusBtn(equip, field) {
  const btn = document.createElement('button');
  btn.className   = 'status-btn';
  btn.title       = 'Clique para alterar';
  btn.type        = 'button';
  btn.textContent = equip[field];
  btn.addEventListener('click', () => {
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(equip[field]) + 1) % STATUS_CYCLE.length];
    equip[field]    = next;
    btn.textContent = next;
  });
  return btn;
}

function renderRow(equip, type) {
  // ── Guindastes: layout em 3 sub-linhas (equip / operador / sinaleiro) ──
  if (type === 'guindastes') {
    const card = document.createElement('div');
    card.className = 'guindaste-card';

    // Linha 1 — equipamento
    const line1 = document.createElement('div');
    line1.className = 'g-line';
    const equipBtn = makeStatusBtn(equip, 'status');
    const nameSpan = document.createElement('span');
    nameSpan.className   = 'equip-name';
    nameSpan.textContent = equip.tag;
    const subInput = document.createElement('input');
    subInput.type        = 'text';
    subInput.className   = 'equip-sub-input';
    subInput.placeholder = '↔ Substitui (ex: 1JA339)';
    subInput.value       = equip.sub || '';
    subInput.title       = 'Preencha se este equipamento está substituindo outra tag em manutenção';
    subInput.addEventListener('input', () => { equip.sub = subInput.value.trim(); });
    line1.appendChild(equipBtn);
    line1.appendChild(nameSpan);
    line1.appendChild(subInput);

    // Linha 2 — operador
    const line2 = document.createElement('div');
    line2.className = 'g-line';
    const opBtn = makeStatusBtn(equip, 'operatorStatus');
    opBtn.classList.add('status-btn-sm');
    const opSel = buildSelect(OP_OPTIONS, equip.operator, v => { equip.operator = v; });
    line2.appendChild(opBtn);
    line2.appendChild(opSel);

    // Linha 3 — sinaleiro
    const line3 = document.createElement('div');
    line3.className = 'g-line';
    const sigBtn = makeStatusBtn(equip, 'signalerStatus');
    sigBtn.classList.add('status-btn-sm');
    const sigSel = buildSelect(SIG_OPTIONS, equip.signaler, v => { equip.signaler = v; });
    line3.appendChild(sigBtn);
    line3.appendChild(sigSel);

    card.appendChild(line1);
    card.appendChild(line2);
    card.appendChild(line3);
    return card;
  }

  // ── Demais equipamentos: linha única ──
  const row = document.createElement('div');
  let cls = 'equip-row';
  if (type === 'guindauto') cls += ' status-only';
  else                      cls += ' no-signaler';
  row.className = cls;

  const btn = makeStatusBtn(equip, 'status');
  const name = document.createElement('span');
  name.className   = 'equip-name';
  name.textContent = equip.tag;
  row.appendChild(btn);
  row.appendChild(name);

  if (equip.operator !== undefined) {
    const opSel = buildSelect(OP_OPTIONS, equip.operator, v => { equip.operator = v; });
    opSel.className = 'equip-operator';
    row.appendChild(opSel);
  }

  if (type !== 'guindauto') {
    const subInput = document.createElement('input');
    subInput.type        = 'text';
    subInput.className   = 'equip-sub-input';
    subInput.placeholder = '↔ Substitui (ex: 1JA339)';
    subInput.value       = equip.sub || '';
    subInput.title       = 'Preencha se este equipamento está substituindo outra tag em manutenção';
    subInput.addEventListener('input', () => { equip.sub = subInput.value.trim(); });
    row.appendChild(subInput);
  }

  return row;
}

function renderSection(listId, items, type) {
  const container = document.getElementById(listId);
  container.innerHTML = '';
  items.forEach(item => container.appendChild(renderRow(item, type)));
}

function renderAll() {
  renderSection('list-guindastes',    DATA.guindastes,    'guindastes');
  renderSection('list-carretas',      DATA.carretas,      'carretas');
  renderSection('list-caminhoes',     DATA.caminhoes,     'caminhoes');
  renderSection('list-guindauto',     DATA.guindauto,     'guindauto');
  renderSection('list-empilhadeiras', DATA.empilhadeiras, 'empilhadeiras');
}

// ── Construção do texto do relatório ───────────────────────────────────────────

function buildReport() {
  const date  = formatDate(document.getElementById('reportDate').value);
  const shift = document.getElementById('shiftSelect').value;
  const day   = document.getElementById('weekdaySelect').value;

  let t = `*Status XCMG MINA ${date}*\n\nTURNO ${shift}\n\n${day}\n\n`;

  // Guindastes
  t += `\n*Posicionamento dos Guindastes*\n`;
  DATA.guindastes.forEach(e => {
    t += `${e.status} ${e.tag}${e.sub ? ' SUB ' + E_RED + e.sub : ''}\n`;
    t += `${e.operatorStatus} ${e.operator}\n`;
    t += `${e.signalerStatus} ${e.signaler}\n\n`;
  });

  // Carretas
  t += `*Status das Carretas – Mina*\n\n`;
  DATA.carretas.forEach(e => {
    t += `${e.status} ${e.tag}${e.sub ? ' SUB ' + E_RED + e.sub : ''} ${e.operator}\n`;
  });

  // Caminhões
  t += `\n*Status dos Caminhões – Mina / Turno*\n`;
  DATA.caminhoes.forEach(e => {
    t += `${e.status} ${e.tag}${e.sub ? ' SUB ' + E_RED + e.sub : ''} ${e.operator}\n`;
  });

  // Guindauto
  t += `\n*Guindauto Sky Munck*\n`;
  DATA.guindauto.forEach(e => {
    t += `${e.status} ${e.tag}\n`;
  });

  // Empilhadeiras
  t += `\n*Status das Empilhadeiras*\n`;
  DATA.empilhadeiras.forEach(e => {
    t += `${e.status} ${e.tag}${e.sub ? ' SUB ' + E_RED + e.sub : ''} ${e.operator}\n`;
  });

  t += `\n*Legenda:*\n${E_GREEN} Com operador\n${E_YELLOW} Sem operador\n${E_RED} Manutenção Corretiva/preventiva`;

  return t;
}

// ── Eventos ────────────────────────────────────────────────────────────────────

document.getElementById('generateBtn').addEventListener('click', () => {
  const out = document.getElementById('output');
  out.textContent = buildReport();
  out.classList.remove('hidden');
  out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

document.getElementById('copyBtn').addEventListener('click', async () => {
  const btn = document.getElementById('copyBtn');
  await navigator.clipboard.writeText(buildReport());
  btn.textContent = '✅ Copiado!';
  setTimeout(() => { btn.textContent = '📄 Copiar'; }, 2500);
});

document.getElementById('whatsappBtn').addEventListener('click', () => {
  const text = encodeURIComponent(buildReport());
  const a = document.createElement('a');
  a.href = `https://wa.me/?text=${text}`;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
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
})();

// ── Init ───────────────────────────────────────────────────────────────────────

renderAll();
