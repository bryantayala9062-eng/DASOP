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
const MODULE_NAV_CONFIG = {};

// Nav genérico para módulos sin configuración propia
const GENERIC_NAV_CONFIG = [
  { section: 'Panel', open: true, items: [
    { id: 'dashboard', icon: '📊', label: 'Dashboard' },
  ]},
  { section: 'Más', open: false, items: [
    { id: 'users',   icon: '👥', label: 'Usuarios' },
  ]},
];

// ── Inicializar ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-error').style.display = 'none';
  document.getElementById('login-username').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  if (token && currentUser) enterReportingMode();
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
  errEl.textContent = 'Usuario o contraseña incorrectos';
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
      enterReportingMode();
    } else {
      errEl.style.display = 'block';
      errEl.textContent = 'Usuario o contraseña incorrectos';
      document.getElementById('login-pass').value = '';
    }
  } catch (e) {
    errEl.textContent = 'Error de red o servidor apagado (¿Está activo el túnel?)';
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

// ── MODO REPORTEO DIRECTO (sin selector de módulos) ──────
function enterReportingMode() {
  hide('login-screen');
  hide('module-selector');
  show('app');

  activeModule = '__reporting__';

  // Color de acento azul para reporteo
  document.documentElement.style.setProperty('--accent', '#3b82f6');
  document.documentElement.style.setProperty('--accent-light', 'rgba(59,130,246,0.1)');
  document.documentElement.style.setProperty('--accent-glow', 'rgba(59,130,246,0.2)');

  // Sidebar header
  document.getElementById('sb-mod-icon').textContent = '📊';
  document.getElementById('sb-mod-name').textContent = 'Reporteo';
  document.getElementById('sb-mod-dept').textContent = 'Compliance Op';

  // User info
  const name = currentUser.fullName || currentUser.full_name || 'Usuario';
  const initials = currentUser.initials || name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2);
  document.getElementById('user-name').textContent = name;
  document.getElementById('user-role').textContent = roleLabel(currentUser.role);
  document.getElementById('user-avatar').textContent = initials;
  document.getElementById('top-avatar').textContent = initials;

  // Sidebar nav
  buildSidebarForModule('__reporting__');

  showPage('dashboard');
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
  if (pc) {
    pc.style.display = 'block';
    pc.innerHTML = '<div class="loading-state"><span class="spinner"></span> Cargando...</div>';
  }

  if (page === 'dashboard')       renderDashboard();
  else if (page === 'users')      renderUsers();
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
  const pc = document.getElementById('page-content');
  
  // Cargar la Matriz de Cumplimiento directamente como Dashboard
  await renderReports();
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
  // REPORTING MODE: siempre mostrar TODAS las áreas, sin filtro
  const data = await api('/api/department-reports/period-status');
  
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
              if (m.status === 'complete') badgeHtml = `<span class="badge badge-green" style="padding:2px 6px; font-size:0.7rem; cursor:pointer;" onclick="openPeriodDetails(\'${row.department}\', ${m.month})"> Completo</span>`;
              else if (m.status === 'partial') badgeHtml = `<span class="badge badge-orange" style="padding:2px 6px; font-size:0.7rem; cursor:pointer;" onclick="openPeriodDetails(\'${row.department}\', ${m.month})"> Parcial</span>`;
              else badgeHtml = `<span class="badge badge-red" style="padding:2px 6px; font-size:0.7rem; cursor:pointer;" onclick="openPeriodDetails(\'${row.department}\', ${m.month})"> Pendiente</span>`;
              
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
      showPage('dashboard');
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
    
    window._pendingInvoiceIdForContract = null;
    showPage('dashboard');
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
  
  // renderEvidencesList removed (legacy module)
  const evList = document.getElementById('ct-evidences-list');
  if (evList) evList.innerHTML = '';
  openModal('modal-contract');
}


// ── RESPONSIVE MOBILE SIDEBAR TOGGLE ──
function toggleSidebar() {
  document.body.classList.toggle('sidebar-open');
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
