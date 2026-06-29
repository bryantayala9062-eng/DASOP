# 📋 IDEA PROYECTO — Compliance Op (Continuación para otra IA)

## ¿Qué es este proyecto?
**Compliance Op** es una plataforma **GRC (Governance, Risk & Compliance)** para **Nexum Servicios Digitales S.A. de C.V.**. Gestiona cumplimiento normativo con ISO 27001, LFPDPPP, PCI DSS, NOM-035, ISO 9001 y MAAGTICSI.

---

## 📂 Estructura de archivos en disco

```
C:\Users\datao\Desktop\complianceop-backend\
│
├── app/
│   ├── __init__.py
│   ├── main.py            ✅ FastAPI app principal (registra todos los routers)
│   ├── database.py        ✅ SQLAlchemy + SQLite (complianceop.db)
│   ├── models.py          ✅ TODOS los modelos ORM
│   ├── auth.py            ✅ JWT: create_access_token, verify_password, get_password_hash
│   ├── dependencies.py    ✅ get_current_user, require_admin
│   └── routers/
│       ├── __init__.py    ✅
│       ├── auth.py        ✅ POST /api/auth/login, GET /api/auth/me, POST /api/auth/logout
│       ├── dashboard.py   ✅ GET /api/dashboard/summary, GET /api/dashboard/my-tasks
│       ├── tasks.py       ✅ CRUD /api/tasks + PUT /complete + POST /{id}/evidence
│       ├── alerts.py      ✅ GET/POST /api/alerts + PUT /read + PUT /read-all
│       ├── risks.py       ✅ CRUD /api/risks
│       ├── controls.py    ✅ GET /api/controls + GET /api/controls/frameworks + PUT /{id}
│       ├── audits.py      ✅ CRUD /api/audits
│       ├── users.py       ✅ CRUD /api/users (solo admin/manager)
│       ├── incidents.py   ✅ CRUD /api/incidents + PUT /notify-inai
│       ├── evidences.py   ✅ POST /api/evidences/upload + GET /download + DELETE
│       └── reports.py     ✅ GET /api/reports/compliance-summary, /risk-matrix, /task-completion
│
├── frontend/              ⚠️ INCOMPLETO — AQUÍ ESTÁ LA TAREA PENDIENTE
│   ├── index.html         ✅ Estructura HTML completa con sidebar, login, topbar
│   ├── style.css          ✅ CSS completo: dark theme, variables, componentes
│   └── app.js             ❌ NO EXISTE — FALTA CREAR (ver abajo)
│
├── uploads/evidences/     ✅ Carpeta para archivos subidos (se crea sola)
├── complianceop.db        ✅ Base de datos SQLite (ya generada con seed)
├── seed.py                ✅ Ya ejecutado — no volver a ejecutar
├── requirements.txt       ✅
├── .env                   ✅
├── INICIAR_SERVIDOR.bat   ✅ Doble clic para arrancar el servidor
└── INSTALAR_DEPENDENCIAS.bat ✅ Ejecutar solo una vez antes de iniciar

C:\Users\datao\Desktop\ComplianceOp_Frontend_Extraido\
├── vista-general.html     (referencia visual del sistema original)
├── mis-tareas.html        (referencia visual)
├── alertas.html           (referencia visual)
└── ComplianceOp_Optimal+.pdf    (documentación del producto original)
```

---

## ✅ Backend: 100% COMPLETO

El servidor corre con:
```
cd C:\Users\datao\Desktop\complianceop-backend
uvicorn app.main:app --reload --port 8000
```
O doble clic en `INICIAR_SERVIDOR.bat`.

Swagger disponible en: **http://localhost:8000/docs**

### Usuarios de acceso:
| Usuario | Contraseña | Rol |
|--------|-----------|-----|
| bryant | 1234 | admin |

---

## ❌ TAREA PENDIENTE: Crear `frontend/app.js`

Este es el **único archivo que falta**. El `index.html` y `style.css` ya están completos.

### Qué debe hacer `app.js`:

**1. Configuración base**
```js
const API = 'http://localhost:8000';
let token = localStorage.getItem('token');
let currentUser = JSON.parse(localStorage.getItem('user') || 'null');
let currentPage = 'dashboard';
```

**2. Función `doLogin()`**
- Leer `#login-email` y `#login-pass`
- POST a `${API}/api/auth/login` con `{email, password}`
- Guardar `token` y `user` en localStorage
- Llamar `initApp()`
- Si error: mostrar `#login-error`

**3. Función `initApp()`**
- Ocultar `#login-screen`, mostrar `#app`
- Actualizar `#user-name`, `#user-role`, `#user-avatar`, `#top-avatar` con datos del usuario
- Llamar `loadBadges()` para contar alertas/tareas
- Llamar `showPage('dashboard')`

**4. Función `showPage(page)`**
Cambia el contenido de `#page-content`. Páginas a implementar:
- `dashboard` → llama `renderDashboard()`
- `my-tasks` → llama `renderMyTasks()`
- `alerts` → llama `renderAlerts()`
- `risks` → llama `renderRisks()`
- `controls` → llama `renderControls()`
- `audits` → llama `renderAudits()`
- `incidents` → llama `renderIncidents()`
- `reports` → llama `renderReports()`

Actualiza `#page-title` y `#page-sub` según la página.
Marca el `.nav-item` correspondiente como `.active`.

**5. Función `api(path, options)`** — helper para fetch autenticado:
```js
async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...opts.headers }
  });
  if (res.status === 401) { doLogout(); return; }
  return res.json();
}
```

**6. `renderDashboard()`**
- GET `/api/dashboard/summary`
- Renderizar en `#page-content`:
  - Fila de 4 KPI cards: cumplimiento global (%), riesgos activos, tareas pendientes, próxima auditoría
  - Si hay incidente activo: mostrar banner rojo con cuenta regresiva (72h LFPDPPP)
  - Grid 2 columnas:
    - Izquierda: frameworks con progress bars de cumplimiento (usar `data.frameworkCompliance`)
    - Derecha: KRIs (usar `data.kris`) en grid 3x2
  - Lista de próximos hitos (usar `data.milestones`)

**7. `renderMyTasks()`**
- GET `/api/dashboard/my-tasks`
- Mostrar 4 contadores (atrasadas, en progreso, pendientes, completadas este mes)
- Lista de tareas con checkbox que llama PUT `/api/tasks/{id}/complete`
- Badge de prioridad y fecha de vencimiento con color (rojo=overdue, amarillo=hoy)

**8. `renderAlerts()`**
- GET `/api/alerts`
- Mostrar contadores por tipo (critical, high, medium, informative)
- Botón "Marcar todas como leídas" → PUT `/api/alerts/read-all`
- Lista de alertas activas con `.alert-dot` de color según tipo
- Botón "Marcar leída" → PUT `/api/alerts/{id}/read`

**9. `renderRisks()`**
- GET `/api/risks`
- Tabla/lista de riesgos con badge de nivel y estado
- Mostrar total y distribución por nivel

**10. `renderControls()`**
- GET `/api/controls/frameworks` → mostrar lista de frameworks con % cumplimiento
- GET `/api/controls` → tabla de controles con estado y código

**11. `renderAudits()`**
- GET `/api/audits`
- Lista de auditorías con estado, fecha, framework y días restantes

**12. `renderIncidents()`**
- GET `/api/incidents`
- Mostrar incidentes con countdown de horas restantes (para cumplir 72h de LFPDPPP)
- Botón "Notificar INAI" → PUT `/api/incidents/{id}/notify-inai`

**13. `renderReports()`**
- GET `/api/reports/compliance-summary`
- Tabla de cumplimiento por framework con semáforo (rojo/amarillo/verde)
- GET `/api/reports/risk-matrix` → tabla de riesgos ordenados por score
- GET `/api/reports/task-completion` → avance por usuario

**14. Funciones auxiliares:**
```js
function badge(level) { /* retorna HTML de badge según nivel */ }
function timeAgo(dateStr) { /* retorna "Hace 2 horas" */ }
function toast(msg, type='success') { /* muestra toast en #toast-container */ }
function loadBadges() { /* carga conteos para #badge-tasks y #badge-alerts */ }
function doLogout() { localStorage.clear(); location.reload(); }
```

---

## 🎨 Clases CSS disponibles (de style.css)

```
Layout:    .kpi-grid, .grid-2, .grid-3
Cards:     .kpi-card, .section-card, .section-header, .section-body
Badges:    .badge .badge-red .badge-orange .badge-yellow .badge-green .badge-blue .badge-gray
Tasks:     .task-item, .task-checkbox, .task-body, .task-title, .task-meta, .task-due.overdue
Alerts:    .alert-item, .alert-dot.critical/.high/.medium/.informative, .alert-title, .alert-msg
Progress:  .progress-bar > .progress-fill .fill-green/.fill-yellow/.fill-red/.fill-blue
KRI:       .kri-grid, .kri-card.warn/.crit, .kri-val, .kri-label
Incident:  .incident-banner, .incident-title, .incident-timer
Buttons:   .btn-primary, .btn-sm .btn-outline, .btn-sm .btn-blue
Misc:      .spinner, .loading-state, .empty-state, .milestone-item
Framework: .framework-row, .fw-header, .fw-name, .fw-pct, .fw-meta
```

---

## 🔑 Notas clave
1. El frontend sirve como **archivos estáticos** — abrirlo directamente en navegador con `file://` O servir con `python -m http.server 3000` dentro de la carpeta `frontend/`
2. CORS ya está configurado en el backend para aceptar cualquier origen
3. El nombre del sistema es **Compliance Op** (no ComplianceOp — cambiar cualquier referencia)
4. Los archivos HTML extraídos en `ComplianceOp_Frontend_Extraido/` son **solo referencia visual**
5. El chatbot **NO se implementa** (decisión del cliente)
6. El `seed.py` **ya fue ejecutado** — no volver a correr
7. La BD es **SQLite** en `complianceop.db` dentro de la carpeta del proyecto

---

*Actualizado: 14 de mayo de 2026 — Backend 100% completo. Falta solo app.js del frontend.*
