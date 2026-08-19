import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/axios';
import Layout from '../../components/Layout';
import LegalContractDetails from './LegalContractDetails';
import LegalMetrics from './LegalMetrics';
import { Plus, Search, X, ChevronRight, Eye, Pencil, Trash2, Upload, Download, Loader2, LayoutList, Folder, ChevronDown, ChevronUp } from 'lucide-react';

interface Contrato {
  id: number;
  cliente: string;
  tipo_contrato: string;
  responsable_interno: string;
  email_responsable: string;
  email_legal?: string;
  estatus: string;
  fecha_creacion: string;
  fecha_actualizacion: string;
  dias_en_estatus: number;
  alerta: string;
  archivo_path?: string;
  tiene_pdf?: boolean;
  empresa_id?: number | null;
  empresa?: string | null;
}

const STATUS_META: Record<string, { label: string; short: string; color: string; step: number }> = {
  'hecho': { label: 'Redacción Legal', short: 'Redacción', color: '#6C63FF', step: 1 },
  'jc_carlos': { label: 'Tránsito a Cliente', short: 'Tránsito →', color: '#3B82F6', step: 2 },
  'cliente': { label: 'En Poder del Cliente', short: 'Cliente', color: '#8B5CF6', step: 3 },
  'recolector': { label: 'Recolección Cliente', short: 'Recolección', color: '#EC4899', step: 4 },
  'firmas': { label: 'Tránsito a Notaría', short: 'Tránsito ←', color: '#F59E0B', step: 5 },
  'notaria': { label: 'En Notaría', short: 'Notaría', color: '#EF4444', step: 6 },
  'optimal': { label: 'Finalizado', short: 'Finalizado', color: '#10B981', step: 7 },
};

const CONTRACT_TYPES = [
  'Prestación de Servicios', 'Confidencialidad (NDA)', 'Arrendamiento',
  'Compraventa', 'Laboral', 'Licenciamiento', 'Otro',
];

const getStatusMeta = (estatus: string) => STATUS_META[estatus] || { label: estatus, short: estatus, color: '#6B7280', step: 0 };

const LegalDashboard = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [contracts, setContracts] = useState<Contrato[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'table' | 'expedientes' | 'metrics'>('table');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // File
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadContractId, setUploadContractId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);

  // Search & Filter
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [pdfFilter, setPdfFilter] = useState<'ALL' | 'CON_PDF' | 'SIN_PDF'>('ALL');
  const [alertFilter, setAlertFilter] = useState(false);

  // Modals
  const [detailsModal, setDetailsModal] = useState<Contrato | null>(null);
  const [editModal, setEditModal] = useState<Contrato | null>(null);
  const [editForm, setEditForm] = useState({ cliente: '', tipo_contrato: '', responsable_interno: '', email_responsable: '', email_legal: '' });
  const [editLoading, setEditLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; cliente: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Status dropdown
  const [statusDropdown, setStatusDropdown] = useState<number | null>(null);
  const [changingStatus, setChangingStatus] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setStatusDropdown(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchContracts = async () => {
    try {
      const res = await api.get('/api/legal/contratos');
      setContracts(res.data);
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.message || 'Error desconocido';
      const status = err.response?.status ? ` (HTTP ${err.response.status})` : '';
      setError(`Error cargando contratos${status}: ${detail}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Sincronizar PDFs de Materialidad → Legal antes de cargar contratos
    api.post('/api/materialidad/sincronizar-pdfs').catch(() => {}).finally(() => fetchContracts());
  }, []);

  // Auto-abrir modal si viene ?contrato=ID desde Materialidad
  useEffect(() => {
    const contratoId = searchParams.get('contrato');
    if (!contratoId || contracts.length === 0) return;
    const found = contracts.find(c => String(c.id) === contratoId);
    if (found) setDetailsModal(found);
  }, [searchParams, contracts]);

  // File handlers
  const triggerUpload = (id: number) => {
    setUploadContractId(id);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadContractId) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      await api.post(`/api/legal/contratos/${uploadContractId}/archivo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      fetchContracts();
    } catch (err: any) {
      alert('Error subiendo archivo: ' + (err.response?.data?.detail || err.message));
    } finally {
      setUploading(false);
      setUploadContractId(null);
    }
  };

  const handleDownload = async (id: number, cliente: string) => {
    try {
      const response = await api.get(`/api/legal/contratos/${id}/archivo`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Contrato_${cliente.replace(/\s+/g, '_')}_${id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Error al descargar archivo');
    }
  };

  // Actions
  const handleAdvance = async (id: number) => {
    try {
      await api.put(`/api/legal/contratos/${id}/avanzar`);
      fetchContracts();
    } catch (err: any) {
      alert('Error: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleChangeStatus = async (id: number, estatus: string) => {
    setChangingStatus(id);
    setStatusDropdown(null);
    try {
      await api.put(`/api/legal/contratos/${id}/estatus`, { estatus });
      fetchContracts();
    } catch (err: any) {
      alert('Error cambiando estatus: ' + (err.response?.data?.detail || err.message));
    } finally {
      setChangingStatus(null);
    }
  };

  const openEdit = (c: Contrato) => {
    setEditForm({
      cliente: c.cliente,
      tipo_contrato: c.tipo_contrato,
      responsable_interno: c.responsable_interno,
      email_responsable: c.email_responsable,
      email_legal: c.email_legal || '',
    });
    setEditModal(c);
  };

  const handleEditSave = async () => {
    if (!editModal) return;
    setEditLoading(true);
    try {
      await api.put(`/api/legal/contratos/${editModal.id}`, editForm);
      setEditModal(null);
      fetchContracts();
    } catch (err: any) {
      alert('Error al editar: ' + (err.response?.data?.detail || err.message));
    }
    setEditLoading(false);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/api/legal/contratos/${deleteConfirm.id}`);
      setDeleteConfirm(null);
      fetchContracts();
    } catch (err: any) {
      alert('Error al eliminar: ' + (err.response?.data?.detail || err.message));
    }
    setDeleteLoading(false);
  };

  // Filters
  const filtered = useMemo(() => {
    let result = contracts;
    if (statusFilter !== 'ALL') {
      result = result.filter(c => c.estatus === statusFilter);
    }
    if (pdfFilter === 'CON_PDF') {
      result = result.filter(c => !!c.tiene_pdf);
    } else if (pdfFilter === 'SIN_PDF') {
      result = result.filter(c => !c.tiene_pdf);
    }
    if (alertFilter) {
      result = result.filter(c => c.alerta?.includes('WARN'));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        c.cliente.toLowerCase().includes(q) ||
        c.responsable_interno.toLowerCase().includes(q) ||
        c.tipo_contrato.toLowerCase().includes(q) ||
        String(c.id).includes(q) ||
        (c.empresa && c.empresa.toLowerCase().includes(q))
      );
    }
    return result;
  }, [contracts, search, statusFilter, pdfFilter, alertFilter]);

  const groupedContracts = useMemo(() => {
    const groups: Record<string, Contrato[]> = {};
    filtered.forEach(c => {
      const emisora = c.empresa || 'Sin Empresa Especificada';
      const cliente = c.cliente;
      const key = `${emisora}|${cliente}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });
    return groups;
  }, [filtered]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // KPIs
  const total = contracts.length;
  const activos = contracts.filter(c => c.estatus !== 'optimal').length;
  const finalizados = contracts.filter(c => c.estatus === 'optimal').length;
  const alertas = contracts.filter(c => c.alerta?.includes('WARN')).length;
  const conPdf = contracts.filter(c => !!c.tiene_pdf).length;
  const sinPdf = contracts.filter(c => !c.tiene_pdf).length;

  const kpis = [
    { label: 'Total Contratos', value: total, icon: '📁', bg: 'bg-slate-600/10', border: 'border-slate-500/20' },
    { label: 'Alertas', value: alertas, icon: '⚠️', bg: alertFilter ? 'bg-rose-500/20' : 'bg-rose-500/10', border: alertFilter ? 'border-rose-500/50' : 'border-rose-500/20', isAlertFilter: true },
    { label: 'En Proceso', value: activos, icon: '⚡', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
    { label: 'Con PDF', value: conPdf, icon: '📄', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', clickFilter: 'CON_PDF' as const },
    { label: 'Sin PDF', value: sinPdf, icon: '📭', bg: 'bg-orange-500/10', border: 'border-orange-500/20', clickFilter: 'SIN_PDF' as const },
  ];

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="animate-spin text-slate-300" size={32} />
          <span className="ml-3 text-slate-400">Cargando contratos...</span>
        </div>
      </Layout>
    );
  }

  const renderContractRow = (row: Contrato, hideEmpresaCliente: boolean = false) => {
    const meta = getStatusMeta(row.estatus);
    const isWarn = row.alerta?.includes('WARN');
    const pct = (meta.step / 8) * 100;
    return (
      <tr key={row.id} className="group border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors">
        <td className="px-4 py-3 text-sm font-semibold text-slate-300">#{row.id}</td>
        {!hideEmpresaCliente && <td className="px-4 py-3 text-sm font-semibold text-emerald-400">{row.empresa || '—'}</td>}
        {!hideEmpresaCliente && <td className="px-4 py-3 text-sm font-semibold text-white">{row.cliente}</td>}
        <td className="px-4 py-3 text-sm text-slate-300">{row.tipo_contrato}</td>
        <td className="px-4 py-3 text-sm text-slate-300">{row.responsable_interno}</td>
        <td className="px-4 py-3">
          <div className="relative inline-block">
            <select
              value={row.estatus}
              onChange={(e) => handleChangeStatus(row.id, e.target.value)}
              disabled={changingStatus === row.id}
              className="inline-block px-3 py-1 pr-6 rounded-full text-xs font-semibold appearance-none cursor-pointer outline-none transition-all hover:brightness-110 disabled:opacity-50"
              style={{ backgroundColor: `${meta.color}22`, color: meta.color, border: `1px solid ${meta.color}44` }}
            >
              {Object.entries(STATUS_META).map(([key, val]) => (
                <option key={key} value={key} className="bg-slate-800 text-white font-medium">
                  {val.label}
                </option>
              ))}
            </select>
            {changingStatus === row.id ? (
              <Loader2 size={12} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin" style={{ color: meta.color }} />
            ) : (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: meta.color }}>
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            )}
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="w-20 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: meta.color }} />
          </div>
        </td>
        <td className="px-4 py-3 text-center">
          <span className="text-xs font-semibold text-slate-300">{row.dias_en_estatus}</span>
        </td>
        <td className="px-4 py-3 text-center">
          {isWarn ? <span className="text-rose-500 font-bold" title={row.alerta}>⚠️</span> : <span className="text-emerald-500 font-bold">✓</span>}
        </td>
        <td className="px-4 py-3 text-center">
          {row.empresa_id ? <span className="text-indigo-400 font-bold" title="Vinculado al Directorio de Empresas (Materialidad)">📎</span> : <span className="text-slate-600 opacity-50" title="No vinculado a Materialidad">—</span>}
        </td>
        <td className="px-4 py-3 text-center">
          {row.archivo_path ? (
            <button onClick={() => handleDownload(row.id, row.cliente)} className="text-slate-300 hover:text-white transition-colors" title="Descargar PDF propio">
              <Download size={16} />
            </button>
          ) : row.tiene_pdf ? (
            <span className="text-indigo-400" title="PDF en Materialidad">📎</span>
          ) : (
            <button onClick={() => triggerUpload(row.id)} disabled={uploading} className="text-slate-500 hover:text-white transition-colors" title="Subir archivo">
              <Upload size={16} />
            </button>
          )}
        </td>
        <td className="px-4 py-3 sticky right-0 bg-slate-800 group-hover:bg-[#253346] transition-colors z-10 border-l border-slate-700/50 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.3)]">
          <div className="flex items-center justify-center gap-1">
            {row.estatus !== 'optimal' && (
              <button onClick={() => handleAdvance(row.id)} className="w-7 h-7 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white flex items-center justify-center transition-all" title="Avanzar un paso">
                <ChevronRight size={14} />
              </button>
            )}
            <button onClick={() => setDetailsModal(row)} className="w-7 h-7 rounded-md border border-slate-600 bg-slate-700/50 text-slate-300 hover:border-slate-500 hover:text-slate-300 flex items-center justify-center transition-all" title="Ver Detalles">
              <Eye size={14} />
            </button>
            <button onClick={() => openEdit(row)} className="w-7 h-7 rounded-md border border-slate-600 bg-slate-700/50 text-slate-300 hover:border-slate-500 hover:text-slate-300 flex items-center justify-center transition-all" title="Editar">
              <Pencil size={14} />
            </button>
            <button onClick={() => setDeleteConfirm({ id: row.id, cliente: row.cliente })} className="w-7 h-7 rounded-md border border-slate-600 bg-slate-700/50 text-slate-300 hover:border-red-500 hover:bg-red-500/10 hover:text-red-400 flex items-center justify-center transition-all" title="Eliminar">
              <Trash2 size={14} />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <Layout>
      {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-lg mb-6 text-sm">{error}</div>}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {kpis.map(kpi => {
          const isClickable = !!(kpi as any).clickFilter || !!(kpi as any).isAlertFilter;
          const isActive = (kpi as any).clickFilter ? pdfFilter === (kpi as any).clickFilter : (kpi as any).isAlertFilter ? alertFilter : false;
          return (
            <div
              key={kpi.label}
              onClick={() => {
                if ((kpi as any).clickFilter) {
                  setPdfFilter(pdfFilter === (kpi as any).clickFilter ? 'ALL' : (kpi as any).clickFilter);
                } else if ((kpi as any).isAlertFilter) {
                  setAlertFilter(!alertFilter);
                }
              }}
              className={`${kpi.bg} border ${kpi.border} rounded-xl p-5 flex items-center gap-4 transition-all hover:scale-[1.02] ${
                isClickable ? 'cursor-pointer' : ''
              } ${
                isActive ? 'ring-2 ring-offset-1 ring-offset-slate-900 ring-rose-500' : ''
              }`}
            >
              <span className="text-2xl">{kpi.icon}</span>
              <div>
                <div className="text-2xl font-bold text-white">{kpi.value}</div>
                <div className="text-xs text-slate-400 uppercase tracking-wider">{kpi.label}</div>
              </div>
              {isActive && (
                <span className="ml-auto text-xs text-white/60 bg-white/10 rounded-full px-2 py-0.5">activo</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
          <button
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeView === 'table' ? 'bg-slate-700 text-slate-300 shadow' : 'text-slate-400 hover:text-white'}`}
            onClick={() => setActiveView('table')}
          >📋 Listado</button>
          <button
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeView === 'expedientes' ? 'bg-slate-700 text-slate-300 shadow' : 'text-slate-400 hover:text-white'}`}
            onClick={() => setActiveView('expedientes')}
          >🗂️ Expedientes</button>
          <button
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeView === 'metrics' ? 'bg-slate-700 text-slate-300 shadow' : 'text-slate-400 hover:text-white'}`}
            onClick={() => setActiveView('metrics')}
          >📊 Estadísticas</button>
        </div>
        <button
          onClick={() => navigate('/legal/nuevo')}
          className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-black/30"
        >
          <Plus size={18} /> Nuevo Contrato
        </button>
      </div>

      {/* Metrics View */}
      {activeView === 'metrics' && <LegalMetrics />}

      {/* Shared Filters for Table and Expedientes */}
      {(activeView === 'table' || activeView === 'expedientes') && (
        <div className="mb-6 space-y-4">
            <div className="relative">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar por cliente, responsable, tipo o ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg pl-11 pr-10 py-3 focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-400 transition-colors text-sm"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${statusFilter === 'ALL' ? 'bg-slate-600/15 border-slate-500/40 text-slate-300' : 'border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'}`}
                onClick={() => setStatusFilter('ALL')}
              >Todos</button>
              {Object.entries(STATUS_META).map(([key, val]) => (
                <button
                  key={key}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${statusFilter === key ? 'text-white' : 'border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'}`}
                  style={statusFilter === key ? { backgroundColor: `${val.color}22`, borderColor: `${val.color}55`, color: val.color } : {}}
                  onClick={() => setStatusFilter(key)}
                >{val.short}</button>
              ))}
            </div>
            {/* PDF Filter pills */}
            <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-700/50">
              <span className="text-xs text-slate-500 flex items-center mr-1">📄 Documento:</span>
              <button
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  pdfFilter === 'ALL' ? 'bg-slate-600/15 border-slate-500/40 text-slate-300' : 'border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'
                }`}
                onClick={() => setPdfFilter('ALL')}
              >Todos</button>
              <button
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  pdfFilter === 'CON_PDF'
                    ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                    : 'border-slate-700 text-slate-400 hover:text-indigo-300 hover:border-indigo-500/40'
                }`}
                onClick={() => setPdfFilter(pdfFilter === 'CON_PDF' ? 'ALL' : 'CON_PDF')}
              >✅ Con PDF ({conPdf})</button>
              <button
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  pdfFilter === 'SIN_PDF'
                    ? 'bg-orange-500/20 border-orange-500/50 text-orange-300'
                    : 'border-slate-700 text-slate-400 hover:text-orange-300 hover:border-orange-500/40'
                }`}
                onClick={() => setPdfFilter(pdfFilter === 'SIN_PDF' ? 'ALL' : 'SIN_PDF')}
              >📭 Sin PDF ({sinPdf})</button>
            </div>
          </div>
      )}

      {/* Table View */}
      {activeView === 'table' && (
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-white">Contratos Registrados</h3>
              <span className="text-xs text-slate-400 bg-slate-700/50 px-3 py-1 rounded-full">
                {filtered.length === total ? `${total} registros` : `${filtered.length} de ${total}`}
              </span>
            </div>

            {filtered.length === 0 ? (
              <div className="py-16 text-center">
                <span className="text-4xl block mb-4 opacity-50">{search || statusFilter !== 'ALL' ? '🔍' : '📋'}</span>
                <p className="text-slate-400">{search || statusFilter !== 'ALL' ? 'No se encontraron resultados.' : 'No hay contratos registrados aún.'}</p>
                <p className="text-slate-500 text-sm mt-1">{search || statusFilter !== 'ALL' ? 'Intenta ajustar tu búsqueda o filtros.' : 'Crea uno nuevo con el botón de arriba.'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-800/80">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">ID</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Empresa Emisora</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Cliente</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Tipo</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Responsable</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Estatus</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Progreso</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Días</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Alerta</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Mat.</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Doc</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider sticky right-0 bg-slate-800 z-10 border-l border-slate-700 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.3)]">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(row => renderContractRow(row, false))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
      )}

      {/* Expedientes View */}
      {activeView === 'expedientes' && (
        <div className="space-y-4">
          {Object.keys(groupedContracts).length === 0 ? (
            <div className="py-16 text-center bg-slate-800/50 border border-slate-700 rounded-xl">
              <span className="text-4xl block mb-4 opacity-50">🗂️</span>
              <p className="text-slate-400">No hay expedientes para mostrar con los filtros actuales.</p>
            </div>
          ) : (
            Object.entries(groupedContracts).map(([key, groupContracts]) => {
              const [emisora, cliente] = key.split('|');
              const isExpanded = !!expandedGroups[key];
              
              return (
                <div key={key} className="bg-slate-800/80 border border-slate-700 rounded-xl overflow-hidden shadow-lg">
                  <div 
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-700/50 transition-colors"
                    onClick={() => toggleGroup(key)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                        <Folder size={20} />
                      </div>
                      <div>
                        <h4 className="text-white font-bold text-lg">{cliente}</h4>
                        <p className="text-sm text-slate-400 flex items-center gap-2">
                          <span className="text-emerald-400 font-medium">{emisora}</span>
                          <span className="w-1 h-1 rounded-full bg-slate-600"></span>
                          <span>{groupContracts.length} {groupContracts.length === 1 ? 'Contrato' : 'Contratos'}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-slate-400">
                      {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <div className="border-t border-slate-700 bg-slate-900/50 p-4">
                      <div className="overflow-x-auto rounded-lg border border-slate-700/50 bg-slate-800/30">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-slate-800/60">
                              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">ID</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Tipo</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Responsable</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Estatus</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Progreso</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Días</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Alerta</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Mat.</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Doc</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider sticky right-0 bg-slate-800 z-10 border-l border-slate-700 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.3)]">Acciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {groupContracts.map(row => renderContractRow(row, true))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Hidden file input */}
      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="application/pdf" />

      {/* Contract Details Modal */}
      {detailsModal && (
        <LegalContractDetails 
          contract={detailsModal} 
          onClose={() => setDetailsModal(null)} 
          onDownload={() => handleDownload(detailsModal.id, detailsModal.cliente)}
          onUpload={() => triggerUpload(detailsModal.id)}
        />
      )}

      {/* Edit Modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-white">✏️ Editar Contrato #{editModal.id}</h3>
              <button onClick={() => setEditModal(null)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              {[
                { label: 'Cliente', key: 'cliente', type: 'text' },
                { label: 'Responsable Interno', key: 'responsable_interno', type: 'text' },
                { label: 'Email Responsable', key: 'email_responsable', type: 'email' },
                { label: 'Email Legal', key: 'email_legal', type: 'email' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">{f.label}</label>
                  <input
                    type={f.type}
                    value={(editForm as any)[f.key]}
                    onChange={e => setEditForm({ ...editForm, [f.key]: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-slate-500"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Tipo de Contrato</label>
                <select
                  value={editForm.tipo_contrato}
                  onChange={e => setEditForm({ ...editForm, tipo_contrato: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-slate-500"
                >
                  {CONTRACT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-700 bg-slate-800/50">
              <button onClick={() => setEditModal(null)} disabled={editLoading} className="px-4 py-2 border border-slate-600 text-slate-300 rounded-lg text-sm hover:bg-slate-700 transition-colors">Cancelar</button>
              <button onClick={handleEditSave} disabled={editLoading} className="px-4 py-2 bg-slate-700 text-white rounded-lg text-sm hover:bg-slate-600 transition-colors">
                {editLoading ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-white">🗑️ Confirmar Eliminación</h3>
              <button onClick={() => setDeleteConfirm(null)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="p-6">
              <p className="text-white mb-2">¿Estás seguro que deseas eliminar el contrato de <strong>{deleteConfirm.cliente}</strong>?</p>
              <p className="text-red-400 text-sm">Esta acción no se puede deshacer.</p>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-700">
              <button onClick={() => setDeleteConfirm(null)} disabled={deleteLoading} className="px-4 py-2 border border-slate-600 text-slate-300 rounded-lg text-sm hover:bg-slate-700">Cancelar</button>
              <button onClick={handleDelete} disabled={deleteLoading} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-500">
                {deleteLoading ? 'Eliminando...' : 'Sí, Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default LegalDashboard;
