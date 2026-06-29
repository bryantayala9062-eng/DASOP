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
  document.getElementById('sb-mod-dept').textContent = 'Compliance Op';

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
  nav.innerHTML = REPORTING_NAV.filter(group => {
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
    renderAudit();
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
              const color = m.status === 'complete' ? 'green' : m.status === 'partial' ? 'orange' : 'red';
              const label = m.status === 'complete' ? 'Completo' : m.status === 'partial' ? 'Parcial' : 'Pendiente';
              return `<td style="text-align:center"><span class="badge badge-${color}" style="padding:2px 6px;font-size:0.7rem;cursor:pointer" onclick="openPeriodDetails('${row.department}',${m.month})">${label}</span></td>`;
            }).join('')}
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
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
    reportHtml = `<p style="color:var(--green)">✔ Reporte cargado.</p>${dl}`;
  }

  let kpiHtml = '<p style="color:var(--red)">✘ No hay evaluación de KPIs.</p>';
  if (m.kpiEval) {
    let dl = m.kpiEval.evidence ? `<button class="btn-ghost" style="padding:4px 8px;font-size:0.8rem;margin-top:5px" onclick="downloadFile('${API}${m.kpiEval.evidence.file_path}','${m.kpiEval.evidence.file_name}')">📥 Descargar</button>` : '';
    kpiHtml = `<p style="color:var(--green)">✔ KPIs cargados (Score: ${m.kpiEval.globalScore}%).</p>${dl}`;
  }

  document.getElementById('period-details-content').innerHTML = `
    <div style="background:var(--bg2);padding:16px;border-radius:8px;border:1px solid var(--border);margin-bottom:12px">
      <h4 style="margin:0 0 8px;color:white">Reporte de Área</h4>${reportHtml}
    </div>
    <div style="background:var(--bg2);padding:16px;border-radius:8px;border:1px solid var(--border)">
      <h4 style="margin:0 0 8px;color:white">Evaluación de KPIs</h4>${kpiHtml}
    </div>
  `;
  openModal('modal-period-details');
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
    <td><span class="badge badge-${r.status === 'reviewed' ? 'green' : 'orange'}">${r.status === 'reviewed' ? 'Revisado' : 'Pendiente'}</span></td>
    <td>${r.evidences?.length ? `<button class="btn-ghost" style="padding:4px 8px;font-size:0.8rem" onclick="downloadFile('${API}/api/evidences/${r.evidences[0].id}/download','${r.evidences[0].fileName}')">📥</button>` : '—'}</td>
  </tr>`).join('');
}

function openReportModal() {
  const dept = deptForModule(activeModule);
  if (dept) document.getElementById('rep-dept').value = dept;
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

  container.innerHTML = `
    <div style="background:var(--bg2);padding:24px;border-radius:12px;border:1px solid var(--border);margin-bottom:24px">
      <h3 style="margin:0 0 16px">Subir Evaluación de KPIs</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div class="form-group"><label>Departamento</label>
          <select class="form-control" id="kpi-dept">
            <option value="Legal">Legal</option><option value="Administración">Administración</option>
            <option value="Tesorería">Tesorería</option><option value="Contabilidad">Contabilidad</option>
            <option value="Operaciones">Operaciones</option><option value="RH">RH</option>
          </select>
        </div>
        <div class="form-group"><label>Colaborador / Responsable</label>
          <input class="form-control" id="kpi-collab" type="text" placeholder="Ej: Pedro Ruiz">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div class="form-group"><label>Mes</label>
          <input class="form-control" id="kpi-month" type="number" min="1" max="12" value="${new Date().getMonth()+1}">
        </div>
        <div class="form-group"><label>Score Global (%)</label>
          <input class="form-control" id="kpi-score" type="number" min="0" max="100" placeholder="85">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div class="form-group"><label>Año</label>
          <input class="form-control" id="kpi-year" type="number" value="${new Date().getFullYear()}">
        </div>
      </div>
      <div class="form-group"><label>Comentarios</label>
        <textarea class="form-control" id="kpi-comments" rows="2" placeholder="Notas..."></textarea>
      </div>
      <div class="form-group"><label>Archivo de evidencia (PDF/Excel)</label>
        <input type="file" id="kpi-file" accept=".pdf,.xls,.xlsx,.doc,.docx" style="color:var(--text2)">
      </div>
      <button class="btn-primary" style="width:auto;margin-top:8px" onclick="submitKPI()">Subir KPIs</button>
    </div>

    <h3>Historial de Evaluaciones</h3>
    ${history.length === 0 ? '<div class="empty-state">No hay evaluaciones registradas.</div>' : `
    <div class="data-table-wrapper"><table class="data-table">
      <thead><tr><th>Departamento</th><th>Colaborador</th><th>Periodo</th><th>Score</th><th>Evaluador</th><th>Fecha</th><th>Archivo</th></tr></thead>
      <tbody>${history.map(e => `<tr>
        <td>${e.department}</td>
        <td>${e.collaborator_name || '—'}</td>
        <td>${e.period_month}/${e.period_year}</td>
        <td style="font-weight:700;color:${e.global_score >= 80 ? 'var(--green)' : e.global_score >= 50 ? 'var(--orange)' : 'var(--red)'}">${e.global_score}%</td>
        <td>${e.evaluator_name}</td>
        <td>${e.evaluation_date ? new Date(e.evaluation_date).toLocaleDateString('es-MX') : '—'}</td>
        <td>${e.evidence ? `<button class="btn-ghost" style="padding:4px 8px;font-size:0.8rem" onclick="downloadFile('${API}${e.evidence.file_path}','${e.evidence.file_name}')">📥</button>` : '—'}</td>
      </tr>`).join('')}</tbody>
    </table></div>`}
  `;

  if (dept) document.getElementById('kpi-dept').value = dept;
}

async function submitKPI() {
  const score = document.getElementById('kpi-score').value;
  const file = document.getElementById('kpi-file').files[0];
  if (!score) return toast('Ingresa el score global', 'error');
  if (!file) return toast('Selecciona un archivo', 'error');

  const fd = new FormData();
  fd.append('department', document.getElementById('kpi-dept').value);
  const collab = document.getElementById('kpi-collab').value.trim();
  if (collab) fd.append('collaborator_name', collab);
  fd.append('period_month', document.getElementById('kpi-month').value);
  fd.append('period_year', document.getElementById('kpi-year').value);
  fd.append('global_score', score);
  fd.append('comments', document.getElementById('kpi-comments').value || '');
  fd.append('file', file);

  try {
    const res = await fetch(`${API}/api/kpis/evaluation/upload`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd
    });
    if (res.ok) { toast('KPIs subidos correctamente', 'success'); loadKPIs(); }
    else { const d = await res.json(); toast(d.detail || 'Error', 'error'); }
  } catch (e) { toast('Error de red', 'error'); }
}

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
