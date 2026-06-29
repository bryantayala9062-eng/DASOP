// ═══════════════════════════════════════════════════════
//  Compliance Op — app.js v3.0  (Core + Selector + Sidebar Dinámico)
// ═══════════════════════════════════════════════════════
window.addEventListener('error', function(e) {
  document.body.innerHTML += `<div style="position:fixed;top:0;left:0;z-index:9999;background:red;color:white;padding:20px;font-size:16px;">Global Error: ${e.message} at ${e.filename}:${e.lineno}</div>`;
});
window.addEventListener('unhandledrejection', function(e) {
  document.body.innerHTML += `<div style="position:fixed;top:0;left:0;z-index:9999;background:red;color:white;padding:20px;font-size:16px;">Unhandled Promise: ${e.reason}</div>`;
});

const API = '';
let token = localStorage.getItem('token');
let currentUser = JSON.parse(localStorage.getItem('user') || 'null');
let activeModule = null;
let currentPage = 'dashboard';
let incidentTimerInterval = null;

// ── MENÚ LATERAL Y RUTAS ──────────────────────────────────
const MODULE_NAV_CONFIG = {
  'planeacion': { section: 'Planeación', open: true, items: [
    { id: 'planning', icon: '🎯', label: 'Deal Desk' }
  ]},
  'facturacion': { section: 'Facturación', open: true, items: [
    { id: 'invoices', icon: '🧾', label: 'Facturas' },
    { id: 'relations', icon: '🔗', label: 'Relaciones PPD' }
  ]},
  'legal': { section: 'Legal', open: true, items: [
    { id: 'legal-urgency', icon: '🚨', label: 'Urgencia' },
    { id: 'legal-inbox',   icon: '📥', label: 'Bandeja' },
    { id: 'contracts',     icon: '📄', label: 'Contratos' },
    { id: 'timeline',      icon: '⏳', label: 'Historial' }
  ]},
  'tesoreria': { section: 'Tesorería', open: true, items: [
    { id: 'treasury', icon: '🏦', label: 'Gestión Pagos' }
  ]},
  'admin': { section: 'Administración', open: true, items: [
    { id: 'users',   icon: '👥', label: 'Usuarios' },
  ]},
};

// Nav genérico para módulos sin configuración propia
const GENERIC_NAV_CONFIG = [
  { section: 'Panel', open: true, items: [
    { id: 'dashboard', icon: '📊', label: 'Dashboard' },
    { id: 'my-tasks',  icon: '✅', label: 'Mis Tareas',  badge: 'badge-tasks' },
    { id: 'alerts',    icon: '🔔', label: 'Alertas',    badge: 'badge-alerts' },
    { id: 'documents', icon: '📄', label: 'Documentos' },
  ]},
  { section: 'Gestión', open: false, items: [
    { id: 'risks',     icon: '⚠️', label: 'Riesgos' },
    { id: 'controls',  icon: '✅', label: 'Checklists' },
    { id: 'audits',    icon: '📋', label: 'Auditorías' },
    { id: 'incidents', icon: '🚨', label: 'Incidentes' },
  ]},
  { section: 'Más', open: false, items: [
    { id: 'reports', icon: '📈', label: 'Informes' },
    { id: 'users',   icon: '👥', label: 'Usuarios' },
  ]},
];

// ── Inicializar ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-error').style.display = 'none';
  document.getElementById('login-username').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  if (token && currentUser) showModuleSelector();
});

// ── API helper ───────────────────────────────────────────
async function api(path, opts = {}) {
  try {
    const res = await fetch(`${API}${path}`, {
      ...opts,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...opts.headers
      }
    });
    if (res.status === 401) { doLogout(); return null; }
    if (!res.ok) {
      let msg = 'Error en el servidor';
      try {
        const errData = await res.json();
        msg = errData.detail || errData.message || msg;
      } catch(e) {}
      toast(msg, 'error');
      return null;
    }
    return res.json();
  } catch (e) {
    console.error('API error:', path, e);
    toast('Error de conexión con el servidor', 'error');
    return null;
  }
}

// ── LOGIN ────────────────────────────────────────────────
async function doLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-pass').value.trim();
  const btn = document.getElementById('btn-login');
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';
  btn.textContent = 'Entrando...';
  btn.disabled = true;

  try {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) {
      token = data.token || data.access_token;
      currentUser = data.user;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(currentUser));
      showModuleSelector();
    } else {
      errEl.style.display = 'block';
      document.getElementById('login-pass').value = '';
    }
  } catch (e) {
    errEl.style.display = 'block';
  }
  btn.textContent = 'Iniciar sesión';
  btn.disabled = false;
}

// ── LOGOUT ───────────────────────────────────────────────
function doLogout() {
  localStorage.clear();
  activeModule = null;
  if (incidentTimerInterval) clearInterval(incidentTimerInterval);
  location.reload();
}

// ── SELECTOR DE MÓDULOS ──────────────────────────────────
async function showModuleSelector() {
  hide('login-screen');
  hide('app');
  show('module-selector');

  // Actualizar UI del header del selector
  const name = currentUser.fullName || currentUser.full_name || 'Usuario';
  const initials = currentUser.initials || name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2);
  document.getElementById('sel-name').textContent = name;
  document.getElementById('sel-role').textContent = roleLabel(currentUser.role);
  document.getElementById('sel-avatar').textContent = initials;

  // Cargar módulos desde la API
  const grid = document.getElementById('modules-grid');
  grid.innerHTML = '<div class="loading-state"><span class="spinner"></span> Cargando módulos...</div>';

  const data = await api('/api/auth/modules');
  if (!data || !data.modules) {
    grid.innerHTML = '<div class="empty-state">No se pudieron cargar los módulos.</div>';
    return;
  }

  // Redirección directa si solo hay un módulo (y no es admin que quiera ver el selector general)
  if (data.modules.length === 1 && currentUser.role !== 'admin') {
    const mod = data.modules[0];
    enterModule(mod.id, mod.name, mod.icon, mod.color);
    return;
  }

  grid.innerHTML = data.modules.map((mod, i) => `
    <div class="module-tile" style="--mod-color:${mod.color}; animation-delay:${i * 80}ms"
         onclick="enterModule('${mod.id}', '${mod.name}', '${mod.icon}', '${mod.color}')">
      <div class="tile-icon">${mod.icon}</div>
      <div class="tile-info">
        <div class="tile-name">${mod.name}</div>
        <div class="tile-desc">${mod.description}</div>
      </div>
      <div class="tile-badges">
        ${mod.overdueTasks > 0 ? `<span class="tile-badge tile-badge-red">${mod.overdueTasks} atrasadas</span>` : ''}
        ${mod.unreadAlerts > 0 ? `<span class="tile-badge tile-badge-orange">${mod.unreadAlerts} alertas</span>` : ''}
        ${mod.pendingTasks > 0 ? `<span class="tile-badge tile-badge-gray">${mod.pendingTasks} pendientes</span>` : ''}
      </div>
      ${mod.adminOnly ? '<span class="tile-admin-tag">ADMIN</span>' : ''}
    </div>
  `).join('');
}

// ── ENTRAR A UN MÓDULO ─────────────────────────────────────────
function enterModule(modId, modName, modIcon, modColor) {
  activeModule = modId;
  hide('module-selector');
  show('app');

  // Aplicar color del módulo al sidebar
  document.documentElement.style.setProperty('--accent', modColor);
  document.documentElement.style.setProperty('--accent-light', hexToRgba(modColor, 0.1));
  document.documentElement.style.setProperty('--accent-glow', hexToRgba(modColor, 0.2));

  // Actualizar sidebar header
  document.getElementById('sb-mod-icon').textContent = modIcon;
  document.getElementById('sb-mod-name').textContent = modName;
  document.getElementById('sb-mod-dept').textContent = 'Compliance Op';

  // Actualizar user info en sidebar
  const name = currentUser.fullName || currentUser.full_name || 'Usuario';
  const initials = currentUser.initials || name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2);
  document.getElementById('user-name').textContent = name;
  document.getElementById('user-role').textContent = roleLabel(currentUser.role);
  document.getElementById('user-avatar').textContent = initials;
  document.getElementById('top-avatar').textContent = initials;

  // Construir sidebar específico del módulo
  buildSidebarForModule(modId);

  loadBadges();
  showPage('dashboard');
}

// ── CONSTRUIR SIDEBAR POR MÓDULO ──────────────────────────────
function buildSidebarForModule(modId) {
  const config = MODULE_NAV_CONFIG[modId] ? [MODULE_NAV_CONFIG[modId], ...GENERIC_NAV_CONFIG] : GENERIC_NAV_CONFIG;
  const nav = document.getElementById('sidebar-nav');

  nav.innerHTML = config.map((group, gi) => {
    const sectionId = `sec-${gi}`;
    return `
      <div class="nav-section" onclick="toggleSection('${sectionId}', null)">
        <span>${group.section}</span>
        <span class="chevron" id="${sectionId}-chevron">${group.open ? '▼' : '▶'}</span>
      </div>
      <div class="nav-submenu ${group.open ? 'open' : ''}" id="${sectionId}-submenu">
        ${group.items.map(item => `
          <div class="nav-item" id="nav-${item.id}" onclick="showPage('${item.id}')">
            <span class="icon">${item.icon}</span>
            ${item.label}
            ${item.badge ? `<span class="nav-badge" id="${item.badge}">0</span>` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }).join('');
}

// ── SALIR DEL MÓDULO (volver al selector) ────────────────
function exitModule() {
  activeModule = null;
  if (incidentTimerInterval) { clearInterval(incidentTimerInterval); incidentTimerInterval = null; }
  // Restaurar color de acento por defecto
  document.documentElement.style.setProperty('--accent', '#b2b2b2');
  document.documentElement.style.setProperty('--accent-light', 'rgba(178,178,178,0.1)');
  document.documentElement.style.setProperty('--accent-glow', 'rgba(178,178,178,0.2)');
  showModuleSelector();
}

// ── NAVEGACIÓN ───────────────────────────────────────────
function showPage(page) {
  currentPage = page;

  // Limpiar activo en nav-items
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById(`nav-${page}`);
  if (navEl) navEl.classList.add('active');

  const titles = {
    dashboard:       ['Dashboard',      'Panel de cumplimiento del módulo'],
    'my-tasks':      ['Mis Tareas',     'Gestión de tareas del departamento'],
    alerts:          ['Alertas',        'Notificaciones y alertas del sistema'],
    documents:       ['Documentos',     'Repositorio de documentos del área'],
    risks:           ['Riesgos',        'Riesgos internos identificados'],
    controls:        ['Checklists',     'Verificaciones y controles mensuales'],
    audits:          ['Auditorías',    'Revisiones internas programadas'],
    incidents:       ['Incidentes',     'Gestión de incidentes operativos'],
    reports:         ['Informes',       'Reportes y análisis de cumplimiento'],
    users:           ['Usuarios',       'Gestión de cuentas y accesos al sistema'],
    'legal-urgency': ['Tablero de Urgencia', 'Pipeline de vencimiento de contratos'],
    'legal-inbox':   ['Bandeja de Entrada', 'Facturas con cotización en espera de contrato'],
    contracts:       ['Contratos',      'Gestión del ciclo de vida de contratos'],
    invoices:        ['Ingreso de Facturas', 'Carga rápida y estado de cobranza'],
    cotizaciones:    ['Cotizaciones',   'Registro y seguimiento de cotizaciones'],
    relaciones:      ['Relaciones',     'Vínculos entre contratos y facturas'],
    planeacion:      ['Planeación',     'Deal Desk y registro de operaciones'],
  };

  const [title, sub] = titles[page] || [page, ''];
  document.getElementById('page-title').textContent = title;
  document.getElementById('page-sub').textContent = sub;

  if (page !== 'incidents' && incidentTimerInterval) {
    clearInterval(incidentTimerInterval);
    incidentTimerInterval = null;
  }

  const pc = document.getElementById('page-content');
  const pt = document.getElementById('page-treasury');
  const pp = document.getElementById('page-planning');
  
  if (page === 'treasury') {
    pc.style.display = 'none';
    pp.style.display = 'none';
    pt.style.display = 'block';
    renderTreasury();
    return;
  } else if (page === 'planning') {
    pc.style.display = 'none';
    pt.style.display = 'none';
    pp.style.display = 'block';
    renderPlanning();
    return;
  } else {
    pc.style.display = 'block';
    pt.style.display = 'none';
    pp.style.display = 'none';
    pc.innerHTML = '<div class="loading-state"><span class="spinner"></span> Cargando...</div>';
  }

  if (page === 'dashboard')       renderDashboard();
  else if (page === 'my-tasks')   renderMyTasks();
  else if (page === 'alerts')     renderAlerts();
  else if (page === 'documents')  renderDocuments();
  else if (page === 'risks')      renderRisks();
  else if (page === 'controls')   renderChecklists();
  else if (page === 'audits')     renderAudits();
  else if (page === 'incidents')  renderIncidents();
  else if (page === 'reports')    renderReports();
  else if (page === 'users')      renderUsers();
  else if (page === 'legal-urgency') renderLegalUrgency();
  else if (page === 'legal-inbox')   renderLegalInbox();
  else if (page === 'contracts')  renderContracts();
  else if (page === 'invoices')   renderInvoicesModule();
  else if (page === 'cotizaciones') renderCotizaciones();
  else if (page === 'relations')  renderRelationsModule();
  else if (page === 'relaciones') renderRelaciones();
  else if (page === 'treasury')   renderTreasury();
  else if (page === 'planning')   renderPlanning();
}

// ── SECCIÓN TOGGLE ───────────────────────────────────────
function toggleSection(section, forceOpen = null) {
  const submenu = document.getElementById(`${section}-submenu`);
  const chevron = document.getElementById(`${section}-chevron`);
  if (!submenu) return;
  const shouldOpen = forceOpen !== null ? forceOpen : !submenu.classList.contains('open');
  submenu.classList.toggle('open', shouldOpen);
  if (chevron) chevron.textContent = shouldOpen ? '▼' : '▶';
}

// ── BADGES ───────────────────────────────────────────────
async function loadBadges() {
  const dept = deptForModule(activeModule);
  const alertParam = dept ? `?department=${encodeURIComponent(dept)}` : '';
  const taskParam = dept ? `?department=${encodeURIComponent(dept)}&` : '?';

  const [alertsData, tasksData] = await Promise.all([
    api(`/api/alerts${alertParam}`),
    api(`/api/tasks${taskParam}status=pending`)
  ]);

  const unread = alertsData?.summary?.unreadCount ?? 0;
  const pending = tasksData?.length ?? 0;

  const badgeTasks = document.getElementById('badge-tasks');
  const badgeAlerts = document.getElementById('badge-alerts');
  const notifDot = document.getElementById('notif-dot');

  if (badgeTasks) badgeTasks.textContent = pending;
  if (badgeAlerts) badgeAlerts.textContent = unread;
  if (notifDot) notifDot.style.display = unread > 0 ? 'block' : 'none';
}

// ── MODALES ──────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ── UTILS ────────────────────────────────────────────────
function hide(id) { document.getElementById(id).style.display = 'none'; }
function show(id) {
  const el = document.getElementById(id);
  el.style.display = id === 'app' ? 'flex' : 'block';
}

function roleLabel(role) {
  return { admin: 'Administrador', manager: 'Gerente', user: 'Usuario' }[role] || role;
}

function deptForModule(modId) {
  const map = {
    legal: 'Legal', admin: 'Administración', tesoreria: 'Tesorería',
    contabilidad: 'Contabilidad', operaciones: 'Operaciones', rh: 'RH',
    facturacion: 'Facturación',
  };
  return map[modId] || null;
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function badge(level) {
  const map = { critical:'red', high:'orange', medium:'yellow', low:'green', info:'blue' };
  const labels = { critical:'Crítica', high:'Alta', medium:'Media', low:'Baja',
                   pending:'Pendiente', in_progress:'En Progreso', overdue:'Atrasada',
                   completed:'Completada', open:'Abierto', compliant:'Cumple',
                   partial:'Parcial', non_compliant:'No Cumple', planned:'Planificada' };
  const color = map[level] || 'gray';
  const label = labels[level] || level;
  return `<span class="badge badge-${color}">${label}</span>`;
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Ahora mismo';
  if (m < 60) return `Hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Hace ${h}h`;
  return `Hace ${Math.floor(h/24)}d`;
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' });
}

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── DASHBOARD ──────────────────────────────────────────────
async function renderDashboard() {
  const dept = deptForModule(activeModule);
  const pc = document.getElementById('page-content');
  
  const [tasksData, alertsData, checklistData] = await Promise.all([
    api(`/api/tasks${dept ? `?department=${encodeURIComponent(dept)}` : ''}`),
    api(`/api/alerts${dept ? `?department=${encodeURIComponent(dept)}` : ''}`),
    api('/api/checklists/pending')
  ]);

  const tasks = tasksData || [];
  const pendingCount = tasks.filter(t => t.status !== 'completed').length;
  const overdueCount = tasks.filter(t => t.status === 'overdue').length;
  const unreadAlerts = alertsData?.summary?.unreadCount || 0;
  
  const scoreVal = checklistData?.submitted ? checklistData.score : 75; // Dummy visual para presentación
  const checklistScore = checklistData?.submitted ? `${checklistData.score}%` : 'Pte.';
  const checklistColor = checklistData?.submitted ? (checklistData.score >= 80 ? 'var(--green)' : 'var(--orange)') : '#06b6d4';

  pc.innerHTML = `
    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 32px;">
      <div class="module-tile" style="--mod-color: ${checklistColor}; padding: 24px; animation: none; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <p style="color:var(--text2); font-size:0.8rem; font-weight:700; letter-spacing:0.05em; margin: 0 0 4px 0;">CUMPLIMIENTO MES</p>
          <h3 style="font-size:2rem; margin:0 0 16px 0; color:${checklistColor}">${checklistScore} <span style="font-size:1rem; color:var(--text3); font-weight:normal">${!checklistData?.submitted ? '(75% est.)' : ''}</span></h3>
        </div>
        <div style="width:100%; height:8px; background:var(--bg); border-radius:4px; overflow:hidden; box-shadow: inset 0 1px 3px rgba(0,0,0,0.2);">
          <div style="width:${scoreVal}%; height:100%; background:${checklistColor}; border-radius:4px; transition: width 1.5s ease-out;"></div>
        </div>
      </div>
      <div class="module-tile" style="--mod-color: var(--accent); padding: 24px; animation: none;">
        <h3 style="font-size:2rem; margin-bottom:8px">${pendingCount}</h3>
        <p style="color:var(--text2); font-size:0.8rem; font-weight:700; letter-spacing:0.05em">TAREAS PENDIENTES</p>
      </div>
      <div class="module-tile" style="--mod-color: ${overdueCount > 0 ? 'var(--red)' : 'var(--accent)'}; padding: 24px; animation: none;">
        <h3 style="font-size:2rem; margin-bottom:8px; color: ${overdueCount > 0 ? 'var(--red)' : 'inherit'}">${overdueCount}</h3>
        <p style="color:var(--text2); font-size:0.8rem; font-weight:700; letter-spacing:0.05em">TAREAS ATRASADAS</p>
      </div>
      <div class="module-tile" style="--mod-color: ${unreadAlerts > 0 ? 'var(--orange)' : 'var(--accent)'}; padding: 24px; animation: none;">
        <h3 style="font-size:2rem; margin-bottom:8px; color: ${unreadAlerts > 0 ? 'var(--orange)' : 'inherit'}">${unreadAlerts}</h3>
        <p style="color:var(--text2); font-size:0.8rem; font-weight:700; letter-spacing:0.05em">ALERTAS SIN LEER</p>
      </div>
    </div>
    
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px;">
      <h3>Tareas Recientes</h3>
      <button class="btn-ghost" onclick="showPage('my-tasks')">Ver todas</button>
    </div>
    
    ${tasks.length === 0 ? '<div class="empty-state">No hay tareas en este módulo</div>' : `
    <div class="data-table-wrapper">
      <table class="data-table">
        <thead><tr><th>Código</th><th>Título</th><th>Prioridad</th><th>Estado</th><th>Vencimiento</th></tr></thead>
        <tbody>
          ${tasks.slice(0, 5).map(t => `
            <tr>
              <td style="color:var(--text2)">${t.code}</td>
              <td style="font-weight:500">${t.title}</td>
              <td>${badge(t.priority)}</td>
              <td>${badge(t.status)}</td>
              <td>${fmtDate(t.dueDate)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`}
  `;
}

// ── TAREAS ───────────────────────────────────────────────
async function renderMyTasks() {
  const dept = deptForModule(activeModule);
  const pc = document.getElementById('page-content');
  const tasks = await api(`/api/tasks${dept ? `?department=${encodeURIComponent(dept)}` : ''}`) || [];

  pc.innerHTML = `
    <div style="display:flex; justify-content:flex-end; margin-bottom:16px;">
      <button class="btn-primary" onclick="openModal('modal-task')">+ Nueva Tarea</button>
    </div>
    ${tasks.length === 0 ? '<div class="empty-state">No hay tareas creadas</div>' : `
    <div class="data-table-wrapper">
      <table class="data-table">
        <thead><tr><th>Código</th><th>Título</th><th>Prioridad</th><th>Estado</th><th>Vencimiento</th><th>Acciones</th></tr></thead>
        <tbody>
          ${tasks.map(t => `
            <tr>
              <td style="color:var(--text2)">${t.code}</td>
              <td style="font-weight:500">${t.title}</td>
              <td>${badge(t.priority)}</td>
              <td>${badge(t.status)}</td>
              <td>${fmtDate(t.dueDate)}</td>
              <td>
                <button class="btn-ghost" onclick="toast('Detalles en la siguiente fase')">Ver</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`}
  `;
}

// ── ALERTAS ──────────────────────────────────────────────
async function renderAlerts() {
  const dept = deptForModule(activeModule);
  const pc = document.getElementById('page-content');
  const data = await api(`/api/alerts${dept ? `?department=${encodeURIComponent(dept)}` : ''}`);
  const alerts = data?.alerts || [];

  pc.innerHTML = alerts.length === 0 ? '<div class="empty-state">No hay alertas</div>' : `
    <div style="display:flex; flex-direction:column; gap:12px;">
      ${alerts.map(a => `
        <div style="background:var(--bg2); border:1px solid var(--border); border-left:4px solid var(--${a.type==='critical'?'red':a.type==='high'?'orange':'accent'}); border-radius:12px; padding:20px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="display:flex; gap:12px; margin-bottom:6px;">
              <h4 style="margin:0">${a.title}</h4>
              ${badge(a.type)}
            </div>
            <p style="color:var(--text2); font-size:0.9rem; margin:0">${a.message}</p>
          </div>
          <div style="text-align:right">
            <div style="font-size:0.8rem; color:var(--text3); margin-bottom:8px">${timeAgo(a.createdAt)}</div>
            ${!a.isRead ? `<button class="btn-ghost" onclick="toast('Marcada como leída'); showPage('alerts')">Marcar leída</button>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ── OTRAS PÁGINAS (Simuladas para Fase 4) ────────────────
async function renderDocuments() {
  document.getElementById('page-content').innerHTML = `
    <div class="empty-state">
      <div class="icon">📄</div>
      <h3>Repositorio Documental</h3>
      <p>Sube y administra políticas, manuales y evidencias de tu área.</p>
      <button class="btn-primary" style="margin-top:16px; width:auto" onclick="toast('Subida de archivos próximamente')">Subir Documento</button>
    </div>
  `;
}

async function renderRisks() {
  const pc = document.getElementById('page-content');
  const risks = await api('/api/risks') || [];

  pc.innerHTML = `
    <div style="display:flex; justify-content:flex-end; margin-bottom:16px;">
      <button class="btn-primary" onclick="openModal('modal-risk')">+ Nuevo Riesgo</button>
    </div>
    ${risks.length === 0 ? '<div class="empty-state">No hay riesgos identificados</div>' : `
    <div class="data-table-wrapper">
      <table class="data-table">
        <thead><tr><th>Riesgo</th><th>Nivel</th><th>Prob × Imp</th><th>Plan de Mitigación</th></tr></thead>
        <tbody>
          ${risks.map(r => `
            <tr>
              <td style="font-weight:500">${r.title}</td>
              <td>${badge(r.level)}</td>
              <td>${r.probability || 3} × ${r.impact || 3} = <strong>${(r.probability||3)*(r.impact||3)}</strong></td>
              <td style="color:var(--text2); font-size:0.85rem">${r.mitigation_plan || 'Sin plan'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`}
  `;
}

async function renderChecklists() {
  const pc = document.getElementById('page-content');
  const checklistData = await api('/api/checklists/pending');
  
  if (!checklistData) {
    pc.innerHTML = '<div class="empty-state">No hay checklists asignados a tu área.</div>';
    return;
  }

  const { template, period, submitted, score, items } = checklistData;

  if (submitted) {
    pc.innerHTML = `
      <div class="empty-state" style="border: 1px solid var(--accent); background: rgba(59, 130, 246, 0.05);">
        <div class="icon" style="color:var(--accent)">✅</div>
        <h3>Checklist de ${period} Enviado</h3>
        <p>Tu departamento ya cumplió con su reporte este mes. Calificación: <strong>${score}%</strong></p>
      </div>
    `;
    return;
  }

  window.currentChecklistData = checklistData;

  pc.innerHTML = `
    <div style="background:var(--bg2); padding:24px; border-radius:12px; max-width:800px; margin: 0 auto; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <h3 style="margin-top:0; margin-bottom:8px;">${template.title}</h3>
      <p style="color:var(--text2); font-size:0.9rem; margin-bottom:24px;">Periodo: <strong>${period}</strong>. ${template.description}</p>
      
      <form id="checklist-form" onsubmit="submitChecklist(event)">
        ${items.map((item, idx) => `
          <div style="margin-bottom:20px; padding-bottom:16px; border-bottom:1px solid var(--border);">
            <p style="margin: 0 0 12px 0; font-weight:500;">${idx + 1}. ${item.question}</p>
            <div style="display:flex; gap:16px; margin-bottom:8px;">
              <label><input type="radio" name="item_${item.id}" value="yes" required> Sí</label>
              <label><input type="radio" name="item_${item.id}" value="no" required> No</label>
              <label><input type="radio" name="item_${item.id}" value="na" required> N/A</label>
            </div>
            ${item.requiresEvidence ? `
              <div style="margin-top:8px;">
                <label style="font-size:0.8rem; color:var(--text2); display:block; margin-bottom:4px;">* Adjuntar Evidencia Requerida</label>
                <input type="file" name="evidence_${item.id}" style="font-size:0.85rem;" required>
              </div>
            ` : ''}
            <input type="text" name="notes_${item.id}" placeholder="Comentarios opcionales..." style="width:100%; margin-top:8px; background:var(--bg); border:1px solid var(--border); color:white; padding:6px; border-radius:4px;">
          </div>
        `).join('')}
        
        <div style="text-align:right; margin-top:24px;">
          <button type="submit" class="btn-primary">Enviar Checklist</button>
        </div>
      </form>
    </div>
  `;
}

async function submitChecklist(e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const items = window.currentChecklistData.items;
  
  const answers = items.map(item => ({
    item_id: item.id,
    value: formData.get(`item_${item.id}`),
    notes: formData.get(`notes_${item.id}`) || null
  }));

  const payload = {
    template_id: window.currentChecklistData.template.id,
    answers: answers
  };

  const res = await api('/api/checklists/submit', { method: 'POST', body: JSON.stringify(payload) });
  if (res) {
    toast(`Checklist enviado. Calificación: ${res.score}%`, 'success');
    showPage('controls'); // Recargar para mostrar estado enviado
  }
}

async function renderAudits() {
  const pc = document.getElementById('page-content');
  const audits = await api('/api/audits') || [];
  
  pc.innerHTML = `
    <div style="display:flex; justify-content:flex-end; margin-bottom:16px;">
      ${currentUser.role === 'admin' ? `<button class="btn-primary" onclick="toast('Creación en panel admin')">+ Programar Auditoría</button>` : ''}
    </div>
    ${audits.length === 0 ? '<div class="empty-state">No hay auditorías programadas</div>' : `
    <div class="data-table-wrapper">
      <table class="data-table">
        <thead><tr><th>Título</th><th>Tipo</th><th>Framework</th><th>Auditor</th><th>Fecha</th><th>Estado</th></tr></thead>
        <tbody>
          ${audits.map(a => `
            <tr>
              <td style="font-weight:500">${a.title}</td>
              <td style="text-transform:capitalize">${a.type}</td>
              <td>${a.framework ? a.framework.shortName : 'N/A'}</td>
              <td>${a.auditorName || 'Sin asignar'}</td>
              <td>${fmtDate(a.scheduledDate)}</td>
              <td>${badge(a.status)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`}
  `;
}

async function renderIncidents() {
  const pc = document.getElementById('page-content');
  const data = await api('/api/incidents');
  const incidents = data?.incidents || [];

  pc.innerHTML = `
    <div style="display:flex; justify-content:flex-end; margin-bottom:16px;">
      <button class="btn-primary" onclick="openModal('modal-incident')">+ Registrar Incidente</button>
    </div>
    ${incidents.length === 0 ? '<div class="empty-state">No hay incidentes reportados</div>' : `
    <div class="data-table-wrapper">
      <table class="data-table">
        <thead><tr><th>Código</th><th>Título</th><th>Estado</th><th>Detección</th><th>Plazo Legal</th></tr></thead>
        <tbody>
          ${incidents.map(i => `
            <tr>
              <td style="color:var(--text2)">${i.code}</td>
              <td style="font-weight:500">${i.title}</td>
              <td>${badge(i.status)}</td>
              <td>${fmtDate(i.detectedAt)}</td>
              <td style="color: ${new Date(i.legalDeadline) < new Date() ? 'var(--red)' : 'var(--orange)'}; font-weight:600">
                ${fmtDate(i.legalDeadline)}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`}
  `;
}

async function renderReports() {
  const pc = document.getElementById('page-content');
  const dept = deptForModule(activeModule);
  const data = await api(`/api/department-reports/period-status${dept ? `?department=${encodeURIComponent(dept)}` : ''}`);
  
  if (!data) {
    pc.innerHTML = '<div class="empty-state">No se pudo cargar la matriz de cumplimiento.</div>';
    return;
  }
  
  window._currentMatrixData = data;
  
  let html = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 24px;">
    <h2>Matriz de Cumplimiento ${data.year}</h2>
    ${currentUser.role === 'admin' ? `<button class="btn-primary" onclick="toast('Generando PDF...')">Descargar Resumen</button>` : ''}
  </div>`;

  html += `<div class="data-table-wrapper" style="overflow-x: auto;">
    <table class="data-table" style="min-width: 1000px;">
      <thead>
        <tr>
          <th>Área</th>
          ${['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'].map(m => `<th>${m}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${data.matrix.map(row => `
          <tr>
            <td style="font-weight:600;">${row.department}</td>
            ${row.months.map(m => {
              if (m.isFuture) return `<td style="color:var(--text3); font-size:0.8rem; text-align:center;">—</td>`;
              
              let badgeHtml = '';
              if (m.status === 'complete') badgeHtml = '<span class="badge badge-green" style="padding:2px 6px; font-size:0.7rem; cursor:pointer;" onclick="openPeriodDetails(\\''+row.department+'\\', '+m.month+')">✔ Completo</span>';
              else if (m.status === 'partial') badgeHtml = '<span class="badge badge-orange" style="padding:2px 6px; font-size:0.7rem; cursor:pointer;" onclick="openPeriodDetails(\\''+row.department+'\\', '+m.month+')">! Parcial</span>';
              else badgeHtml = '<span class="badge badge-red" style="padding:2px 6px; font-size:0.7rem; cursor:pointer;" onclick="openPeriodDetails(\\''+row.department+'\\', '+m.month+')">✘ Pendiente</span>';
              
              return `<td style="text-align:center;">${badgeHtml}</td>`;
            }).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>`;
  
  if (!document.getElementById('modal-period-details')) {
    const modalHtml = `
      <div id="modal-period-details" class="modal">
        <div class="modal-content" style="max-width: 600px;">
          <h2 id="period-details-title" style="margin-top:0">Detalles del Periodo</h2>
          <div id="period-details-body" style="margin-top: 16px; margin-bottom: 24px; color:var(--text2)">
             Cargando...
          </div>
          <div style="text-align:right">
             <button type="button" class="btn-ghost" onclick="closeModal('modal-period-details')">Cerrar</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  pc.innerHTML = html;
}

window.openPeriodDetails = function(dept, month) {
  const data = window._currentMatrixData;
  const row = data.matrix.find(r => r.department === dept);
  const mData = row.months.find(m => m.month === month);
  
  document.getElementById('period-details-title').textContent = `${dept} - ${mData.monthName} ${data.year}`;
  
  let reportHtml = '<p style="color:var(--red); margin: 0 0 10px 0;">✘ No hay reporte de área cargado.</p>';
  if (mData.report) {
     let dlBtn = '';
     if (mData.report.evidence) {
         dlBtn = `<button class="btn-ghost" style="padding: 4px 8px; font-size: 0.8rem; margin-top: 5px;" onclick="downloadFileSecure('${API}${mData.report.evidence.file_path}', '${mData.report.evidence.file_name}')">📥 Descargar Reporte</button>`;
     }
     reportHtml = `<p style="color:var(--green); margin: 0 0 5px 0;">✔ Reporte cargado.</p> ${dlBtn}`;
  }
  
  let kpiHtml = '<p style="color:var(--red); margin: 0 0 10px 0;">✘ No hay evaluación de KPIs.</p>';
  if (mData.kpiEval) {
     let dlBtn = '';
     if (mData.kpiEval.evidence) {
         dlBtn = `<button class="btn-ghost" style="padding: 4px 8px; font-size: 0.8rem; margin-top: 5px;" onclick="downloadFileSecure('${API}${mData.kpiEval.evidence.file_path}', '${mData.kpiEval.evidence.file_name}')">📥 Descargar KPIs</button>`;
     }
     kpiHtml = `<p style="color:var(--green); margin: 0 0 5px 0;">✔ Evaluación cargada (Score: ${mData.kpiEval.globalScore}%).</p> ${dlBtn}`;
  }
  
  document.getElementById('period-details-body').innerHTML = `
    <div style="background:var(--bg2); padding:16px; border-radius:8px; border:1px solid var(--border); margin-bottom:12px;">
      <h4 style="margin: 0 0 8px 0; color:white;">Reporte de Área</h4>
      ${reportHtml}
    </div>
    <div style="background:var(--bg2); padding:16px; border-radius:8px; border:1px solid var(--border);">
      <h4 style="margin: 0 0 8px 0; color:white;">Evaluación de KPIs</h4>
      ${kpiHtml}
    </div>
  `;
  
  openModal('modal-period-details');
};

async function downloadFileSecure(url, fileName) {
  try {
    const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
    if (!res.ok) throw new Error('Error en descarga');
    const blob = await res.blob();
    const urlBlob = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = urlBlob;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(urlBlob);
  } catch (e) {
    toast('No se pudo descargar el archivo', 'error');
  }
}

window.toggleSidebar = function() {
  const sidebar = document.getElementById('main-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.toggle('open');
  if (overlay) overlay.classList.toggle('open');
};

// ── UTILIDADES PARA MODALES ──────────────────────────────
function updateRiskScore() {
  const p = document.getElementById('risk-prob').value;
  const i = document.getElementById('risk-impact').value;
  document.getElementById('risk-prob-val').textContent = p;
  document.getElementById('risk-impact-val').textContent = i;
  document.getElementById('risk-score-preview').textContent = p * i;
}

async function submitTask() {
  const title = document.getElementById('task-title').value.trim();
  if (!title) return toast('El título es requerido', 'error');

  const payload = {
    title,
    priority: document.getElementById('task-priority').value,
    due_date: document.getElementById('task-due').value || null,
    description: document.getElementById('task-desc').value || null,
    requires_evidence: document.getElementById('task-requires-doc').checked,
    department: deptForModule(activeModule) || null,
    assignee_user_id: currentUser.id
  };

  const res = await api('/api/tasks', { method: 'POST', body: JSON.stringify(payload) });
  if (res) {
    closeModal('modal-task');
    toast('Tarea creada con éxito');
    
    // Limpiar formulario
    document.getElementById('task-title').value = '';
    document.getElementById('task-due').value = '';
    document.getElementById('task-desc').value = '';
    document.getElementById('task-requires-doc').checked = false;
    
    setTimeout(() => showPage('my-tasks'), 500);
  }
}

async function submitRisk() {
  const title = document.getElementById('risk-title').value.trim();
  if (!title) return toast('El título es requerido', 'error');

  const payload = {
    title,
    level: document.getElementById('risk-level').value,
    probability: parseInt(document.getElementById('risk-prob').value),
    impact: parseInt(document.getElementById('risk-impact').value),
    description: document.getElementById('risk-desc').value || null,
    mitigation_plan: document.getElementById('risk-mitigation').value || null,
    owner_user_id: currentUser.id
  };

  const res = await api('/api/risks', { method: 'POST', body: JSON.stringify(payload) });
  if (res) {
    closeModal('modal-risk');
    toast('Riesgo registrado');
    document.getElementById('risk-title').value = '';
    document.getElementById('risk-desc').value = '';
    document.getElementById('risk-mitigation').value = '';
    setTimeout(() => showPage('risks'), 500);
  }
}

async function submitIncident() {
  const title = document.getElementById('inc-title').value.trim();
  if (!title) return toast('El título es requerido', 'error');

  const payload = {
    title,
    description: document.getElementById('inc-desc').value || null,
    detected_at: document.getElementById('inc-detected').value || null,
    legal_deadline: document.getElementById('inc-deadline').value || null,
    responsible_user_id: currentUser.id
  };

  const res = await api('/api/incidents', { method: 'POST', body: JSON.stringify(payload) });
  if (res) {
    closeModal('modal-incident');
    toast('Incidente reportado exitosamente', 'warning');
    document.getElementById('inc-title').value = '';
    document.getElementById('inc-desc').value = '';
    document.getElementById('inc-detected').value = '';
    document.getElementById('inc-deadline').value = '';
    setTimeout(() => showPage('incidents'), 500);
  }
}


// ── TABLERO LEGAL DE URGENCIA ──────────────────────────────────
async function renderLegalUrgency() {
  const pc = document.getElementById('page-content');
  const data = await api('/api/contracts/urgency');
  if (!data) { pc.innerHTML = '<div class="empty-state">Error cargando el tablero</div>'; return; }

  const { board, stages, kpis } = data;

  const stageColors = {
    hecho: '#6366f1', jc_carlos: '#8b5cf6', cliente: '#06b6d4',
    recolector: '#10b981', firmas: '#f59e0b', notaria: '#f97316', optimal: '#10b981',
  };

  const countdownHtml = (c) => {
    if (c.stage === 'optimal') return `<span class="countdown complete">✅ Completado</span>`;
    const d = c.daysRemaining;
    if (d === null) return '';
    const cls = d <= 0 ? 'urgent' : d <= 3 ? 'warning' : 'ok';
    const txt = d <= 0 ? `⏰ Vencido (${Math.abs(d)}d)` : `⌛ ${d}d restantes`;
    return `<span class="countdown ${cls}">${txt}</span>`;
  };

  const cardHtml = (c) => `
    <div class="contract-card card-${c.urgencyLevel}" title="${c.title}" data-id="${c.id}">
      <div class="cc-code">${c.code}</div>
      <div class="cc-title">${c.title}</div>
      <div class="cc-client">🏢 ${c.clientName || 'Sin cliente'}</div>
      
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        ${countdownHtml(c)}
        <div style="display:flex; gap: 4px; font-size: 0.9rem;">
          ${c.hasInvoice ? '<span title="Factura">🧾</span>' : '<span style="filter:grayscale(1); opacity:0.3" title="Falta Factura">🧾</span>'}
          ${c.hasQuote ? '<span title="Cotización">📝</span>' : '<span style="filter:grayscale(1); opacity:0.3" title="Falta Cotización">📝</span>'}
          ${c.evidences && c.evidences.length > 0 ? '<span title="Materialidad">📁</span>' : '<span style="filter:grayscale(1); opacity:0.3" title="Falta Materialidad">📁</span>'}
        </div>
      </div>
      
      <div style="display:flex; gap:4px;">
        <button class="cc-advance-btn" style="flex:1" onclick="viewContractTimeline(${c.id})">🕒 Hist</button>
        <button class="cc-advance-btn" style="flex:1" onclick="editContract(${c.id})">✏️ Editar</button>
      </div>
    </div>
  `;

  pc.innerHTML = `
    <!-- KPIs -->
    <div class="pipeline-kpis">
      <div class="pipeline-kpi" style="--kpi-color:var(--red)">
        <div class="kpi-val">${kpis.urgentToday}</div>
        <div class="kpi-label">Vencidos hoy</div>
      </div>
      <div class="pipeline-kpi" style="--kpi-color:var(--orange)">
        <div class="kpi-val">${kpis.due3Days}</div>
        <div class="kpi-label">Vencen en 3 días</div>
      </div>
      <div class="pipeline-kpi" style="--kpi-color:#f97316">
        <div class="kpi-val">${kpis.inNotaria}</div>
        <div class="kpi-label">En notaría</div>
      </div>
      <div class="pipeline-kpi" style="--kpi-color:var(--green)">
        <div class="kpi-val">${kpis.inOptimal}</div>
        <div class="kpi-label">Óptimal activos</div>
      </div>
      <div class="pipeline-kpi" style="--kpi-color:var(--gray)">
        <div class="kpi-val">${kpis.completed}</div>
        <div class="kpi-label">Completados</div>
      </div>
    </div>

    <!-- Acciones -->
    <div style="display:flex; justify-content:flex-end; margin-bottom:16px; gap:12px;">
      <button class="btn-ghost" onclick="showPage('contracts')">📝 Lista completa</button>
      <button class="btn-primary" style="width:auto" onclick="openNewContractModal()">+ Nuevo Contrato</button>
    </div>

    <!-- Tablero Kanban -->
    <div class="pipeline-board">
      ${stages.map(s => `
        <div class="pipeline-col ${s.id === 'optimal' ? 'col-optimal' : ''}">
          <div class="pipeline-col-header" style="--col-color:${stageColors[s.id] || '#6366f1'}">
            <div>
              <div class="col-name">${s.label}</div>
              ${s.maxDays ? `<div class="col-days">⏱ máx. ${s.maxDays === 90 ? '3 meses' : s.maxDays + 'd'}</div>` : ''}
            </div>
            <span class="col-count" style="background:${stageColors[s.id] || '#6366f1'}">${s.count}</span>
          </div>
          <div class="pipeline-col-body" data-stage="${s.id}">
            ${(board[s.id] || []).length === 0
              ? `<div class="pipeline-col-empty">Sin contratos</div>`
              : (board[s.id] || []).map(c => cardHtml(c)).join('')
            }
          </div>
        </div>
      `).join('')}
    </div>
  `;

  // Inicializar Sortable Drag & Drop en cada columna
  document.querySelectorAll('.pipeline-col-body').forEach(col => {
    new Sortable(col, {
      group: 'kanban',
      animation: 150,
      ghostClass: 'sortable-ghost',
      dragClass: 'sortable-drag',
      onEnd: async (evt) => {
        const item = evt.item;
        const toCol = evt.to;
        const newStage = toCol.getAttribute('data-stage');
        const contractId = item.getAttribute('data-id');
        
        if (evt.from === evt.to) return; // Mismo lugar
        
        // Actualización silenciosa en background
        const res = await api(`/api/contracts/${contractId}/stage`, {
          method: 'PUT',
          body: JSON.stringify({ stage: newStage })
        });
        
        if (res) {
          toast('Contrato movido a ' + res.stageLabel, 'success');
          setTimeout(() => renderLegalUrgency(), 300);
        } else {
          toast('Error al mover contrato', 'error');
          renderLegalUrgency(); // Revertir visualmente
        }
      }
    });
  });
}

async function viewContractTimeline(id) {
  const logs = await api(`/api/contracts/${id}/logs`);
  if (!logs) return;
  
  const container = document.getElementById('timeline-container');
  if (logs.length === 0) {
    container.innerHTML = '<div class="empty-state">No hay historial aún</div>';
  } else {
    container.innerHTML = logs.map(l => {
      const date = new Date(l.createdAt).toLocaleString('es-MX', {dateStyle:'short', timeStyle:'short'});
      const isCreate = l.action === 'created';
      return `
        <div class="timeline-item">
          <div class="timeline-dot" style="background: ${isCreate ? 'var(--blue)' : 'var(--accent)'}"></div>
          <div class="timeline-date">${date}</div>
          <div class="timeline-action">${isCreate ? 'Contrato Creado' : 'Cambio de Etapa'}</div>
          <div class="timeline-desc">${l.description}</div>
          <div class="timeline-user">👤 ${l.userFullName}</div>
        </div>
      `;
    }).join('');
  }
  openModal('modal-timeline');
}

function openNewContractModal() {
  window.currentContractId = null;
  document.getElementById('ct-title').value = '';
  document.getElementById('ct-client').value = '';
  document.getElementById('ct-done-at').value = new Date().toISOString().split('T')[0];
  document.getElementById('ct-notaria-months').value = 3;
  document.getElementById('ct-notes').value = '';
  document.getElementById('ct-evidences-list').innerHTML = '';
  openModal('modal-contract');
}

async function submitContract() {
  const title = document.getElementById('ct-title').value.trim();
  if (!title) return toast('El título es requerido', 'error');

  const payload = {
    title,
    client_name: document.getElementById('ct-client').value.trim() || null,
    contract_done_at: document.getElementById('ct-done-at').value || null,
    notaria_months: parseInt(document.getElementById('ct-notaria-months').value) || 3,
    notes: document.getElementById('ct-notes').value || null,
  };

  if (window._pendingInvoiceIdForContract) {
    payload.invoice_id = window._pendingInvoiceIdForContract;
  }

  // Si ya existe ID, hacemos PUT
  if (window.currentContractId) {
    const res = await api(`/api/contracts/${window.currentContractId}`, { method: 'PUT', body: JSON.stringify(payload) });
    if (res) {
      toast("Contrato actualizado", "success");
      closeModal('modal-contract');
      renderContracts();
    }
    return;
  }

  const res = await api('/api/contracts', { method: 'POST', body: JSON.stringify(payload) });
  if (res) {
    closeModal('modal-contract');
    toast(`Contrato ${res.code} creado`, 'success');
    document.getElementById('ct-title').value = '';
    document.getElementById('ct-client').value = '';
    document.getElementById('ct-notes').value = '';
    
    if (window._pendingInvoiceIdForContract) {
      window._pendingInvoiceIdForContract = null;
      renderLegalInbox();
    } else {
      renderContracts();
    }
  }
}

async function editContract(id) {
  const ct = await api(`/api/contracts/${id}`);
  if(!ct) return;
  
  window.currentContractId = id;
  document.getElementById('ct-title').value = ct.title;
  document.getElementById('ct-client').value = ct.clientName || '';
  
  if (ct.contractDoneAt) {
    document.getElementById('ct-done-at').value = ct.contractDoneAt.split('T')[0];
  } else {
    document.getElementById('ct-done-at').value = '';
  }
  
  document.getElementById('ct-notaria-months').value = ct.notariaMonths || 3;
  document.getElementById('ct-notes').value = ct.notes || '';
  
  renderEvidencesList(ct.evidences || [], 'ct-evidences-list');
  openModal('modal-contract');
}

// ── LISTA COMPLETA DE CONTRATOS ─────────────────────────────────
async function renderContracts() {
  const pc = document.getElementById('page-content');
  const data = await api('/api/contracts');
  const contracts = data?.contracts || [];

  const stageBadgeColor = {
    hecho: 'blue', jc_carlos: 'blue', cliente: 'yellow',
    recolector: 'yellow', firmas: 'orange', notaria: 'orange', optimal: 'green'
  };

  pc.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
      <div style="color:var(--text2); font-size:0.9rem;">${contracts.length} contratos activos</div>
      <div style="display:flex; gap:10px;">
        <button class="btn-ghost" onclick="showPage('legal-urgency')">🚨 Tablero</button>
        <button class="btn-primary" style="width:auto" onclick="openNewContractModal()">+ Nuevo</button>
      </div>
    </div>
    ${contracts.length === 0 ? '<div class="empty-state"><div class="icon">📝</div><h3>No hay contratos</h3><p>Crea tu primer contrato para comenzar el pipeline.</p></div>' : `
    <div class="data-table-wrapper">
      <table class="data-table">
        <thead><tr><th>Código</th><th>Contrato</th><th>Cliente</th><th>Etapa</th><th>Días restantes</th><th>Acciones</th></tr></thead>
        <tbody>
          ${contracts.map(c => `
            <tr>
              <td style="color:var(--text2); font-size:0.8rem">${c.code}</td>
              <td style="font-weight:500">${c.title}</td>
              <td style="color:var(--text2)">${c.clientName || '—'}</td>
              <td>${badge(stageBadgeColor[c.stage] || 'gray')}<span style="margin-left:6px; font-size:0.82rem">${c.stageLabel}</span></td>
              <td style="color:${c.daysRemaining <= 0 ? 'var(--red)' : c.daysRemaining <= 3 ? 'var(--orange)' : 'var(--text2)'}">
                ${c.stage === 'optimal' ? '✅' : c.daysRemaining !== null ? `${c.daysRemaining}d` : '—'}
              </td>
              <td>
                <button class="btn-ghost" style="padding:6px 12px; font-size:0.8rem"
                  onclick="viewContractTimeline(${c.id})">🕒 Historial</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`}
  `;
}

// ── MÓDULO FACTURACIÓN ──────────────────────────────────────────
async function renderInvoicesModule() {
  const pc = document.getElementById('page-content');
  const [statsData, listData] = await Promise.all([
    api('/api/invoices/stats'),
    api('/api/invoices?tipo=factura'),
  ]);
  const stats = statsData || {};
  const invoices = listData?.invoices || [];

  const statusColor = {
    active: 'blue',
    draft: 'gray',
    pending_legal: 'orange',
    approved: 'green',
    pending: 'yellow'
  };

  const ppdInvoices = invoices.filter(i => i.paymentMethod === 'PPD' && i.paymentStatus !== 'paid');

  pc.innerHTML = `
    <!-- Stats -->
    <div class="invoice-stats">
      <div class="invoice-stat" style="--stat-color:var(--red)">
        <div class="stat-val">${stats.blocked ?? 0}</div>
        <div class="stat-label">Sin contrato</div>
      </div>
      <div class="invoice-stat" style="--stat-color:var(--orange)">
        <div class="stat-val">${stats.pending ?? 0}</div>
        <div class="stat-label">Pendientes</div>
      </div>
      <div class="invoice-stat" style="--stat-color:var(--green)">
        <div class="stat-val">${stats.approved ?? 0}</div>
        <div class="stat-label">Aprobadas</div>
      </div>
      <div class="invoice-stat" style="--stat-color:#a78bfa">
        <div class="stat-val">${stats.withMaterialidad ?? 0}</div>
        <div class="stat-label">Materialidad</div>
      </div>
      <div class="invoice-stat" style="--stat-color:var(--accent)">
        <div class="stat-val">${stats.total ?? 0}</div>
        <div class="stat-label">Total facturas</div>
      </div>
    </div>

    <div style="display:flex; justify-content:flex-end; margin-bottom:16px; gap:10px;">
      <button class="btn-primary" style="width:auto" onclick="openInvoiceModal()">+ Nueva Factura</button>
    </div>

    ${invoices.length === 0
      ? '<div class="empty-state"><div class="icon">🧾</div><h3>No hay facturas</h3><p>Crea una nueva factura para comenzar.</p></div>'
      : `<div class="data-table-wrapper">
          <table class="data-table">
            <thead><tr><th>Folio / ID</th><th>Cliente / Emisora</th><th>Descripción</th><th>Monto</th><th>Contrato</th><th>Estado</th><th>Compliance</th><th>Acción</th></tr></thead>
            <tbody>
              ${invoices.map(inv => `
                <tr>
                  <td>
                    <div style="font-weight:600">${inv.folio_xml || '—'}</div>
                    <div style="color:var(--text2); font-size:0.75rem">${inv.code}</div>
                  </td>
                  <td>
                    <div style="font-weight:500">${inv.client_name || '—'}</div>
                    <div style="color:var(--text2); font-size:0.75rem">${inv.issuer_name || '—'}</div>
                  </td>
                  <td style="font-weight:500">${inv.title}</td>
                  <td style="color:var(--green)">${inv.amount != null ? '$' + inv.amount.toLocaleString('es-MX', {minimumFractionDigits:2}) : '—'}</td>
                  <td>
                    ${inv.contract
                      ? `<span style="font-size:0.8rem; color:var(--text2)">${inv.contract.code}</span>`
                      : '<span class="badge-blocked">⛔ Sin contrato</span>'}
                  </td>
                  <td>${badge(statusColor[inv.status] || 'gray')}</td>
                  <td>
                    <div style="display:flex; gap: 8px; align-items: center;">
                      ${inv.hasQuote ? '<span title="Cotización" style="font-size: 1.1rem">📝</span>' : '<span title="Falta Cotización" style="font-size: 1.1rem; filter: grayscale(1); opacity: 0.3">📝</span>'}
                      ${inv.evidences && inv.evidences.length > 0 ? '<span title="Materialidad (' + inv.evidences.length + ')" style="font-size: 1.1rem">📁</span>' : '<span title="Falta Materialidad" style="font-size: 1.1rem; filter: grayscale(1); opacity: 0.3">📁</span>'}
                    </div>
                  </td>
                  <td>
                    <button class="btn-ghost" style="padding: 4px; font-size: 0.8rem;" onclick="editInvoice(${inv.id})">✏️ Editar</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`
    }
  `;
}

// ── MÓDULO RELACIONES PPD ──────────────────────────────────────────
async function renderRelationsModule() {
  const pc = document.getElementById('page-content');
  const listData = await api('/api/invoices?tipo=factura');
  const invoices = listData?.invoices || [];

  const ppdInvoices = invoices.filter(i => i.paymentMethod === 'PPD' && i.paymentStatus !== 'paid');

  const ppdHtml = ppdInvoices.length === 0 
    ? '<div class="empty-state"><div class="icon">🔗</div><h3>No hay PPD</h3><p>No hay facturas PPD pendientes de pago.</p></div>' 
    : `<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;">
        ${ppdInvoices.map(i => {
          let daysDiff = 0;
          if (i.dueDate) {
            const diff = new Date(i.dueDate) - new Date();
            daysDiff = Math.ceil(diff / (1000 * 60 * 60 * 24));
          } else {
            const diff = new Date() - new Date(i.createdAt);
            daysDiff = -Math.ceil(diff / (1000 * 60 * 60 * 24));
          }
          const isDanger = daysDiff <= 0;
          const isWarning = daysDiff > 0 && daysDiff <= 5;
          const cls = isDanger ? 'alert-danger' : isWarning ? 'alert-warning' : 'alert-safe';
          const borderColor = isDanger ? 'var(--red)' : isWarning ? 'var(--orange)' : 'var(--green)';
          const text = isDanger ? 'Vencida' : `${daysDiff}d restantes`;

          return `
            <div class="card" style="border-left: 4px solid ${borderColor}; padding: 16px;">
              <div style="display:flex; justify-content:space-between; margin-bottom: 8px;">
                <span style="font-weight: 600; font-size: 0.9rem;">${i.code}</span>
                <span class="badge ${cls}">${text}</span>
              </div>
              <div style="font-size: 0.85rem; color: var(--text2); margin-bottom: 12px; line-height: 1.4;">${i.title}</div>
              <div style="font-size: 1.2rem; font-weight: 600;">$${(i.amount || 0).toLocaleString('es-MX', {minimumFractionDigits:2})}</div>
            </div>
          `;
        }).join('')}
      </div>`;

  pc.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
      <h2><span class="icon">🔗</span> Relaciones PPD</h2>
    </div>
    ${ppdHtml}
  `;
}

async function openInvoiceModal() {
  // Cargar contratos activos para el dropdown
  const data = await api('/api/contracts?status=active');
  const contracts = data?.contracts || [];
  const sel = document.getElementById('inv-contract');
  sel.innerHTML = `<option value="">— Sin contrato (bloqueada) —</option>` +
    contracts.map(c => `<option value="${c.id}">${c.code} — ${c.title}</option>`).join('');
    
  window.currentInvoiceId = null;
  document.getElementById('inv-folio').value = '';
  document.getElementById('inv-client').value = '';
  document.getElementById('inv-issuer').value = '';
  document.getElementById('inv-title').value = '';
  document.getElementById('inv-amount').value = '';
  document.getElementById('inv-has-quote').checked = false;
  document.getElementById('inv-notes').value = '';
  document.getElementById('inv-evidences-list').innerHTML = '';
  
  openModal('modal-invoice');
}

async function editInvoice(id) {
  const inv = await api(`/api/invoices/${id}`);
  if(!inv) return;
  
  window.currentInvoiceId = id;
  document.getElementById('inv-folio').value = inv.folio_xml || '';
  document.getElementById('inv-client').value = inv.client_name || '';
  document.getElementById('inv-issuer').value = inv.issuer_name || '';
  document.getElementById('inv-title').value = inv.title;
  document.getElementById('inv-amount').value = inv.amount || '';
  document.getElementById('inv-tipo').value = inv.tipo;
  
  const data = await api('/api/contracts?status=active');
  const contracts = data?.contracts || [];
  const sel = document.getElementById('inv-contract');
  sel.innerHTML = `<option value="">— Sin contrato (bloqueada) —</option>` +
    contracts.map(c => `<option value="${c.id}" ${c.id === inv.contractId ? 'selected' : ''}>${c.code} — ${c.title}</option>`).join('');
    
  document.getElementById('inv-has-quote').checked = inv.hasQuote;
  document.getElementById('inv-notes').value = inv.notes || '';
  
  renderEvidencesList(inv.evidences || [], 'inv-evidences-list');
  openModal('modal-invoice');
}

async function submitInvoice() {
  const title = document.getElementById('inv-title').value.trim();
  if (!title) return toast('El título es requerido', 'error');

  const contractId = document.getElementById('inv-contract').value;
  const payload = {
    title,
    folio_xml: document.getElementById('inv-folio').value.trim() || null,
    client_name: document.getElementById('inv-client').value.trim() || null,
    issuer_name: document.getElementById('inv-issuer').value.trim() || null,
    tipo: document.getElementById('inv-tipo').value,
    amount: parseFloat(document.getElementById('inv-amount').value) || null,
    contract_id: contractId ? parseInt(contractId) : null,
    has_quote: document.getElementById('inv-has-quote').checked,
    notes: document.getElementById('inv-notes').value || null,
  };

  // Si ya existe ID, hacemos PUT
  if (window.currentInvoiceId) {
    const res = await api(`/api/invoices/${window.currentInvoiceId}`, { method: 'PUT', body: JSON.stringify(payload) });
    if (res) {
      toast("Factura actualizada", "success");
      closeModal('modal-invoice');
      renderInvoicesModule();
    }
    return;
  }

  const res = await api('/api/invoices', { method: 'POST', body: JSON.stringify(payload) });
  if (res) {
    closeModal('modal-invoice');
    if (res.isBlocked) {
      toast(`${res.code} creada — ⛔ Bloqueada (sin contrato)`, 'warning');
    } else {
      toast(`${res.code} creada exitosamente`, 'success');
    }
    document.getElementById('inv-title').value = '';
    document.getElementById('inv-amount').value = '';
    document.getElementById('inv-notes').value = '';
    document.getElementById('inv-materialidad').checked = false;
    setTimeout(() => showPage('invoices'), 400);
  }
}

// ── COTIZACIONES ────────────────────────────────────────────────
async function renderCotizaciones() {
  const pc = document.getElementById('page-content');
  const data = await api('/api/invoices?tipo=cotizacion');
  const cotizaciones = data?.invoices || [];

  pc.innerHTML = `
    <div style="display:flex; justify-content:flex-end; margin-bottom:16px;">
      <button class="btn-primary" style="width:auto" onclick="openInvoiceModal()">+ Nueva Cotización</button>
    </div>
    ${cotizaciones.length === 0
      ? '<div class="empty-state"><div class="icon">💼</div><h3>No hay cotizaciones</h3><p>Las cotizaciones aparecen aquí una vez creadas.</p></div>'
      : `<div class="data-table-wrapper">
          <table class="data-table">
            <thead><tr><th>Código</th><th>Descripción</th><th>Monto</th><th>Contrato vinculado</th><th>Estado</th></tr></thead>
            <tbody>
              ${cotizaciones.map(c => `
                <tr>
                  <td style="color:var(--text2); font-size:0.8rem">${c.code}</td>
                  <td style="font-weight:500">${c.title}</td>
                  <td>${c.amount != null ? '$' + c.amount.toLocaleString('es-MX', {minimumFractionDigits:2}) : '—'}</td>
                  <td>${c.contract ? `<span style="font-size:0.82rem">${c.contract.code} — ${c.contract.title}</span>` : '<span class="badge-blocked">⛔ Sin contrato</span>'}</td>
                  <td>${badge(c.isBlocked ? 'red' : 'green')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`
    }
  `;
}

// ── RELACIONES (Contratos ↔ Facturas) ─────────────────────────────
async function renderRelaciones() {
  const pc = document.getElementById('page-content');
  const [contractsData, invoicesData] = await Promise.all([
    api('/api/contracts?status=active'),
    api('/api/invoices'),
  ]);
  const contracts = contractsData?.contracts || [];
  const invoices = invoicesData?.invoices || [];

  // Agrupar facturas por contrato
  const byContract = {};
  invoices.forEach(inv => {
    if (inv.contractId) {
      if (!byContract[inv.contractId]) byContract[inv.contractId] = [];
      byContract[inv.contractId].push(inv);
    }
  });

  const unlinked = invoices.filter(inv => inv.isBlocked);

  pc.innerHTML = `
    <div style="margin-bottom:24px;">
      <h3 style="margin-bottom:16px">🔗 Contratos y sus facturas</h3>
      <div class="rel-grid">
        ${contracts.length === 0
          ? '<div class="empty-state">No hay contratos activos</div>'
          : contracts.map(c => `
          <div class="rel-card">
            <div class="rel-card-header">
              <div class="rel-card-icon">📝</div>
              <div>
                <div class="rel-card-title">${c.code} — ${c.title}</div>
                <div class="rel-card-sub">${c.clientName || 'Sin cliente'} • ${c.stageLabel}</div>
              </div>
            </div>
            <div class="rel-card-invoices">
              ${(byContract[c.id] || []).length === 0
                ? '<div style="font-size:0.78rem;color:var(--text3);padding:4px 0">Sin facturas vinculadas</div>'
                : (byContract[c.id] || []).map(inv => `
                  <div class="rel-invoice-item">
                    <span>${inv.code} — ${inv.title}</span>
                    ${badge(inv.status === 'approved' ? 'green' : inv.status === 'blocked' ? 'red' : 'gray')}
                  </div>
                `).join('')
              }
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    ${unlinked.length > 0 ? `
    <div>
      <h3 style="margin-bottom:16px">⛔ Facturas sin contrato</h3>
      <div class="data-table-wrapper">
        <table class="data-table">
          <thead><tr><th>Código</th><th>Descripción</th><th>Monto</th><th>Acción</th></tr></thead>
          <tbody>
            ${unlinked.map(inv => `
              <tr>
                <td style="color:var(--red); font-weight:600">${inv.code}</td>
                <td>${inv.title}</td>
                <td>${inv.amount != null ? '$' + inv.amount.toLocaleString('es-MX', {minimumFractionDigits:2}) : '—'}</td>
                <td><button class="btn-ghost" style="padding:6px 12px; font-size:0.8rem"
                  onclick="toast('Asignación de contrato próximamente')">Asignar contrato</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}
  `;
}


async function renderUsers() {
  const pc = document.getElementById('page-content');
  if (currentUser.role !== 'admin') {
    pc.innerHTML = '<div class="empty-state">No tienes permisos para ver esta sección.</div>';
    return;
  }

  const users = await api('/api/users') || [];
  
  pc.innerHTML = `
    <div style="display:flex; justify-content:flex-end; margin-bottom:16px;">
      <button class="btn-primary" onclick="toast('Gestión de usuarios en construcción')">+ Nuevo Usuario</button>
    </div>
    ${users.length === 0 ? '<div class="empty-state">No hay usuarios registrados</div>' : `
    <div class="data-table-wrapper">
      <table class="data-table">
        <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Departamento</th><th>Estado</th></tr></thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td style="font-weight:500">
                <div style="display:flex; align-items:center; gap:8px">
                  <div class="avatar" style="width:28px; height:28px; font-size:0.7rem">${u.initials || 'U'}</div>
                  ${u.fullName}
                </div>
              </td>
              <td>${u.email}</td>
              <td style="text-transform:capitalize">${roleLabel(u.role)}</td>
              <td>${u.department || '—'}</td>
              <td>${badge(u.status === 'active' ? 'low' : 'critical')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`}
  `;
}

// ── TESORERÍA ──────────────────────────────────────────────
async function renderTreasury() {
  const container = document.getElementById('treasury-list');
  container.innerHTML = '<tr><td colspan="5" style="text-align:center">Cargando...</td></tr>';
  
  const data = await api('/api/treasury/invoices');
  if (!data) return;

  if (data.invoices.length === 0) {
    container.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 40px; color: var(--text3)">No hay facturas pendientes de cobro.</td></tr>';
    return;
  }

  container.innerHTML = data.invoices.map(inv => {
    let complianceHtml = '';
    if (inv.complianceReady) {
      complianceHtml = `<div class="badge-materialidad" style="background: rgba(16,185,129,0.15); color: var(--green); border-color: var(--green)"><span class="icon">✅</span> Expediente Completo</div>`;
    } else {
      complianceHtml = `
        <div style="display:flex; gap:6px;">
          <span title="Contrato" style="filter: grayscale(${inv.complianceIssues.contract ? '0' : '1'}); opacity: ${inv.complianceIssues.contract ? '1' : '0.4'}">📄</span>
          <span title="Cotización" style="filter: grayscale(${inv.complianceIssues.quote ? '0' : '1'}); opacity: ${inv.complianceIssues.quote ? '1' : '0.4'}">📝</span>
          <span title="Materialidad" style="filter: grayscale(${inv.complianceIssues.materialidad ? '0' : '1'}); opacity: ${inv.complianceIssues.materialidad ? '1' : '0.4'}">📁</span>
        </div>
      `;
    }

    return `
      <tr>
        <td>
          <div style="font-weight:600; color:var(--text)">${inv.title}</div>
          <div style="font-size:0.7rem; color:var(--text2)">${inv.code} ${inv.contract ? `| ${inv.contract.code}` : ''}</div>
        </td>
        <td style="font-weight:700">$${(inv.amount || 0).toLocaleString()}</td>
        <td>${inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '—'}</td>
        <td>${complianceHtml}</td>
        <td>
          <button class="btn-primary" style="padding: 4px 10px; font-size:0.75rem" onclick="payInvoice(${inv.id}, ${inv.complianceReady})">
            Registrar Pago
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

let currentPayInvoiceId = null;

async function payInvoice(id, isReady) {
  if (!isReady) {
    currentPayInvoiceId = id;
    document.getElementById('hard-confirm-input').value = '';
    document.getElementById('btn-hard-confirm').disabled = true;
    openModal('modal-hard-confirm');
    
    // Escuchar el input para habilitar el boton
    document.getElementById('hard-confirm-input').onkeyup = function(e) {
      if (e.target.value === "ASUMO RIESGO FISCAL") {
        document.getElementById('btn-hard-confirm').disabled = false;
      } else {
        document.getElementById('btn-hard-confirm').disabled = true;
      }
    };
  } else {
    if (!confirm("¿Registrar esta factura como pagada/cobrada?")) return;
    executePayment(id);
  }
}

function cancelHardConfirm() {
  closeModal('modal-hard-confirm');
  currentPayInvoiceId = null;
}

document.getElementById('btn-hard-confirm').onclick = function() {
  if (currentPayInvoiceId) {
    closeModal('modal-hard-confirm');
    executePayment(currentPayInvoiceId);
  }
};

async function executePayment(id) {
  const res = await api(`/api/treasury/invoices/${id}/pay`, { method: 'PUT' });
  if (res) {
    toast("Pago registrado correctamente", "success");
    currentPayInvoiceId = null;
    renderTreasury();
  }
}

// ── MATERIALIDAD UPLOADS ──────────────────────────────────
let currentUploadContext = { type: null, id: null }; // type: 'invoice' | 'contract'

async function uploadMateriality(type) {
  const fileInput = document.getElementById(type === 'invoice' ? 'inv-file' : 'ct-file');
  const file = fileInput.files[0];
  if (!file) return;

  const id = (type === 'invoice') ? window.currentInvoiceId : window.currentContractId;
  if (!id) {
    toast("Primero debes guardar el registro antes de subir archivos.", "error");
    fileInput.value = '';
    return;
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('title', file.name);
  if (type === 'invoice') formData.append('invoice_id', id);
  if (type === 'contract') formData.append('contract_id', id);

  try {
    const res = await fetch(`${API}/api/evidences/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    if (res.ok) {
      toast("Archivo subido correctamente", "success");
      // Reload parent modal
      if (type === 'invoice') {
        const inv = await api(`/api/invoices/${id}`);
        renderEvidencesList(inv.evidences || [], 'inv-evidences-list');
      } else {
        const ct = await api(`/api/contracts/${id}`);
        renderEvidencesList(ct.evidences || [], 'ct-evidences-list');
      }
    } else {
      toast("Error al subir archivo", "error");
    }
  } catch (e) {
    toast("Error de red", "error");
  }
  fileInput.value = '';
}

function renderEvidencesList(evidences, containerId) {
  const container = document.getElementById(containerId);
  if (!evidences || evidences.length === 0) {
    container.innerHTML = '<div style="font-size:0.75rem; color:var(--text3); padding: 5px;">No hay archivos adjuntos.</div>';
    return;
  }
  container.innerHTML = evidences.map(e => `
    <div style="display:flex; align-items:center; justify-content:space-between; padding: 6px; background:var(--bg); border: 1px solid var(--border); border-radius: 4px; margin-top: 6px;">
      <div style="font-size:0.75rem; display:flex; align-items:center; gap:6px;">
        📄 <a href="${API}${e.downloadUrl}" target="_blank" style="color:var(--text); text-decoration:none;">${e.fileName}</a>
      </div>
      <button class="btn-ghost" style="color:var(--red); padding: 2px 6px;" onclick="deleteEvidence(${e.id}, '${containerId}')">🗑️</button>
    </div>
  `).join('');
}

async function deleteEvidence(id, containerId) {
  if (!confirm("¿Borrar este archivo?")) return;
  const res = await api(`/api/evidences/${id}`, { method: 'DELETE' });
  toast("Archivo borrado");
  // Recargamos modal
  if (containerId.includes('inv')) {
    const inv = await api(`/api/invoices/${window.currentInvoiceId}`);
    renderEvidencesList(inv.evidences || [], containerId);
  } else {
    const ct = await api(`/api/contracts/${window.currentContractId}`);
    renderEvidencesList(ct.evidences || [], containerId);
  }
}

// ── PLANEACIÓN & SUBWAY MAP ──────────────────────────────────
async function renderPlanning() {
  const data = await api('/api/operations');
  if (!data) return;
  
  const tbody = document.getElementById('op-list-body');
  if (data.operations.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No hay operaciones registradas.</td></tr>';
    return;
  }
  
  tbody.innerHTML = data.operations.map(op => {
    const irfColor = op.irf_score === 'alto' ? 'var(--red)' : (op.irf_score === 'medio' ? 'var(--yellow)' : 'var(--green)');
    return `
      <tr>
        <td style="font-weight:600;">${op.code}</td>
        <td>${op.client_name}<br><small style="color:var(--text2)">${op.client_rfc}</small></td>
        <td>$${op.amount.toLocaleString()}</td>
        <td><span style="color:${irfColor}; font-weight:bold;">${op.irf_score.toUpperCase()}</span></td>
        <td>${op.status.toUpperCase()}</td>
        <td>
          <button class="btn-ghost" onclick="viewOperationTimeline(${op.id})">🔍 Ver Subway Map</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function submitOperation() {
  const clientName = document.getElementById('op-client-name').value;
  const clientRfc = document.getElementById('op-client-rfc').value;
  const concept = document.getElementById('op-concept').value;
  const amount = parseFloat(document.getElementById('op-amount').value);
  
  if (!clientName || !clientRfc || !concept || isNaN(amount)) {
    toast("Completa todos los campos", "error");
    return;
  }
  
  const res = await api('/api/operations', {
    method: 'POST',
    body: JSON.stringify({
      client_name: clientName,
      client_rfc: clientRfc,
      concept: concept,
      amount: amount
    })
  });
  
  if (res) {
    toast("Operación validada y creada con éxito", "success");
    document.getElementById('op-client-name').value = '';
    document.getElementById('op-client-rfc').value = '';
    document.getElementById('op-amount').value = '';
    renderPlanning();
  }
}

async function viewOperationTimeline(id) {
  const data = await api(`/api/operations/${id}`);
  if (!data) return;
  
  document.getElementById('op-timeline-title').textContent = `Subway Map: ${data.code}`;
  
  // Nodos: Planeación, Facturación, Legal, Tesorería
  const statusToStep = {
    'planeacion': 1,
    'facturacion': 2,
    'legal': 3,
    'tesoreria': 4,
    'cerrado': 5
  };
  
  const currentStep = statusToStep[data.status] || 1;
  
  const mapHtml = `
    <div class="subway-node ${currentStep > 1 ? 'completed' : (currentStep === 1 ? 'active' : '')}">
      ${currentStep > 1 ? '✓' : ''}
      <div class="label">Planeación</div>
    </div>
    <div class="subway-node ${currentStep > 2 ? 'completed' : (currentStep === 2 ? 'active' : '')}">
      ${currentStep > 2 ? '✓' : ''}
      <div class="label">Facturación</div>
    </div>
    <div class="subway-node ${currentStep > 3 ? 'completed' : (currentStep === 3 ? 'active' : '')}">
      ${currentStep > 3 ? '✓' : ''}
      <div class="label">Legal</div>
    </div>
    <div class="subway-node ${currentStep > 4 ? 'completed' : (currentStep === 4 ? 'active' : '')}">
      ${currentStep > 4 ? '✓' : ''}
      <div class="label">Tesorería</div>
    </div>
  `;
  
  document.getElementById('subway-map-container').innerHTML = mapHtml;
  
  let detailsHtml = `
    <p><strong>Cliente:</strong> ${data.client_name} (${data.client_rfc})</p>
    <p><strong>Concepto:</strong> ${data.concept}</p>
    <p><strong>Monto:</strong> $${data.amount.toLocaleString()}</p>
    <p><strong>IRF Score:</strong> ${data.irf_score.toUpperCase()}</p>
  `;
  
  document.getElementById('op-timeline-details').innerHTML = detailsHtml;
  openModal('modal-operation-timeline');
}

// ── BANDEJA DE ENTRADA LEGAL (INBOX) ──────────────────────────
async function renderLegalInbox() {
  const pc = document.getElementById('page-content');
  const res = await api('/api/invoices/legal-inbox/pending');
  const invoices = res?.invoices || [];

  const html = invoices.length === 0 
    ? '<div class="empty-state"><div class="icon">📥</div><h3>Bandeja Limpia</h3><p>No hay facturas/cotizaciones pendientes de asignar contrato.</p></div>' 
    : `<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px;">
        ${invoices.map(i => `
          <div class="card" style="border-left: 4px solid var(--orange); padding: 16px;">
            <div style="display:flex; justify-content:space-between; margin-bottom: 8px;">
              <span style="font-weight: 600; font-size: 0.9rem;">Folio: ${i.folio_xml || i.code}</span>
              <span class="badge alert-warning">Pendiente Legal</span>
            </div>
            <div style="font-size: 0.85rem; color: var(--text2); margin-bottom: 4px; line-height: 1.4;">
              <strong>Cliente:</strong> ${i.client_name || '—'} <br>
              <strong>Emisora:</strong> ${i.issuer_name || '—'}
            </div>
            <div style="font-size: 0.85rem; color: var(--text); margin-bottom: 12px; line-height: 1.4;">${i.title}</div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div style="font-size: 1.2rem; font-weight: 600;">$${(i.amount || 0).toLocaleString('es-MX', {minimumFractionDigits:2})}</div>
              <button class="btn-ghost" style="padding: 4px 8px; font-size: 0.8rem;" onclick="toast('Asignación de contrato próximamente')">Asignar Contrato</button>
            </div>
          </div>
        `).join('')}
      </div>`;

  pc.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
      <h2><span class="icon">📥</span> Bandeja de Entrada</h2>
    </div>
    ${html}
  `;
}
function switchOpTab(tab) {
  if (tab === 'planning') {
    document.getElementById('view-planning').style.display = 'block';
    document.getElementById('view-audit').style.display = 'none';
    document.getElementById('tab-planning').style.background = 'var(--bg3)';
    document.getElementById('tab-planning').style.color = 'var(--text)';
    document.getElementById('tab-audit').style.background = 'transparent';
    document.getElementById('tab-audit').style.color = 'var(--text2)';
  } else {
    document.getElementById('view-planning').style.display = 'none';
    document.getElementById('view-audit').style.display = 'block';
    document.getElementById('tab-audit').style.background = 'var(--bg3)';
    document.getElementById('tab-audit').style.color = 'var(--text)';
    document.getElementById('tab-planning').style.background = 'transparent';
    document.getElementById('tab-planning').style.color = 'var(--text2)';
    renderAuditoriaOperaciones();
  }
}

async function renderAuditoriaOperaciones() {
  const tbody = document.getElementById('audit-list-body');
  const res = await api('/api/invoices');
  const invoices = res?.invoices || [];
  
  if (invoices.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No hay facturas/IDs generados.</td></tr>';
    return;
  }
  
  const statusColor = {
    active: 'blue',
    draft: 'gray',
    pending_legal: 'orange',
    approved: 'green',
    pending: 'yellow'
  };

  tbody.innerHTML = invoices.map(inv => {
    const legalStatus = inv.contract 
      ? `<span class="badge alert-safe">Asignado: ${inv.contract.code}</span>`
      : `<span class="badge alert-warning">Pendiente Asignación</span>`;
      
    const treasuryStatus = inv.paymentMethod === 'PPD' 
      ? (inv.paymentStatus === 'paid' ? `<span class="badge alert-safe">Pagado (PPD)</span>` : `<span class="badge alert-danger">Por Pagar (PPD)</span>`)
      : `<span class="badge badge-gray">${inv.paymentMethod}</span>`;
      
    return `
      <tr>
        <td>
          <div style="font-weight:600">${inv.folio_xml || '—'}</div>
          <div style="color:var(--text2); font-size:0.75rem">${inv.code}</div>
        </td>
        <td>
          <div style="font-weight:500">${inv.client_name || '—'}</div>
          <div style="color:var(--text2); font-size:0.75rem">${inv.issuer_name || '—'}</div>
        </td>
        <td style="font-weight:500">${inv.title}</td>
        <td style="color:var(--green)">${inv.amount != null ? '$' + inv.amount.toLocaleString('es-MX', {minimumFractionDigits:2}) : '—'}</td>
        <td>${badge(statusColor[inv.status] || 'gray')}</td>
        <td>${legalStatus}</td>
        <td>${treasuryStatus}</td>
      </tr>
    `;
  }).join('');
}
