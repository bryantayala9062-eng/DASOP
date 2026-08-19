// ═══════════════════════════════════════════════════════
//  Compliance Op — app.js v10 CLEAN (Reporting Only)
// ═══════════════════════════════════════════════════════
const API = '';
localStorage.clear(); // Limpiar sesiones antiguas persistentes
let token = sessionStorage.getItem('token');
let currentUser = JSON.parse(sessionStorage.getItem('user') || 'null');
let activeModule = null;
let currentPage = 'dashboard';

// ── NAV CONFIG ───────────────────────────────────────────
const REPORTING_NAV = [
  { section: 'Panel', open: true, items: [
    { id: 'dashboard', icon: '📊', label: 'Dashboard' },
    { id: 'reports',   icon: '📄', label: 'Reportes' },
    { id: 'kpis',      icon: '📈', label: 'KPIs' },
  ]},
  { section: 'Admin', open: false, items: [
    { id: 'users', icon: '👥', label: 'Usuarios' },
    { id: 'audit', icon: '🔍', label: 'Trazabilidad' },
  ]},
];

// ── INIT ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-error').style.display = 'none';
  document.getElementById('login-username').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  if (token && currentUser) showModuleSelector();
});

// ── API HELPER ───────────────────────────────────────────
async function api(path, opts = {}) {
  try {
    const res = await fetch(`${API}${path}`, {
      ...opts,
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...opts.headers }
    });
    if (res.status === 401) { doLogout(); return null; }
    if (!res.ok) {
      let msg = 'Error en el servidor';
      try { const d = await res.json(); msg = d.detail || d.message || msg; } catch(e) {}
      toast(msg, 'error');
      return null;
    }
    return res.json();
  } catch (e) {
    toast('Error de conexión con el servidor', 'error');
    return null;
  }
}

// ── LOGIN / LOGOUT ───────────────────────────────────────
async function doLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-pass').value.trim();
  const btn = document.getElementById('btn-login');
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';
  btn.textContent = 'Entrando...'; btn.disabled = true;
  try {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) {
      token = data.token || data.access_token;
      currentUser = data.user;
      sessionStorage.setItem('token', token);
      sessionStorage.setItem('user', JSON.stringify(currentUser));
      showModuleSelector();
    } else {
      errEl.textContent = 'Usuario o contraseña incorrectos';
      errEl.style.display = 'block';
      document.getElementById('login-pass').value = '';
    }
  } catch (e) {
    errEl.textContent = 'Error de red o servidor apagado (¿Está activo el túnel?)';
    errEl.style.display = 'block';
  }
  btn.textContent = 'Iniciar sesión'; btn.disabled = false;
}

function doLogout() { sessionStorage.clear(); location.reload(); }

// ── MODULE SELECTOR ──────────────────────────────────────
async function showModuleSelector() {
  hide('login-screen'); hide('app'); show('module-selector');
  const name = currentUser.fullName || currentUser.full_name || 'Usuario';
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2);
  document.getElementById('sel-name').textContent = name;
  document.getElementById('sel-role').textContent = roleLabel(currentUser.role);
  document.getElementById('sel-avatar').textContent = initials;

  const grid = document.getElementById('modules-grid');
  grid.innerHTML = '<div class="loading-state"><span class="spinner"></span> Cargando módulos...</div>';
  const data = await api('/api/auth/modules');
  if (!data || !data.modules) { grid.innerHTML = '<div class="empty-state">No se pudieron cargar los módulos.</div>'; return; }

  // Auto-route para el Jefe
  if (currentUser.username && currentUser.username.toLowerCase() === 'carlos') {
    enterModule('general', 'Vista General', '📊', '#7b61ff');
    return;
  }

  if (data.modules.length === 1 && currentUser.role !== 'admin') {
    const m = data.modules[0]; enterModule(m.id, m.name, m.icon, m.color); return;
  }

  grid.innerHTML = data.modules.map((mod, i) => `
    <div class="module-tile" style="--mod-color:${mod.color}; animation-delay:${i * 80}ms"
         onclick="enterModule('${mod.id}', '${mod.name}', '${mod.icon}', '${mod.color}')">
      <div class="tile-icon">${mod.icon}</div>
      <div class="tile-info">
        <div class="tile-name">${mod.name}</div>
        <div class="tile-desc">${mod.description}</div>
      </div>
    </div>
  `).join('');
}

// ── ENTER MODULE ─────────────────────────────────────────
function enterModule(modId, modName, modIcon, modColor) {
  activeModule = modId;
  hide('module-selector'); show('app');
  document.documentElement.style.setProperty('--accent', modColor);
  document.documentElement.style.setProperty('--accent-light', hexToRgba(modColor, 0.1));
  document.documentElement.style.setProperty('--accent-glow', hexToRgba(modColor, 0.2));

  document.getElementById('sb-mod-icon').textContent = modIcon;
  document.getElementById('sb-mod-name').textContent = modName;
  document.getElementById('sb-mod-dept').textContent = 'Reporteo OP';

  const name = currentUser.fullName || currentUser.full_name || 'Usuario';
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2);
  document.getElementById('user-name').textContent = name;
  document.getElementById('user-role').textContent = roleLabel(currentUser.role);
  document.getElementById('user-avatar').textContent = initials;
  document.getElementById('top-avatar').textContent = initials;

  buildSidebar();
  showPage('dashboard');
}

function exitModule() {
  activeModule = null;
  document.documentElement.style.setProperty('--accent', '#b2b2b2');
  showModuleSelector();
}

// ── SIDEBAR ──────────────────────────────────────────────
function buildSidebar() {
  const nav = document.getElementById('sidebar-nav');
  
  const navConfig = JSON.parse(JSON.stringify(REPORTING_NAV));
  if (activeModule === 'contabilidad' || (currentUser.role === 'admin' && activeModule === 'contabilidad')) {
    navConfig[0].items.push({ id: 'signatures', icon: '✍️', label: 'Firmas Electrónicas' });
  }

  nav.innerHTML = navConfig.filter(group => {
    if (group.section === 'Admin' && currentUser.role !== 'admin') return false;
    return true;
  }).map((group, gi) => {
    const sid = `sec-${gi}`;
    return `
      <div class="nav-section" onclick="toggleSection('${sid}')">
        <span>${group.section}</span>
        <span class="chevron" id="${sid}-chevron">${group.open ? '▼' : '▶'}</span>
      </div>
      <div class="nav-submenu ${group.open ? 'open' : ''}" id="${sid}-submenu">
        ${group.items.map(item => `
          <div class="nav-item" id="nav-${item.id}" onclick="showPage('${item.id}')">
            <span class="icon">${item.icon}</span> ${item.label}
          </div>
        `).join('')}
      </div>
    `;
  }).join('');
}

function toggleSection(section) {
  const sub = document.getElementById(`${section}-submenu`);
  const chev = document.getElementById(`${section}-chevron`);
  if (!sub) return;
  const open = !sub.classList.contains('open');
  sub.classList.toggle('open', open);
  if (chev) chev.textContent = open ? '▼' : '▶';
}

// ── ROUTER ───────────────────────────────────────────────
function showPage(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById(`nav-${page}`);
  if (navEl) navEl.classList.add('active');

  // Cerrar sidebar en móviles al cambiar de página
  document.body.classList.remove('sidebar-open');

  // Hide static pages
  document.getElementById('page-reports').style.display = 'none';
  document.getElementById('page-kpis').style.display = 'none';
  const pc = document.getElementById('page-content');

  const titles = {
    dashboard: ['Dashboard', 'Matriz de cumplimiento'],
    reports:   ['Reportes de Área', 'Directorio de reportes mensuales'],
    kpis:      ['Evaluación de KPIs', 'Resultados operativos del mes'],
    users:     ['Usuarios', 'Gestión de cuentas y accesos'],
    audit:     ['Trazabilidad', 'Historial de auditoría y acciones en el sistema'],
    signatures:['Firmas Electrónicas', 'Control de vigencias y vencimientos'],
  };
  const [title, sub] = titles[page] || [page, ''];
  document.getElementById('page-title').textContent = title;
  document.getElementById('page-sub').textContent = sub;

  if (page === 'dashboard') {
    pc.style.display = 'block';
    pc.innerHTML = '<div class="loading-state"><span class="spinner"></span> Cargando...</div>';
    renderDashboard();
  } else if (page === 'reports') {
    pc.style.display = 'none';
    document.getElementById('page-reports').style.display = 'block';
    loadReports();
  } else if (page === 'kpis') {
    pc.style.display = 'none';
    document.getElementById('page-kpis').style.display = 'block';
    loadKPIs();
  } else if (page === 'users') {
    pc.style.display = 'block';
    pc.innerHTML = '<div class="loading-state"><span class="spinner"></span> Cargando...</div>';
    renderUsers();
  } else if (page === 'audit') {
    pc.style.display = 'block';
    pc.innerHTML = '<div class="loading-state"><span class="spinner"></span> Cargando...</div>';
    renderAuditLog();
  } else if (page === 'signatures') {
    pc.style.display = 'block';
    pc.innerHTML = '<div class="loading-state"><span class="spinner"></span> Cargando...</div>';
    loadSignatures();
  } else {
    pc.style.display = 'block';
    pc.innerHTML = '<div class="empty-state">Página no encontrada</div>';
  }
}

// ── DASHBOARD (Compliance Matrix) ────────────────────────
async function renderDashboard() {
  const pc = document.getElementById('page-content');
  
  const dept = deptForModule(activeModule);
  // Admin without specific dept → show all; area user → show filtered
  const url = (currentUser.role === 'admin' && !dept)
    ? '/api/department-reports/period-status'
    : `/api/department-reports/period-status${dept ? `?department=${encodeURIComponent(dept)}` : ''}`;
  const data = await api(url);
  if (!data) { pc.innerHTML = '<div class="empty-state">No se pudo cargar la matriz.</div>'; return; }
  window._matrixData = data;

  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  pc.innerHTML = `
    <div id="executive-dashboard" style="display:none; margin-bottom:48px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:16px;"></div>
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
      <h2>Matriz de Cumplimiento ${data.year}</h2>
    </div>
    <div class="data-table-wrapper matrix-wrapper" style="overflow-x:auto;">
      <table class="data-table matrix-table" style="min-width:900px;">
        <thead><tr><th>Área</th>${months.map(m => `<th>${m}</th>`).join('')}</tr></thead>
        <tbody>
          ${data.matrix.map(row => `<tr>
            <td style="font-weight:600">${row.department}</td>
            ${row.months.map(m => {
              if (m.isFuture) return '<td style="text-align:center;color:var(--text3)">—</td>';
              const hasKpi = !!m.kpiEval;
              const color = hasKpi ? 'green' : 'red';
              const label = hasKpi ? 'Entregado' : 'Falta';
              return `<td style="text-align:center"><span class="badge badge-${color}" style="padding:2px 6px;font-size:0.7rem;cursor:pointer" onclick="openPeriodDetails('${row.department}',${m.month})">${label}</span></td>`;
            }).join('')}
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;

  // If we are in Vista General (admin without dept filter), render executive dashboard
  if (activeModule === 'general' || (currentUser.role === 'admin' && !dept)) {
    renderExecutiveDashboard();
  }
}

// ── EXECUTIVE DASHBOARD ──────────────────────────────────
let radarChartInstance = null;
let trendChartInstance = null;

async function renderExecutiveDashboard() {
  const execDiv = document.getElementById('executive-dashboard');
  execDiv.style.display = 'block';
  execDiv.innerHTML = '<div class="loading-state" style="padding:40px"><span class="spinner"></span> Cargando panel ejecutivo...</div>';

  const data = await api('/api/kpis/executive-summary');
  if (!data || !data.departments || data.departments.length === 0) {
    execDiv.innerHTML = '<div class="empty-state" style="margin-top:24px">No hay datos de KPIs cargados para mostrar el panel ejecutivo.</div>';
    return;
  }
  
  window._execData = data;

  const MONTH_NAMES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const DEPT_COLORS = {
    'Legal': '#8b5cf6', 'Administración': '#f59e0b', 'Tesorería': '#06b6d4',
    'Contabilidad': '#10b981', 'Operaciones': '#ef4444', 'RH': '#3b82f6'
  };
  const DEPT_ICONS = {
    'Legal': '⚖️', 'Administración': '🏢', 'Tesorería': '💰',
    'Contabilidad': '📊', 'Operaciones': '⚙️', 'RH': '👥'
  };

  // ── Month Filter Logic ──
  const allMonths = new Set();
  data.departments.forEach(d => d.scores.forEach(s => allMonths.add(s.month)));
  const sortedMonths = [...allMonths].sort((a, b) => a - b);
  
  const maxMonth = sortedMonths.length > 0 ? sortedMonths[sortedMonths.length - 1] : 0;
  const currentMonth = window.execSelectedMonth || maxMonth;
  const prevMonth = sortedMonths.slice().reverse().find(m => m < currentMonth) || 0;

  // ── Calculate Global Score ──
  let currentTotal = 0, currentCount = 0;
  let prevTotal = 0, prevCount = 0;
  data.departments.forEach(d => {
    const cScore = d.scores.find(s => s.month === currentMonth);
    const pScore = d.scores.find(s => s.month === prevMonth);
    if (cScore) { currentTotal += cScore.global_score; currentCount++; }
    if (pScore) { prevTotal += pScore.global_score; prevCount++; }
  });

  const globalScore = currentCount > 0 ? (currentTotal / currentCount) : 0;
  const globalPrev = prevCount > 0 ? (prevTotal / prevCount) : 0;
  const globalDiff = globalScore - globalPrev;

  const gColor = globalScore >= 90 ? '#10b981' : globalScore >= 70 ? '#f59e0b' : '#ef4444';
  const gTrendColor = globalDiff >= 0 ? '#10b981' : '#ef4444';
  const gArrow = globalDiff >= 0 ? '↑' : '↓';
  
  let globalHtml = '';
  if (currentCount > 0) {
    globalHtml = `
      <div style="background:linear-gradient(135deg, rgba(22,25,34,0.9), rgba(30,35,48,0.9)); border:1px solid rgba(255,255,255,0.1); border-radius:16px; padding:32px; margin-bottom:32px; display:flex; justify-content:space-between; align-items:center; box-shadow: 0 10px 40px rgba(0,0,0,0.3)">
        <div>
          <h3 style="margin:0; font-size:1.2rem; color:var(--text3); font-weight:500; text-transform:uppercase; letter-spacing:1px">Desempeño Global de la Empresa</h3>
          <div style="font-size:0.9rem; color:var(--text3); margin-top:4px">Promedio de todos los departamentos reportados en ${MONTH_NAMES[currentMonth]} ${data.year}</div>
        </div>
        <div style="display:flex; align-items:center; gap:24px">
          ${prevCount > 0 ? `<div style="text-align:right">
            <div style="font-size:0.85rem; color:var(--text3); margin-bottom:4px">vs mes anterior</div>
            <div style="color:${gTrendColor}; font-size:1.1rem; font-weight:600; background:rgba(0,0,0,0.2); padding:4px 12px; border-radius:20px">${gArrow} ${Math.abs(globalDiff).toFixed(1)}%</div>
          </div>` : ''}
          <div style="font-size:4rem; font-weight:800; line-height:1; color:${gColor}; text-shadow: 0 0 30px ${gColor}55">${globalScore.toFixed(1)}<span style="font-size:2rem">%</span></div>
        </div>
      </div>
    `;
  }

  // ── SECTION 1: Score Cards ──
  let cardsHtml = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;margin-bottom:32px">';
  for (const dept of data.departments) {
    const cScoreObj = dept.scores.find(s => s.month === currentMonth) || { global_score: 0, month: currentMonth };
    const pScoreObj = dept.scores.find(s => s.month === prevMonth);
    const score = cScoreObj.global_score;
    const color = score >= 90 ? '#10b981' : score >= 70 ? '#f59e0b' : '#ef4444';
    const bgColor = score >= 90 ? 'rgba(16,185,129,0.1)' : score >= 70 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)';
    const label = score >= 90 ? 'Excelente' : score >= 70 ? 'En Riesgo' : 'Crítico';
    
    let trendHtml = '';
    if (pScoreObj) {
      const diff = score - pScoreObj.global_score;
      const trendColor = diff >= 0 ? '#10b981' : '#ef4444';
      const arrow = diff >= 0 ? '↑' : '↓';
      trendHtml = `<span style="color:${trendColor};font-size:0.85rem;font-weight:600">${arrow} ${Math.abs(diff).toFixed(1)}%</span>`;
    }

    const deptIdClean = dept.name.replace(/[^a-zA-Z0-9]/g, '');

    cardsHtml += `
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:20px;position:relative;overflow:hidden;box-shadow:0 4px 15px rgba(0,0,0,0.2)">
        <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${color}"></div>
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
          <div>
            <div style="font-size:1.4rem;margin-bottom:2px">${DEPT_ICONS[dept.name] || '📋'}</div>
            <div style="font-weight:600;font-size:1rem;color:white">${dept.name}</div>
            <div style="font-size:0.75rem;color:var(--text3)">${MONTH_NAMES[cScoreObj.month]} ${data.year}</div>
            <div style="margin-top:12px; height:35px; width:100px;">
              <canvas id="sparkline-${deptIdClean}"></canvas>
            </div>
          </div>
          <div style="text-align:right">
            <div style="font-size:2rem;font-weight:800;color:${color};line-height:1">${score.toFixed(1)}%</div>
            <div style="display:flex;align-items:center;gap:6px;justify-content:flex-end;margin-top:4px">
              <span style="font-size:0.75rem;color:${color};font-weight:600;background:${bgColor};padding:2px 8px;border-radius:4px">${label}</span>
              ${trendHtml}
            </div>
          </div>
        </div>
        <div style="background:var(--bg3);border-radius:6px;height:8px;overflow:hidden;margin-bottom:12px">
          <div style="height:100%;width:${Math.min(score, 100)}%;background:${color};border-radius:6px;transition:width 0.8s ease"></div>
        </div>
        <button class="btn-ghost" style="width:100%;font-size:0.85rem;padding:6px;color:var(--text)" onclick="window.execSelectedMonth=${currentMonth};showExecutiveDetails('${dept.name}')">Ver desglose completo →</button>
      </div>
    `;
  }
  cardsHtml += '</div>';

  // ── SECTION 2: Charts Container ──
  let chartsHtml = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:32px">
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:24px;box-shadow:0 4px 15px rgba(0,0,0,0.2)">
        <h3 style="margin:0 0 16px;font-size:1.1rem;color:white;font-weight:600">🏆 Ranking de Áreas</h3>
        <p style="font-size:0.8rem;color:var(--text3);margin-top:-12px;margin-bottom:20px">Desempeño ordenado del mejor al peor (Mes actual)</p>
        <div style="position:relative;height:300px">
          <canvas id="exec-ranking-chart"></canvas>
        </div>
      </div>
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:24px;box-shadow:0 4px 15px rgba(0,0,0,0.2)">
        <h3 style="margin:0 0 16px;font-size:1.1rem;color:white;font-weight:600">📈 Evolución Histórica</h3>
        <p style="font-size:0.8rem;color:var(--text3);margin-top:-12px;margin-bottom:20px">Trayectoria vs Promedio Empresarial</p>
        <div style="position:relative;height:300px">
          <canvas id="exec-trend-chart"></canvas>
        </div>
      </div>
    </div>
  `;

  // ── SECTION 3: Critical KPIs Table ──
  let criticalHtml = '';
  if (data.critical_kpis && data.critical_kpis.length > 0) {
    criticalHtml = `
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:32px;box-shadow:0 4px 15px rgba(0,0,0,0.2)">
        <h3 style="margin:0 0 16px;font-size:1rem;color:white">🚨 KPIs Críticos que Requieren Atención Urgente</h3>
        <div class="data-table-wrapper">
          <table class="data-table">
            <thead><tr>
              <th>Área</th><th>KPI</th><th>Mes</th><th>Ponderación</th><th>Cumplimiento</th>
            </tr></thead>
            <tbody>
              ${data.critical_kpis.map(k => {
                const compColor = k.compliance >= 80 ? '#f59e0b' : '#ef4444';
                return `<tr>
                  <td><span style="color:${DEPT_COLORS[k.department] || 'white'};font-weight:600">${k.department}</span></td>
                  <td style="font-weight:500">${k.kpi_name}</td>
                  <td>${MONTH_NAMES[k.month]}</td>
                  <td>${k.weight}%</td>
                  <td>
                    <div style="display:flex;align-items:center;gap:8px">
                      <div style="flex:1;background:var(--bg3);border-radius:4px;height:6px;max-width:80px">
                        <div style="height:100%;width:${Math.min(k.compliance, 100)}%;background:${compColor};border-radius:4px"></div>
                      </div>
                      <span style="color:${compColor};font-weight:600;font-size:0.85rem">${k.compliance}%</span>
                    </div>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  const monthOptions = sortedMonths.map(m => `<option value="${m}" ${m === currentMonth ? 'selected' : ''}>${MONTH_NAMES[m]} ${data.year}</option>`).join('');
  const filterHtml = `
    <select onchange="window.execSelectedMonth=parseInt(this.value);renderExecutiveDashboard(window._execData);" style="background:var(--bg3);color:white;border:1px solid var(--border);border-radius:6px;padding:8px 16px;outline:none;font-size:0.95rem;cursor:pointer;font-weight:600">
      ${monthOptions}
    </select>
  `;

  execDiv.innerHTML = `
    <div style="margin-top:32px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div>
          <h2 style="margin:0;color:white;font-size:1.6rem">Panel Ejecutivo de KPIs</h2>
          <p style="margin:4px 0 0;color:var(--text3);font-size:0.95rem">Desempeño operativo consolidado — ${data.year}</p>
        </div>
        <div>
          ${filterHtml}
        </div>
      </div>
      ${globalHtml}
      ${cardsHtml}
      ${chartsHtml}
      ${criticalHtml}
    </div>
  `;

  // ── Render Charts ──
  setTimeout(() => {
    renderRankingChart(data, currentMonth);
    renderTrendChart(data);

    // Render Sparklines
    data.departments.forEach(dept => {
      const deptIdClean = dept.name.replace(/[^a-zA-Z0-9]/g, '');
      const canvas = document.getElementById(`sparkline-${deptIdClean}`);
      if (!canvas) return;
      
      const spCtx = canvas.getContext('2d');
      const sData = sortedMonths.map(m => {
        const s = dept.scores.find(x => x.month === m);
        return s ? s.global_score : null;
      });
      const color = DEPT_COLORS[dept.name] || '#888';
      
      new Chart(spCtx, {
        type: 'line',
        data: {
          labels: sortedMonths,
          datasets: [{
            data: sData,
            borderColor: color,
            borderWidth: 2,
            tension: 0.3,
            pointRadius: 0,
            fill: false,
            spanGaps: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: {
            x: { display: false },
            y: { display: false, min: 0, max: 100 }
          },
          layout: { padding: 0 }
        }
      });
    });
  }, 100);
}

function renderRankingChart(data, targetMonth) {
  const ctx = document.getElementById('exec-ranking-chart');
  if (!ctx) return;
  if (radarChartInstance) radarChartInstance.destroy();

  const DEPT_COLORS = {
    'Legal': '#8b5cf6', 'Administración': '#f59e0b', 'Tesorería': '#06b6d4',
    'Contabilidad': '#10b981', 'Operaciones': '#ef4444', 'RH': '#3b82f6'
  };

  // Get scores for targetMonth and sort them descending
  let deptScores = data.departments.map(d => {
    const s = d.scores.find(x => x.month === targetMonth);
    return { name: d.name, score: s ? s.global_score : 0 };
  });
  deptScores.sort((a, b) => b.score - a.score);

  const labels = deptScores.map(d => d.name);
  const scores = deptScores.map(d => d.score);
  
  // Create Gradients
  const canvasCtx = ctx.getContext('2d');
  const bgColors = deptScores.map(d => {
    const color = DEPT_COLORS[d.name] || '#888';
    const gradient = canvasCtx.createLinearGradient(0, 0, 400, 0);
    gradient.addColorStop(0, color + '22');
    gradient.addColorStop(1, color + 'CC');
    return gradient;
  });
  const borderColors = deptScores.map(d => DEPT_COLORS[d.name] || '#888');

  radarChartInstance = new Chart(canvasCtx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Score Global (%)',
        data: scores,
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: 1,
        borderRadius: 6,
        barPercentage: 0.7
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(22, 25, 34, 0.95)',
          titleFont: { size: 14, weight: '600' },
          bodyFont: { size: 14 },
          padding: 12,
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          callbacks: {
            label: function(context) { return ` Calificación: ${context.raw.toFixed(1)}%`; }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          max: 100,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#888', callback: v => v + '%' }
        },
        y: {
          grid: { display: false },
          ticks: { color: '#ccc', font: { weight: '600', size: 12 } }
        }
      }
    }
  });
}

function renderTrendChart(data) {
  const ctx = document.getElementById('exec-trend-chart');
  if (!ctx) return;
  if (trendChartInstance) trendChartInstance.destroy();

  const DEPT_COLORS = {
    'Legal': '#8b5cf6', 'Administración': '#f59e0b', 'Tesorería': '#06b6d4',
    'Contabilidad': '#10b981', 'Operaciones': '#ef4444', 'RH': '#3b82f6'
  };
  const MONTH_LABELS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  // Find all months that have data
  const allMonths = new Set();
  data.departments.forEach(d => d.scores.forEach(s => allMonths.add(s.month)));
  const sortedMonths = [...allMonths].sort((a, b) => a - b);
  const labels = sortedMonths.map(m => MONTH_LABELS[m - 1]);

  // Calculate Global Average per month
  const globalAvg = sortedMonths.map(m => {
    let total = 0, count = 0;
    data.departments.forEach(d => {
      const s = d.scores.find(score => score.month === m);
      if (s) { total += s.global_score; count++; }
    });
    return count > 0 ? (total / count) : null;
  });

  const datasets = data.departments.map(dept => {
    const scoreMap = {};
    dept.scores.forEach(s => { scoreMap[s.month] = s.global_score; });
    const color = DEPT_COLORS[dept.name] || '#888';
    return {
      label: dept.name,
      data: sortedMonths.map(m => scoreMap[m] !== undefined ? scoreMap[m] : null),
      borderColor: color,
      backgroundColor: color + '22',
      borderWidth: 2.5,
      tension: 0.3,
      fill: false,
      pointRadius: 5,
      pointBackgroundColor: color,
      spanGaps: false
    };
  });

  trendChartInstance = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true, max: 100,
          ticks: { color: '#999', callback: v => v + '%' },
          grid: { color: 'rgba(255,255,255,0.06)' }
        },
        x: {
          ticks: { color: '#999' },
          grid: { color: 'rgba(255,255,255,0.06)' }
        }
      },
      plugins: {
        legend: {
          labels: { color: '#ccc', usePointStyle: true, pointStyle: 'circle', padding: 16 }
        },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(1)}%`
          }
        }
      }
    }
  });
}

function showExecutiveDetails(deptName) {
  if (!window._execData) return;
  const dept = window._execData.departments.find(d => d.name === deptName);
  if (!dept) return;

  const currentMonth = window.execSelectedMonth || dept.scores[dept.scores.length - 1]?.month;
  const latestScore = dept.scores.find(s => s.month === currentMonth);
  if (!latestScore || !latestScore.details) return;

  const titleEl = document.getElementById('period-details-title');
  const contentEl = document.getElementById('period-details-content');
  
  const MONTH_NAMES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  titleEl.innerHTML = `Desglose de KPIs: ${deptName} <span style="font-size:0.9rem;color:var(--text3);font-weight:normal">(${MONTH_NAMES[latestScore.month]} ${window._execData.year})</span>`;
  
  // Sort details: critical first, then warning, then good
  const details = [...latestScore.details].sort((a, b) => {
    return (a.compliance_month || 0) - (b.compliance_month || 0);
  });

  contentEl.innerHTML = `
    <div style="margin-bottom:20px">
      <div style="font-size:1.8rem;font-weight:800;color:${latestScore.global_score >= 90 ? '#10b981' : latestScore.global_score >= 70 ? '#f59e0b' : '#ef4444'}">
        ${latestScore.global_score.toFixed(1)}% <span style="font-size:1rem;color:var(--text2);font-weight:600">Calificación Global</span>
      </div>
    </div>
    <div class="data-table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Sub-evaluación (KPI)</th>
            <th style="text-align:center">Valor</th>
            <th style="text-align:center">Cumplimiento</th>
          </tr>
        </thead>
        <tbody>
          ${details.map(d => {
            const compColor = (d.compliance_month || 0) >= 0.8 ? '#10b981' : (d.compliance_month || 0) >= 0.6 ? '#f59e0b' : '#ef4444';
            const compPct = ((d.compliance_month || 0) * 100).toFixed(1);
            return `
            <tr>
              <td style="font-weight:500">${d.kpi_name}</td>
              <td style="text-align:center;color:var(--text3)">${((d.weight || 0) * 100).toFixed(0)}%</td>
              <td style="text-align:center">
                <span style="color:${compColor};font-weight:600">${compPct}%</span>
              </td>
            </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
  
  openModal('modal-period-details');
}

// ── PERIOD DETAILS MODAL ─────────────────────────────────
window.openPeriodDetails = function(dept, month) {
  const data = window._matrixData;
  const row = data.matrix.find(r => r.department === dept);
  const m = row.months.find(x => x.month === month);
  const monthNames = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  document.getElementById('period-details-title').textContent = `${dept} — ${monthNames[month]} ${data.year}`;

  let reportHtml = '<p style="color:var(--red)">✘ No hay reporte de área cargado.</p>';
  if (m.report) {
    let dl = m.report.evidence ? `<button class="btn-ghost" style="padding:4px 8px;font-size:0.8rem;margin-top:5px" onclick="downloadFile('${API}${m.report.evidence.file_path}','${m.report.evidence.file_name}')">📥 Descargar</button>` : '';
    let del = currentUser.role === 'admin' ? `<button class="btn-ghost" style="padding:4px 8px;font-size:0.8rem;margin-top:5px;margin-left:6px;color:var(--red)" onclick="deleteReportFromModal(${m.report.id})">🗑️ Eliminar</button>` : '';
    reportHtml = `<p style="color:var(--green)">✔ Reporte cargado.</p><div style="display:flex;gap:4px;flex-wrap:wrap">${dl}${del}</div>`;
  }

  let kpiHtml = '<p style="color:var(--red)">✘ No hay evaluación de KPIs.</p>';
  if (m.kpiEval) {
    let dl = m.kpiEval.evidence ? `<button class="btn-ghost" style="padding:4px 8px;font-size:0.8rem;margin-top:5px" onclick="downloadFile('${API}${m.kpiEval.evidence.file_path}','${m.kpiEval.evidence.file_name}')">📥 Descargar</button>` : '';
    let del = currentUser.role === 'admin' ? `<button class="btn-ghost" style="padding:4px 8px;font-size:0.8rem;margin-top:5px;margin-left:6px;color:var(--red)" onclick="deleteKPIFromModal(${m.kpiEval.id})">🗑️ Eliminar</button>` : '';
    const scorePct = (m.kpiEval.globalScore * 100).toFixed(1).replace('.0', '');
    kpiHtml = `<p style="color:var(--green)">✔ KPIs cargados (Score: ${scorePct}%).</p><div style="display:flex;gap:4px;flex-wrap:wrap">${dl}${del}</div>`;
  }

  document.getElementById('period-details-content').innerHTML = `
    <div style="background:var(--bg2);padding:16px;border-radius:8px;border:1px solid var(--border)">
      <h4 style="margin:0 0 8px;color:white">Evaluación de KPIs</h4>${kpiHtml}
    </div>
  `;
  openModal('modal-period-details');
};

window.deleteReportFromModal = async function(id) {
  if (!confirm('¿Eliminar este reporte? Esta acción no se puede deshacer.')) return;
  try {
    const res = await fetch(`${API}/api/department-reports/${id}`, {
      method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok || res.status === 204) {
      toast('Reporte eliminado', 'success');
      closeModal('modal-period-details');
      renderDashboard();
    } else {
      const d = await res.json(); toast(d.detail || 'Error', 'error');
    }
  } catch (e) { toast('Error de red', 'error'); }
};

window.deleteKPIFromModal = async function(id) {
  if (!confirm('¿Eliminar esta evaluación de KPIs?')) return;
  try {
    const res = await fetch(`${API}/api/kpis/evaluation/${id}`, {
      method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok || res.status === 204) {
      toast('Evaluación eliminada', 'success');
      closeModal('modal-period-details');
      renderDashboard();
    } else {
      const d = await res.json(); toast(d.detail || 'Error', 'error');
    }
  } catch (e) { toast('Error de red', 'error'); }
};

async function downloadFile(url, fileName) {
  try {
    toast('Descargando archivo...', 'success');
    const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = window.URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(a.href);
  } catch (e) { toast('No se pudo descargar', 'error'); }
}

// ── REPORTS PAGE ─────────────────────────────────────────
async function loadReports() {
  const dept = deptForModule(activeModule);
  
  // Ocultar botón de subida en vista general
  const btnUpload = document.getElementById('btn-upload-report');
  if (btnUpload) {
    btnUpload.style.display = (activeModule === 'general') ? 'none' : 'block';
  }

  const reports = await api(`/api/department-reports${dept ? `?department=${encodeURIComponent(dept)}` : ''}`) || [];
  const tbody = document.getElementById('reports-list');
  if (reports.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text3)">No hay reportes cargados.</td></tr>';
    return;
  }
  tbody.innerHTML = reports.map(r => `<tr>
    <td>${r.department}</td>
    <td style="font-weight:500">${r.title}</td>
    <td>${r.periodMonth}/${r.periodYear}</td>
    <td>${r.uploaderName}</td>
    <td>${r.uploadDate ? new Date(r.uploadDate).toLocaleDateString('es-MX') : '—'}</td>
    <td><span class="badge badge-${r.status === 'reviewed' ? 'green' : 'orange'}">${r.status === 'reviewed' ? 'Revisado' : 'Entregado'}</span></td>
    <td>
      ${r.evidences?.length ? `<button class="btn-ghost" title="Descargar" style="padding:4px 8px;font-size:0.8rem" onclick="downloadFile('${API}/api/evidences/${r.evidences[0].id}/download','${r.evidences[0].fileName}')">📥</button>` : '—'}
      ${(currentUser.role === 'admin' && r.status !== 'reviewed') ? `<button class="btn-ghost" title="Aprobar Reporte" style="padding:4px 8px;font-size:0.8rem;margin-left:4px" onclick="reviewReport(${r.id})">✅</button>` : ''}
      ${currentUser.role === 'admin' ? `<button class="btn-ghost" title="Eliminar Reporte" style="padding:4px 8px;font-size:0.8rem;margin-left:4px;color:var(--red)" onclick="deleteReport(${r.id})">🗑️</button>` : ''}
    </td>
  </tr>`).join('');
}

async function reviewReport(id) {
  try {
    const res = await fetch(`${API}/api/department-reports/${id}/review`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      toast('Reporte marcado como Revisado', 'success');
      loadReports();
    } else {
      toast('Error al aprobar reporte', 'error');
    }
  } catch (e) {
    toast('Error de red', 'error');
  }
}

async function deleteReport(id) {
  if (!confirm('¿Estás seguro de que deseas eliminar este reporte? Esta acción no se puede deshacer.')) return;
  try {
    const res = await fetch(`${API}/api/department-reports/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok || res.status === 204) {
      toast('Reporte eliminado correctamente', 'success');
      loadReports();
    } else {
      const d = await res.json(); toast(d.detail || 'Error al eliminar', 'error');
    }
  } catch (e) {
    toast('Error de red', 'error');
  }
}

function openReportModal() {
  const dept = deptForModule(activeModule);
  const sel = document.getElementById('rep-dept');
  if (dept) {
    // Bloquear a solo su departamento
    sel.innerHTML = `<option value="${dept}">${dept}</option>`;
    sel.disabled = true;
    sel.style.opacity = '0.7';
  } else {
    // Admin: mostrar todos
    sel.innerHTML = `
      <option value="Legal">Legal</option>
      <option value="Administración">Administración</option>
      <option value="Tesorería">Tesorería</option>
      <option value="Contabilidad">Contabilidad</option>
      <option value="Operaciones">Operaciones</option>
      <option value="RH">Recursos Humanos</option>
    `;
    sel.disabled = false;
    sel.style.opacity = '1';
  }
  const now = new Date();
  document.getElementById('rep-month').value = now.getMonth() + 1;
  document.getElementById('rep-year').value = now.getFullYear();
  document.getElementById('rep-title').value = '';
  document.getElementById('rep-desc').value = '';
  document.getElementById('rep-file').value = '';
  document.getElementById('rep-file-name').textContent = 'Haz clic o arrastra tu archivo aquí';
  openModal('modal-report');
}

async function submitReport() {
  const title = document.getElementById('rep-title').value.trim();
  const file = document.getElementById('rep-file').files[0];
  if (!title) return toast('El título es requerido', 'error');
  if (!file) return toast('Selecciona un archivo', 'error');

  const fd = new FormData();
  fd.append('title', title);
  fd.append('department', document.getElementById('rep-dept').value);
  fd.append('period_month', document.getElementById('rep-month').value);
  fd.append('period_year', document.getElementById('rep-year').value);
  fd.append('description', document.getElementById('rep-desc').value || '');
  fd.append('file', file);

  try {
    const res = await fetch(`${API}/api/department-reports`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd
    });
    if (res.ok) {
      toast('Reporte subido exitosamente', 'success');
      closeModal('modal-report');
      loadReports();
    } else {
      const d = await res.json(); toast(d.detail || 'Error al subir', 'error');
    }
  } catch (e) { toast('Error de red', 'error'); }
}

// ── KPIs PAGE ────────────────────────────────────────────
async function loadKPIs() {
  const dept = deptForModule(activeModule);
  const container = document.getElementById('kpis-container');
  const history = await api(`/api/kpis/evaluation/history${dept ? `?department=${encodeURIComponent(dept)}` : ''}`) || [];
  window._kpiHistory = history;

  let html = '';
  
  // Mostrar formulario solo si NO estamos en vista general
  if (activeModule !== 'general') {
    html += `
      <div style="background:var(--bg2);padding:24px;border-radius:12px;border:1px solid var(--border);margin-bottom:24px">
        <h3 style="margin:0 0 16px">Subir Evaluación de KPIs</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div class="form-group"><label>Departamento</label>
            <select class="form-control" id="kpi-dept" ${dept ? 'disabled style="opacity:0.7"' : ''}>
              ${dept ? `<option value="${dept}" selected>${dept}</option>` : `
              <option value="Legal">Legal</option>
              <option value="Administración">Administración</option>
              <option value="Tesorería">Tesorería</option>
              <option value="Contabilidad">Contabilidad</option>
              <option value="Operaciones">Operaciones</option>
              <option value="RH">RH</option>`}
            </select>
          </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div class="form-group"><label>Mes</label>
            <input class="form-control" id="kpi-month" type="number" min="1" max="12" value="${new Date().getMonth()+1}">
          </div>
          <div class="form-group"><label>Año</label>
            <input class="form-control" id="kpi-year" type="number" value="${new Date().getFullYear()}">
          </div>
        </div>
        <div class="form-group"><label>Archivo de Evidencia (PDF/Excel)</label>
          <div style="display:flex;gap:12px;align-items:center;background:var(--bg3);padding:8px 12px;border-radius:6px;border:1px solid var(--border)">
            <input type="file" id="kpi-file" style="display:none" onchange="document.getElementById('kpi-file-name').textContent = this.files[0] ? this.files[0].name : 'No se eligió ningún archivo'">
            <button class="btn-ghost" style="padding:4px 8px;font-size:0.8rem" onclick="document.getElementById('kpi-file').click()">Elegir archivo</button>
            <span id="kpi-file-name" style="color:var(--text3);font-size:0.85rem">No se eligió ningún archivo</span>
          </div>
        </div>
        <button class="btn-primary" onclick="submitKPI()">Subir KPIs</button>
      </div>
    `;
  }

  html += `
    <h3 style="margin:0 0 16px">Historial de Evaluaciones</h3>
    ${history.length === 0 ? '<div class="empty-state">No hay evaluaciones registradas.</div>' : `
    <div class="data-table-wrapper"><table class="data-table">
      <thead><tr><th>Departamento</th><th>Periodo</th><th>Evaluador</th><th>Fecha</th><th>Acciones</th></tr></thead>
      <tbody>${history.map(e => `<tr>
        <td>${e.department}</td>
        <td>${e.period_month}/${e.period_year}</td>
        <td>${e.evaluator_name}</td>
        <td>${e.evaluation_date ? new Date(e.evaluation_date).toLocaleDateString('es-MX') : '—'}</td>
        <td>
          ${e.details && e.details.length > 0 ? `<button class="btn-ghost" style="padding:4px 8px;font-size:0.8rem;color:var(--accent)" onclick="openKpiChart(${e.id})">📊 Detalles</button>` : ''}
          ${e.evidence ? `<button class="btn-ghost" style="padding:4px 8px;font-size:0.8rem" onclick="downloadFile('${API}${e.evidence.file_path}','${e.evidence.file_name}')">📥</button>` : '—'}
          ${(currentUser.role === 'admin' || currentUser.department === e.department) ? `<button class="btn-ghost" title="Eliminar" style="padding:4px 8px;font-size:0.8rem;margin-left:4px;color:var(--red)" onclick="deleteKPIEval(${e.id})">🗑️</button>` : ''}
        </td>
      </tr>`).join('')}</tbody>
    </table></div>`}
  `;
  container.innerHTML = html;
}

async function submitKPI() {
  const file = document.getElementById('kpi-file').files[0];
  if (!file) return toast('Selecciona un archivo', 'error');

  const fd = new FormData();
  fd.append('department', document.getElementById('kpi-dept').value);
  fd.append('period_month', document.getElementById('kpi-month').value);
  fd.append('period_year', document.getElementById('kpi-year').value);
  fd.append('global_score', 0); // Requerido por el backend, pero ya no se pide
  fd.append('file', file);

  try {
    const res = await fetch(`${API}/api/kpis/evaluation/upload`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd
    });
    if (res.ok) { toast('KPIs subidos correctamente', 'success'); loadKPIs(); }
    else { const d = await res.json(); toast(d.detail || 'Error', 'error'); }
  } catch (e) { toast('Error de red', 'error'); }
}

async function deleteKPIEval(id) {
  if (!confirm('¿Estás seguro de que deseas eliminar esta evaluación de KPIs?')) return;
  try {
    const res = await fetch(`${API}/api/kpis/evaluation/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok || res.status === 204) {
      toast('Evaluación eliminada correctamente', 'success');
      loadKPIs();
    } else {
      const d = await res.json(); toast(d.detail || 'Error al eliminar', 'error');
    }
  } catch (e) { toast('Error de red', 'error'); }
}

let kpiChartInstance = null;
window.openKpiChart = function(id) {
  const e = window._kpiHistory.find(x => x.id === id);
  if (!e || !e.details) return;
  
  document.getElementById('kpi-chart-title').textContent = `KPIs ${e.department} - ${e.period_month}/${e.period_year}`;
  
  const tbody = document.getElementById('kpi-chart-table-body');
  tbody.innerHTML = e.details.map(d => `<tr>
    <td style="font-weight:500">${d.kpi_name}</td>
    <td>${(d.weight * 100).toFixed(0)}%</td>
    <td>${(d.compliance_month * 100).toFixed(0)}%</td>
    <td>${d.status}</td>
  </tr>`).join('');
  
  // Render Chart
  const ctx = document.getElementById('kpiChartCanvas').getContext('2d');
  if (kpiChartInstance) {
    kpiChartInstance.destroy();
  }
  
  const labels = e.details.map(d => d.kpi_name);
  const dataPoints = e.details.map(d => d.compliance_month * 100);
  
  kpiChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '% de Cumplimiento',
        data: dataPoints,
        backgroundColor: 'rgba(54, 162, 235, 0.6)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, max: 100 }
      }
    }
  });
  
  openModal('modal-kpi-chart');
};

// ── USERS PAGE ───────────────────────────────────────────
async function renderUsers() {
  const pc = document.getElementById('page-content');
  if (currentUser.role !== 'admin') { pc.innerHTML = '<div class="empty-state">No tienes permisos.</div>'; return; }
  const users = await api('/api/users') || [];
  
  const headerHtml = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
      <h2><span class="icon">👥</span> Usuarios del Sistema</h2>
      <button class="btn-primary" onclick="openUserModal()">+ Crear Usuario</button>
    </div>
  `;

  pc.innerHTML = headerHtml + (users.length === 0 ? '<div class="empty-state">No hay usuarios.</div>' : `
    <div class="data-table-wrapper"><table class="data-table">
      <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Departamento</th><th>Estado</th><th>Acción</th></tr></thead>
      <tbody>${users.map(u => `<tr>
        <td style="font-weight:500"><div style="display:flex;align-items:center;gap:8px">
          <div class="avatar" style="width:28px;height:28px;font-size:0.7rem">${u.initials || 'U'}</div>${u.fullName}
        </div></td>
        <td>${u.username || u.email || '—'}</td>
        <td style="text-transform:capitalize">${roleLabel(u.role)}</td>
        <td>${u.department || '—'}</td>
        <td><span class="badge badge-${u.status === 'active' ? 'green' : 'red'}">${u.status === 'active' ? 'Activo' : 'Inactivo'}</span></td>
        <td>
          <button class="btn-ghost" style="padding:4px" onclick='editUser(${JSON.stringify(u)})' title="Editar">✏️</button>
          <button class="btn-ghost" style="padding:4px;color:var(--red)" onclick="deleteUser(${u.id})" title="Eliminar/Desactivar">🗑️</button>
        </td>
      </tr>`).join('')}</tbody>
    </table></div>
  `);
}

let editingUserId = null;

function openUserModal() {
  editingUserId = null;
  document.querySelector('#modal-user .modal-header h3').textContent = 'Crear Usuario';
  document.querySelector('#modal-user .btn-primary').textContent = 'Crear Usuario';
  document.getElementById('u-name').value = '';
  document.getElementById('u-username').value = '';
  document.getElementById('u-email').value = '';
  document.getElementById('u-pass').value = '';
  document.getElementById('u-pass').placeholder = 'Mínimo 6 caracteres';
  document.getElementById('u-role').value = 'user';
  document.getElementById('u-dept').value = '';
  openModal('modal-user');
}

function editUser(u) {
  editingUserId = u.id;
  document.querySelector('#modal-user .modal-header h3').textContent = 'Editar Usuario';
  document.querySelector('#modal-user .btn-primary').textContent = 'Guardar Cambios';
  document.getElementById('u-name').value = u.fullName || '';
  document.getElementById('u-username').value = u.username || u.email || ''; // fallback for old records
  document.getElementById('u-email').value = u.email || '';
  document.getElementById('u-pass').value = '';
  document.getElementById('u-pass').placeholder = 'Dejar en blanco para no cambiar';
  document.getElementById('u-role').value = u.role || 'user';
  document.getElementById('u-dept').value = u.department || '';
  openModal('modal-user');
}

async function deleteUser(id) {
  if (!confirm('¿Estás seguro de que deseas desactivar este usuario?')) return;
  try {
    const res = await fetch(`${API}/api/users/${id}`, {
      method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) { toast('Usuario desactivado', 'success'); renderUsers(); }
    else { const d = await res.json(); toast(d.detail || 'Error', 'error'); }
  } catch (e) { toast('Error de red', 'error'); }
}


async function submitUser() {
  const full_name = document.getElementById('u-name').value.trim();
  const username = document.getElementById('u-username').value.trim();
  const email = document.getElementById('u-email').value.trim();
  const password = document.getElementById('u-pass').value.trim();
  const role = document.getElementById('u-role').value;
  const department = document.getElementById('u-dept').value;

  if (!full_name || !username) return toast('Completa nombre y usuario', 'error');
  if (!editingUserId && !password) return toast('La contraseña es obligatoria', 'error');
  if (password && password.length < 6) return toast('La contraseña debe tener al menos 6 caracteres', 'error');

  const payload = { full_name, username, email: email || null, role, department: department || null };
  if (password) payload.password = password;

  try {
    const url = editingUserId ? `${API}/api/users/${editingUserId}` : `${API}/api/users`;
    const method = editingUserId ? 'PUT' : 'POST';
    
    const res = await fetch(url, {
      method,
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      toast(editingUserId ? 'Usuario actualizado' : 'Usuario creado exitosamente', 'success');
      closeModal('modal-user');
      renderUsers();
    } else {
      const d = await res.json();
      toast(d.detail || 'Error en la petición', 'error');
    }
  } catch (e) { toast('Error de red', 'error'); }
}

// ── AUDIT / TRAZABILIDAD ──────────────────────────────────
async function renderAudit() {
  const pc = document.getElementById('page-content');
  if (currentUser.role !== 'admin') { pc.innerHTML = '<div class="empty-state">No tienes permisos.</div>'; return; }
  
  const data = await api('/api/evidences/audit/log?limit=200');
  if (!data || !data.logs) {
    pc.innerHTML = '<div class="empty-state">Error al cargar la trazabilidad.</div>';
    return;
  }
  
  const headerHtml = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
      <h2><span class="icon">🔍</span> Registro Documental</h2>
      <button class="btn-ghost" onclick="renderAudit()">🔄 Actualizar</button>
    </div>
  `;

  pc.innerHTML = headerHtml + (data.logs.length === 0 ? '<div class="empty-state">No hay registros de auditoría.</div>' : `
    <div class="data-table-wrapper"><table class="data-table">
      <thead><tr><th>Fecha / Hora</th><th>Usuario</th><th>Área</th><th>Acción</th><th>Archivo</th><th>Tamaño</th></tr></thead>
      <tbody>${data.logs.map(log => `<tr>
        <td style="color:var(--text2); font-size:0.9rem">${new Date(log.date || log.createdAt || log.created_at || Date.now()).toLocaleString('es-MX')}</td>
        <td style="font-weight:500">${log.userName}</td>
        <td><span class="badge badge-gray">${log.userDepartment || '—'}</span></td>
        <td>${log.actionLabel}</td>
        <td style="word-break:break-all">${log.fileName || '—'}</td>
        <td style="color:var(--text2)">${log.fileSizeLabel || '—'}</td>
      </tr>`).join('')}</tbody>
    </table></div>
  `);
}

// ── MY PROFILE ───────────────────────────────────────────
function openProfileModal() {
  document.getElementById('p-name').value = currentUser.fullName || '';
  document.getElementById('p-username').value = currentUser.username || currentUser.email || '';
  document.getElementById('p-email').value = currentUser.email || '';
  document.getElementById('p-pass').value = '';
  openModal('modal-profile');
}

async function submitProfile() {
  const full_name = document.getElementById('p-name').value.trim();
  const username = document.getElementById('p-username').value.trim();
  const email = document.getElementById('p-email').value.trim();
  const password = document.getElementById('p-pass').value.trim();

  if (!full_name || !username) return toast('El nombre y usuario son obligatorios', 'error');
  if (password && password.length < 6) return toast('La contraseña debe tener al menos 6 caracteres', 'error');

  const payload = { full_name, username, email: email || null };
  if (password) payload.password = password;

  try {
    const res = await fetch(`${API}/api/users/profile/me`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      toast('Perfil actualizado. Reinicia sesión si cambiaste la contraseña.', 'success');
      closeModal('modal-profile');
      const data = await res.json();
      currentUser = data; // update local context
      sessionStorage.setItem('user', JSON.stringify(currentUser));
      document.getElementById('user-name').textContent = currentUser.fullName;
    } else {
      const d = await res.json();
      toast(d.detail || 'Error', 'error');
    }
  } catch (e) { toast('Error de red', 'error'); }
}
let editSignatureId = null;

async function loadSignatures() {
  const pc = document.getElementById('page-content');
  
  const html = `
    <div class="glass-card" style="padding:24px; margin-bottom:32px; background: rgba(255, 255, 255, 0.03); border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px);">
      <h3 id="sig-form-title" style="margin:0 0 20px; font-weight: 600; font-size: 1.25rem;">✨ Registrar Nueva Firma Electrónica</h3>
      <div style="display:flex; gap:16px; align-items:flex-end; flex-wrap:wrap;">
        <div class="form-group" style="flex:2; min-width:250px;">
          <label style="font-weight: 600; color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; display: block;">Nombre de la Firma (Razón Social)</label>
          <input class="form-control" id="sig-name" type="text" placeholder="Ej. Empresa SA de CV" style="background: var(--bg3); border: 1px solid var(--border); box-shadow: inset 0 2px 4px rgba(0,0,0,0.1); font-size: 0.95rem; padding: 12px 16px;">
        </div>
        <div class="form-group" style="flex:1; min-width:160px;">
          <label style="font-weight: 600; color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; display: block;">Emisión</label>
          <input class="form-control" id="sig-date" type="date" style="background: var(--bg3); border: 1px solid var(--border); box-shadow: inset 0 2px 4px rgba(0,0,0,0.1); font-size: 0.95rem; padding: 12px 16px;">
        </div>
        <div class="form-group" style="flex:1; min-width:160px;">
          <label style="font-weight: 600; color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; display: block;">Vencimiento</label>
          <input class="form-control" id="sig-exp-date" type="date" style="background: var(--bg3); border: 1px solid var(--border); box-shadow: inset 0 2px 4px rgba(0,0,0,0.1); font-size: 0.95rem; padding: 12px 16px;">
        </div>
        <div style="display: flex; gap: 12px; margin-bottom: 2px;">
            <button class="btn-ghost" id="sig-cancel-btn" style="display:none; padding: 12px 24px; border: 1px solid var(--border); border-radius: 8px;" onclick="cancelEditSignature()">Cancelar</button>
            <button class="btn-primary" id="sig-submit-btn" style="background: linear-gradient(135deg, var(--primary) 0%, #4f46e5 100%); border: none; box-shadow: 0 4px 15px rgba(99,102,241,0.35); transition: transform 0.2s, box-shadow 0.2s; padding: 12px 32px; border-radius: 8px; font-weight: 600;" onclick="submitSignature()" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(99,102,241,0.45)'" onmouseout="this.style.transform='none'; this.style.boxShadow='0 4px 15px rgba(99,102,241,0.35)'">Guardar Firma</button>
        </div>
      </div>
    </div>

    <h3 style="margin-top:16px; margin-bottom:20px; font-weight: 600; font-size: 1.2rem; display: flex; align-items: center; gap: 8px;"><span style="font-size: 1.5rem">📅</span> Control de Vencimientos</h3>
    <div id="signatures-list-container">
      <div class="loading-state"><span class="spinner"></span> Cargando...</div>
    </div>
  `;
  pc.innerHTML = html;
  await renderSignaturesTable();
}

async function renderSignaturesTable() {
  const container = document.getElementById('signatures-list-container');
  const data = await api('/api/signatures'); // Fix trailing slash
  if (!data) return;

  if (data.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding: 48px; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px dashed var(--border);">No hay firmas registradas aún.</div>';
    return;
  }

  container.innerHTML = `
    <div class="data-table-wrapper" style="box-shadow: 0 8px 30px rgba(0,0,0,0.2); border-radius: 12px; overflow: hidden; border: 1px solid var(--border);">
    <table class="data-table" style="margin:0;">
      <thead style="background: var(--bg2);"><tr>
        <th style="padding: 18px 24px;">Nombre de la Firma</th>
        <th>Emisión</th>
        <th>Vencimiento</th>
        <th>Estatus</th>
        <th style="text-align: right; padding-right: 24px;">Acciones</th>
      </tr></thead>
      <tbody>${data.map(s => {
        const statusBadge = s.is_expired 
          ? '<span class="badge" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3); padding: 6px 12px; border-radius: 20px; font-weight: 600; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 6px;"><span style="width:6px;height:6px;background:#ef4444;border-radius:50%;display:inline-block;box-shadow: 0 0 8px #ef4444;"></span>Vencida</span>'
          : '<span class="badge" style="background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3); padding: 6px 12px; border-radius: 20px; font-weight: 600; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 6px;"><span style="width:6px;height:6px;background:#10b981;border-radius:50%;display:inline-block;box-shadow: 0 0 8px #10b981;"></span>Vigente</span>';
          
        return `<tr style="transition: background 0.2s; cursor: default;" onmouseover="this.style.background='var(--bg2)'" onmouseout="this.style.background='transparent'">
          <td style="font-weight:600; padding: 18px 24px;">${s.name}</td>
          <td style="color: var(--text-muted); font-family: monospace; font-size: 0.95rem;">${new Date(s.issue_date).toLocaleDateString('es-MX', {timeZone: 'UTC'})}</td>
          <td style="color: var(--text-muted); font-family: monospace; font-size: 0.95rem;">${new Date(s.expiration_date).toLocaleDateString('es-MX', {timeZone: 'UTC'})}</td>
          <td>${statusBadge}</td>
          <td style="text-align: right; padding-right: 24px;">
            <button class="btn-ghost" style="padding:8px 16px; font-size:0.85rem; margin-right: 8px; border: 1px solid var(--border); border-radius: 6px; transition: all 0.2s;" onmouseover="this.style.background='var(--border)'" onmouseout="this.style.background='transparent'" onclick="editSignature(${s.id}, '${s.name.replace(/'/g, "\\'")}', '${s.issue_date.split('T')[0]}', '${s.expiration_date.split('T')[0]}')">✏️ Editar</button>
            <button class="btn-ghost" style="color:#ef4444; padding:8px 16px; font-size:0.85rem; border: 1px solid rgba(239,68,68,0.2); background: rgba(239,68,68,0.05); border-radius: 6px; transition: all 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.15)'" onmouseout="this.style.background='rgba(239,68,68,0.05)'" onclick="deleteSignature(${s.id})">🗑️ Borrar</button>
          </td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>
  `;
}

window.editSignature = function(id, name, date, expDate) {
    editSignatureId = id;
    document.getElementById('sig-name').value = name;
    document.getElementById('sig-date').value = date;
    document.getElementById('sig-exp-date').value = expDate || '';
    
    document.getElementById('sig-form-title').innerHTML = '✏️ Editar Firma Electrónica';
    document.getElementById('sig-submit-btn').textContent = 'Guardar Cambios';
    document.getElementById('sig-cancel-btn').style.display = 'inline-block';
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.cancelEditSignature = function() {
    editSignatureId = null;
    document.getElementById('sig-name').value = '';
    document.getElementById('sig-date').value = '';
    document.getElementById('sig-exp-date').value = '';
    
    document.getElementById('sig-form-title').innerHTML = '✨ Registrar Nueva Firma Electrónica';
    document.getElementById('sig-submit-btn').textContent = 'Guardar Firma';
    document.getElementById('sig-cancel-btn').style.display = 'none';
};

async function submitSignature() {
  const name = document.getElementById('sig-name').value.trim();
  const date = document.getElementById('sig-date').value;
  const expDate = document.getElementById('sig-exp-date').value;
  
  if (!name || !date) return toast('Completa el nombre y la fecha de emisión', 'error');

  const method = editSignatureId ? 'PUT' : 'POST';
  const url = editSignatureId ? `/api/signatures/${editSignatureId}` : '/api/signatures';

  const payload = { name: name, issue_date: date };
  if (expDate) payload.expiration_date = expDate;

  const res = await api(url, {
    method: method,
    body: JSON.stringify(payload)
  });

  if (res) {
    toast(editSignatureId ? 'Firma actualizada' : 'Firma registrada', 'success');
    cancelEditSignature();
    await renderSignaturesTable();
  }
}

window.deleteSignature = async function(id) {
  if (!confirm('¿Seguro que deseas borrar este registro permanentemente?')) return;
  
  const res = await api(`/api/signatures/${id}`, { method: 'DELETE' });
  if (res) {
    toast('Registro eliminado exitosamente', 'success');
    if (editSignatureId === id) cancelEditSignature();
    await renderSignaturesTable();
  }
};


// ── UTILS ────────────────────────────────────────────────
function hide(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
function show(id) { const el = document.getElementById(id); if (el) el.style.display = id === 'app' ? 'flex' : 'block'; }
function openModal(id) { const el = document.getElementById(id); if (el) el.classList.add('open'); }
function closeModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('open'); }
function roleLabel(r) { return { admin:'Administrador', manager:'Gerente', user:'Usuario' }[r] || r; }
function hexToRgba(hex, a) { const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); return `rgba(${r},${g},${b},${a})`; }
function deptForModule(modId) {
  return { legal:'Legal', admin:'Administración', tesoreria:'Tesorería', contabilidad:'Contabilidad', operaciones:'Operaciones', rh:'RH' }[modId] || null;
}
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── MOBILE SIDEBAR TOGGLE ────────────────────────────────
window.toggleSidebar = function() {
  document.body.classList.toggle('sidebar-open');
};
