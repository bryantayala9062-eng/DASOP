import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/axios';
import Layout from '../../components/Layout';

import { ProductServiceDrilldownModal } from '../../components/dashboard/ProductServiceDrilldownModal';
import KPICard from '../../components/dashboard/KPICard';
import TemporalAnalysisPanel from '../../components/dashboard/TemporalAnalysisPanel';
import InvoicesTable from '../../components/dashboard/InvoicesTable';
import EmissionsControlModule from '../../components/dashboard/EmissionsControlModule';
import CompanyViewPanel from '../../components/dashboard/CompanyViewPanel';
import { CompanyInvoicesModal } from '../../components/dashboard/CompanyInvoicesModal';
import { CrossBillingNetwork } from '../../components/dashboard/CrossBillingNetwork';
import {
  RefreshCw, DollarSign, Activity, Users, AlertTriangle,
  Eye, EyeOff, Calendar, Search, Building2, CreditCard,
  FileText,
  X, Filter, BarChart3, Shield, Loader2, PieChart as PieChartIcon
} from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import type { DashboardFilters } from '../../types/filters';

// ─── Types ────────────────────────────────
interface KPIStats {
  total_ventas: number;
  saldo_pendiente: number;
  total_facturas: number;
  total_canceladas?: number;
  tasa_cancelacion?: number;
  concentracion_top_10: number;
}

// ─── Formatters ───────────────────────────
const formatCurrency = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n ?? 0);

const formatCompact = (n: number | null | undefined): string => {
  if (!n) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toString();
};

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

// ─── Tabs ─────────────────────────────────
type TabId = 'overview' | 'invoices' | 'collection' | 'companies';

const DashboardXML = () => {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [filters, setFilters] = useState<DashboardFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [nlpQuery, setNlpQuery] = useState('');
  const [isNlpLoading, setIsNlpLoading] = useState(false);
  const [nlpInterpretation, setNlpInterpretation] = useState<string | null>(null);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileModifiedAt, setFileModifiedAt] = useState<string | null>(null);

  // Data states
  const [stats, setStats] = useState<KPIStats | null>(null);
  const [trend, setTrend] = useState<any[]>([]);
  const [incomeMix, setIncomeMix] = useState<any>(null);
  const [productServiceRatio, setProductServiceRatio] = useState<any>(null);
  const [empresas, setEmpresas] = useState<string[]>([]);
  const [mixView, setMixView] = useState<'mix' | 'ratio'>('mix');

  const [ppdPueRatio, setPpdPueRatio] = useState<any[]>([]);
  const [empresasData, setEmpresasData] = useState<any[]>([]);

  // Drilldown states
  const [drilldownModalOpen, setDrilldownModalOpen] = useState(false);
  const [drilldownType, setDrilldownType] = useState<string>('');
  const [drilldownData, setDrilldownData] = useState<any>(null);
  const [isLoadingDrilldown, setIsLoadingDrilldown] = useState(false);

  // Modal para Facturas Interactivas
  const [invoiceModalState, setInvoiceModalState] = useState<{
    isOpen: boolean;
    companyName: string;
    category: 'emisor' | 'receptor' | 'ambos';
    activeLens?: string;
    initialTab?: 'invoices' | 'contracts';
  }>({ isOpen: false, companyName: '', category: 'emisor' });

  const handleNodeClick = useCallback((companyName: string, category: 'emisor' | 'receptor' | 'ambos' = 'emisor', activeLens?: string, initialTab?: 'invoices' | 'contracts') => {
    setInvoiceModalState({ isOpen: true, companyName, category, activeLens, initialTab });
  }, []);

  // Companies tab data (year comparison + aging — CompanyViewPanel fetches its own list)
  const [yearComparison, setYearComparison] = useState<any[]>([]);
  const [aging, setAging] = useState<any>(null);

  const buildParams = useCallback((extra: Record<string, any> = {}, excludeYears = false) => {
    const p: Record<string, string> = {};
    Object.entries(extra).forEach(([k, v]) => { if (v != null) p[k] = String(v); });
    if (filters.empresa) p.empresa = filters.empresa;
    if (filters.cliente) p.cliente = filters.cliente;

    if (!excludeYears && filters.years && filters.years.length > 0 && !filters.startDate) {
      p.startDate = `years:${filters.years.join(',')}`;
    } else if (filters.startDate) {
      p.startDate = filters.startDate;
    }

    if (filters.endDate) p.endDate = filters.endDate;
    if (filters.status && filters.status !== 'ALL') p.status = filters.status;
    if (filters.folio) p.folio = filters.folio;
    return { params: p };
  }, [filters]);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [kpiRes, trendRes, mixRes, ratioRes, ppdRatioRes, empresasRes] = await Promise.all([
        api.get('/api/dashboard/', buildParams()),
        api.get('/api/dashboard/analytics/trend', buildParams({}, true)),
        api.get('/api/dashboard/analytics/income-mix', buildParams()),
        api.get('/api/dashboard/analytics/product-service-ratio', buildParams()),
        api.get('/api/dashboard/analytics/ppd-pue-ratio', buildParams()),
        api.get('/api/dashboard/empresas', buildParams()),
      ]);
      setStats(kpiRes.data);
      setTrend(Array.isArray(trendRes.data) ? trendRes.data : []);
      setIncomeMix(mixRes.data);
      setProductServiceRatio(ratioRes.data);
      setPpdPueRatio(Array.isArray(ppdRatioRes.data) ? ppdRatioRes.data : []);
      setEmpresasData(Array.isArray(empresasRes.data) ? empresasRes.data : []);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Error cargando datos');
    }
    setLoading(false);
  }, [buildParams]);

  const reloadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Llamar al endpoint de recarga para actualizar datos del backend
      const reloadRes = await api.post('/api/dashboard/reload');
      console.log('✅ Datos recargados desde Excel:', reloadRes.data);

      // Ahora cargar los datos frescos y actualizar timestamp
      await fetchOverview();

      // Obtener la nueva fecha de modificación del archivo
      const infoRes = await api.get('/api/dashboard/info');
      if (infoRes.data?.file_modified_at) {
        setFileModifiedAt(infoRes.data.file_modified_at);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Error recargando datos');
      setLoading(false);
    }
  }, [fetchOverview]);

  const fetchFilters = async () => {
    try {
      const res = await api.get('/api/dashboard/filters');
      if (res.data?.empresas) setEmpresas(res.data.empresas);
    } catch { /* ignore */ }
  };

  const handleProductServiceClick = async (tipo: string) => {
    setDrilldownType(tipo);
    setDrilldownModalOpen(true);
    setIsLoadingDrilldown(true);
    setDrilldownData(null);
    try {
      const res = await api.get(`/api/dashboard/analytics/product-service-ratio/${tipo}`, buildParams());
      setDrilldownData(res.data);
    } catch (err) {
      console.error("Error fetching drilldown data", err);
    } finally {
      setIsLoadingDrilldown(false);
    }
  };

  const fetchCompaniesExtra = async () => {
    try {
      const [yearRes, agingRes] = await Promise.all([
        api.get('/api/dashboard/analytics/year-comparison', buildParams()),
        api.get('/api/dashboard/analytics/aging', buildParams()),
      ]);
      setYearComparison(Array.isArray(yearRes.data) ? yearRes.data : []);
      setAging(agingRes.data);
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchFilters(); }, []);
  useEffect(() => { fetchOverview(); }, [fetchOverview]);
  useEffect(() => {
    if (activeTab === 'companies') fetchCompaniesExtra();
  }, [activeTab]);

  // Cargar fecha de modificación del archivo Excel al montar
  useEffect(() => {
    const fetchFileModifiedTime = async () => {
      try {
        const res = await api.get('/api/dashboard/info');
        if (res.data?.file_modified_at) {
          setFileModifiedAt(res.data.file_modified_at);
        }
      } catch (err) {
        console.error('Error fetching dashboard info:', err);
      }
    };
    fetchFileModifiedTime();
  }, []);

  
  const handleNlpSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nlpQuery.trim()) return;
    setIsNlpLoading(true);
    setNlpInterpretation(null);
    try {
      const res = await api.get(`/api/dashboard/nlp-parse?q=${encodeURIComponent(nlpQuery)}`);
      const parsed = res.data?.filters;
      
      if (parsed) {
        setFilters(prev => {
          const next: DashboardFilters = {
            ...prev,
            status: parsed.status !== 'ALL' ? parsed.status : undefined,
            cliente: parsed.cliente || undefined,
            empresa: parsed.empresa || undefined,
            startDate: parsed.startDate || undefined,
            endDate: parsed.endDate || undefined,
            folio: parsed.folio || undefined
          };
          if (parsed.startDate || parsed.endDate) {
            delete next.years;
          }
          return next;
        });
        if (parsed.interpreted_as) {
          setNlpInterpretation(parsed.interpreted_as);
        }
      }
    } catch (err) {
      console.error("NLP parsing error", err);
    } finally {
      setIsNlpLoading(false);
      setNlpQuery('');
    }
  };

  const handleFilterChange = (key: keyof DashboardFilters, value: string) => {
    setFilters(prev => {
      const next: DashboardFilters = { ...prev, [key]: value };
      if ((key === 'startDate' || key === 'endDate') && value) {
        delete next.years;
      }
      if (key === 'status' && (!value || value === 'ALL')) {
        delete next.status;
      }
      return next;
    });
  };

  const handleTimeLabelClick = (label: string) => {
    if (label.length === 7) {
      const [year, month] = label.split('-');
      const y = parseInt(year);
      const m = parseInt(month);
      const lastDay = new Date(y, m, 0).getDate();
      setFilters(prev => {
        const next: DashboardFilters = {
          ...prev,
          startDate: `${label}-01`,
          endDate: `${label}-${lastDay.toString().padStart(2, '0')}`
        };
        delete next.years;
        return next;
      });
    }
  };

  const handleClearTimeFilter = () => {
    setFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters.startDate;
      delete newFilters.endDate;
      delete newFilters.years;
      return newFilters;
    });
  };

  const clearFilters = () => {
    setFilters({});
  };

  const formatFileDate = (isoString: string | null) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      // Formato: 17 mar 2026, 11:45 AM
      return date.toLocaleDateString('es-MX', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }) + ', ' + date.toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return '';
    }
  };

  const tabs = [
    { id: 'overview' as TabId, label: 'Panorama General', icon: <BarChart3 size={16} /> },
    { id: 'invoices' as TabId, label: 'Facturas', icon: <FileText size={16} /> },
    { id: 'collection' as TabId, label: 'Emisiones Vivas', icon: <AlertTriangle size={16} /> },

    { id: 'companies' as TabId, label: 'Empresas', icon: <Building2 size={16} /> },
  ];

  return (
    <Layout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 mb-4 md:mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white mb-1">Panel Financiero Integral</h1>
          <p className="text-slate-400 text-xs md:text-sm">Análisis de ingresos, cobranza y riesgos fiscales</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${showFilters ? 'bg-slate-700 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
              <Filter size={16} /> Filtros
            </button>
            <button onClick={() => setPrivacyMode(!privacyMode)} className="px-3 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors" title={privacyMode ? 'Mostrar montos' : 'Ocultar montos'}>
              {privacyMode ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            <button onClick={reloadData} disabled={loading} className="flex items-center gap-1.5 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 text-sm font-medium transition-colors disabled:opacity-50">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> {loading ? 'Cargando' : 'Actualizar'}
            </button>
          </div>
          {fileModifiedAt && (
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              <Calendar size={12} className="text-slate-500" />
              <span>Datos actualizados: <span className="font-medium text-slate-300">{formatFileDate(fileModifiedAt)}</span></span>
            </div>
          )}
        </div>
      </div>

      
      {/* Smart Search Global */}
      <div className="bg-slate-600/10 border border-slate-600/30 p-4 rounded-xl relative overflow-hidden group mb-6">
          <div className="absolute top-0 right-0 w-32 h-32 bg-slate-600/20 blur-3xl rounded-full translate-x-10 -translate-y-10 group-hover:bg-slate-600/30 transition-all"></div>
          <label className="text-sm font-bold text-slate-300 flex items-center gap-2 relative z-10 select-none">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/></svg> Asistente Mágico
              <span className="ml-auto text-[9px] font-normal text-slate-400/50 hidden sm:block">Prueba: "pendientes de Soriana Q1 2025" · "mayores a 50 mil de marzo" · "folio K-47"</span>
          </label>
          <form onSubmit={handleNlpSearch} className="relative z-10 m-0 mt-2">
              <textarea
                  value={nlpQuery}
                  onChange={(e) => setNlpQuery(e.target.value)}
                  onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleNlpSearch(e as any); } }}
                  placeholder="Ej. facturas pendientes de este año mayores a 50 mil..."
                  className="w-full bg-dark-900/50 border border-slate-600/30 rounded-lg p-3 text-xs text-white placeholder-slate-300/30 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400/50 resize-none h-12 transition-all shadow-inner"
              />
              <div className="flex justify-between items-center mt-2">
                  <span className="text-[10px] text-slate-400/60 leading-tight">Presiona <span className="font-bold border border-slate-600/30 px-1 rounded bg-slate-800/60">Enter</span> para buscar</span>
                  <button 
                      type="submit" 
                      disabled={isNlpLoading || !nlpQuery.trim()}
                      className="text-xs uppercase font-bold tracking-wider bg-slate-600 hover:bg-slate-400 text-white px-4 py-1.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                      {isNlpLoading ? 'Procesando...' : 'Aplicar'}
                  </button>
              </div>
          </form>
          {/* Interpretación del asistente */}
          {nlpInterpretation && (
            <div className="relative z-10 mt-3 flex items-start gap-2 bg-slate-800/60 border border-slate-600/20 rounded-lg px-3 py-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 flex-shrink-0 mt-0.5"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
              <span className="text-[10px] text-slate-300 leading-relaxed"><span className="font-bold text-slate-200">Entendí:</span> {nlpInterpretation}</span>
              <button onClick={() => setNlpInterpretation(null)} className="ml-auto text-slate-400/50 hover:text-slate-300 flex-shrink-0">
                <X size={10} />
              </button>
            </div>
          )}
      </div>

      {/* Filters Panel */}

      {showFilters && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 mb-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <label className="text-xs text-slate-400 mb-1 flex items-center gap-1"><Calendar size={12} /> Desde</label>
              <input type="date" value={filters.startDate || ''} onChange={e => handleFilterChange('startDate', e.target.value)} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 flex items-center gap-1"><Calendar size={12} /> Hasta</label>
              <input type="date" value={filters.endDate || ''} onChange={e => handleFilterChange('endDate', e.target.value)} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 flex items-center gap-1"><Search size={12} /> Folio</label>
              <input type="text" placeholder="K-47..." value={filters.folio || ''} onChange={e => handleFilterChange('folio', e.target.value)} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 flex items-center gap-1"><Users size={12} /> Cliente</label>
              <input type="text" placeholder="Buscar..." value={filters.cliente || ''} onChange={e => handleFilterChange('cliente', e.target.value)} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 flex items-center gap-1"><Building2 size={12} /> Empresa</label>
              <select value={filters.empresa || ''} onChange={e => handleFilterChange('empresa', e.target.value)} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm">
                <option value="">Todas</option>
                {empresas.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 flex items-center gap-1"><CreditCard size={12} /> Estatus</label>
              <select value={filters.status || 'ALL'} onChange={e => handleFilterChange('status', e.target.value)} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm">
                <option value="ALL">Todos</option>
                <option value="PAGADO">Pagado</option>
                <option value="PENDIENTE">Pendiente</option>
                <option value="PARCIAL">Parcial</option>
              </select>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button onClick={clearFilters} className="text-xs text-slate-400 hover:text-white transition-colors">Limpiar filtros</button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl mb-6 flex items-center gap-2">
          <AlertTriangle size={16} /> <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-white"><X size={14} /></button>
        </div>
      )}

      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 mb-4 md:mb-6">
          <KPICard
            title="Ventas Totales"
            value={formatCurrency(stats.total_ventas)}
            subtext={`${formatCompact(stats.total_facturas)} facturas`}
            icon={DollarSign}
            color="warning"
            privacyMode={privacyMode}
          />
          <KPICard
            title="Saldo Pendiente"
            value={formatCurrency(stats.saldo_pendiente)}
            subtext={`${stats.total_ventas ? ((stats.saldo_pendiente / stats.total_ventas) * 100).toFixed(1) : '0'}% de cartera`}
            icon={AlertTriangle}
            color="danger"
            trend="down"
            privacyMode={privacyMode}
          />
          <KPICard
            title="Operaciones"
            value={String(stats.total_facturas)}
            subtext="Facturas en periodo"
            icon={Activity}
            color="brand"
            privacyMode={privacyMode}
          />
          <KPICard
            title="Cancelaciones"
            value={`${stats.tasa_cancelacion || 0}%`}
            subtext={`${formatCompact(stats.total_canceladas || 0)} facturas anuladas`}
            icon={X}
            color="danger"
            privacyMode={privacyMode}
          />
          <KPICard
            title="Top 10 Clientes"
            value={`${stats.concentracion_top_10}%`}
            subtext="Del ingreso total"
            icon={Users}
            color="success"
            privacyMode={privacyMode}
          />
        </div>
      )}

      {/* Active Filters Display */}
      {Object.keys(filters).length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <span className="text-xs text-slate-500 font-semibold mr-2">Filtros Activos:</span>
          {Object.entries(filters).map(([key, value]) => {
            if (!value || value === 'ALL') return null;
            let label = key;
            if (key === 'startDate') label = 'Desde';
            if (key === 'endDate') label = 'Hasta';
            if (key === 'years') label = 'Años';
            if (key === 'status') label = 'Estatus';
            if (key === 'lens') label = 'Lens';
            return (
              <span key={key} className="bg-slate-600/10 border border-slate-500/20 text-slate-300 px-3 py-1 rounded-full text-xs flex items-center gap-1.5">
                <span className="font-semibold text-slate-300">{label}:</span> {Array.isArray(value) ? value.join(', ') : value}
                <button onClick={() => {
                  const newFilters = { ...filters };
                  delete newFilters[key as keyof DashboardFilters];
                  setFilters(newFilters);
                }} className="hover:text-white ml-1"><X size={12} /></button>
              </span>
            );
          })}
          {Object.values(filters).some(v => v && v !== 'ALL') && (
            <button onClick={clearFilters} className="text-xs text-slate-400 hover:text-white ml-2 underline decoration-slate-600 underline-offset-2">Limpiar Todo</button>
          )}
        </div>
      )}

      {/* Tab Navigation — scrollable en mobile */}
      <div className="tabs-scroll mb-4 md:mb-6">
        <div className="flex gap-1 bg-slate-800/50 border border-slate-700 rounded-xl p-1 min-w-max md:min-w-0">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-medium transition-all flex-shrink-0 ${
              activeTab === tab.id ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}>
              {tab.icon} <span className="whitespace-nowrap">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
        <div className={privacyMode && activeTab !== 'overview' ? 'blur-md select-none' : ''}>

        {/* ─── OVERVIEW ─────────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-6">

            {/* Temporal Analysis */}
            {trend.length > 0 && (
              <div className={privacyMode ? 'blur-md select-none' : ''}>
                <TemporalAnalysisPanel
                  trendData={trend}
                  onSelectTimeLabel={handleTimeLabelClick}
                  onClearFilter={(filters.startDate || filters.endDate || (filters.years && filters.years.length > 0)) ? handleClearTimeFilter : undefined}
                  selectedYears={filters.years}
                  onSelectYears={(years: string[]) => setFilters(prev => {
                    const next: DashboardFilters = { ...prev, years };
                    delete next.startDate;
                    delete next.endDate;
                    if (!years || years.length === 0) delete next.years;
                    return next;
                  })}
                />
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Donut: Concentración por Empresa Emisora */}
              {empresasData.length > 0 && (
                <div className={`bg-slate-800 border border-slate-700 rounded-xl p-5 ${privacyMode ? 'blur-md select-none' : ''}`}>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-white font-semibold">Concentración por Empresa Emisora</h3>
                    <span className="text-xs bg-slate-900 text-slate-400 px-3 py-1 rounded-full font-medium border border-slate-700">{empresasData.length} empresas</span>
                  </div>
                  {(() => {
                    const totalGeneral = empresasData.reduce((acc: number, e: any) => acc + (e.total_ventas || 0), 0);
                    const donutData = empresasData.map((e: any) => ({
                      name: e.empresa,
                      value: e.total_ventas || 0,
                      pct: totalGeneral > 0 ? ((e.total_ventas || 0) / totalGeneral * 100) : 0,
                      facturas: e.total_facturas || 0,
                      clientes: e.num_clientes || 0,
                    }));
                    return (
                      <div className="flex flex-col items-center">
                        <ResponsiveContainer width="100%" height={220}>
                          <PieChart>
                            <Pie
                              data={donutData}
                              cx="50%"
                              cy="50%"
                              innerRadius={55}
                              outerRadius={90}
                              paddingAngle={2}
                              dataKey="value"
                              stroke="#1e293b"
                              strokeWidth={2}
                            >
                              {donutData.map((_: any, index: number) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={COLORS[index % COLORS.length]}
                                  className="cursor-pointer hover:opacity-80 transition-opacity"
                                  onClick={() => handleNodeClick(donutData[index].name, 'emisor')}
                                />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#fff', fontSize: 12 }}
                              formatter={(value: any, _name: any, props: any) => [
                                `${formatCurrency(value)} (${props.payload.pct.toFixed(1)}%)`,
                                props.payload.name
                              ]}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="w-full mt-2 space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                          {donutData.map((item: any, i: number) => (
                            <div
                              key={i}
                              className="flex items-center justify-between text-xs hover:bg-slate-700/50 rounded-lg px-2 py-1.5 transition-colors cursor-pointer"
                              onClick={() => handleNodeClick(item.name, 'emisor')}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }}></span>
                                <span className="text-white truncate" title={item.name}>{item.name}</span>
                              </div>
                              <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                                <span className="text-slate-400">{item.facturas} fact.</span>
                                <span className="text-emerald-400 font-semibold w-14 text-right">{item.pct.toFixed(1)}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Income Mix / Ratio Toggle Panel */}
              {(incomeMix?.tipo_ingreso || productServiceRatio) && (
                <div className={`bg-slate-800 border border-slate-700 rounded-xl p-5 ${privacyMode ? 'blur-md select-none' : ''}`}>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-white font-semibold">
                      {mixView === 'mix' ? 'Mezcla de Ingresos (Top Categorías)' : 'Productos vs Servicios (E48)'}
                    </h3>
                    <div className="flex gap-1 bg-slate-900 rounded-lg p-1">
                      <button
                        onClick={() => setMixView('mix')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${mixView === 'mix' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
                      >Categorías</button>
                      <button
                        onClick={() => setMixView('ratio')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${mixView === 'ratio' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
                      >Producto/Servicio</button>
                    </div>
                  </div>

                  {mixView === 'mix' && incomeMix?.tipo_ingreso && (
                    <div className="overflow-x-auto max-h-[300px] overflow-y-auto pr-2">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-slate-800 z-10">
                          <tr className="text-slate-400 border-b border-slate-700">
                            <th className="text-left font-medium pb-2">Categoría / Concepto</th>
                            <th className="text-right font-medium pb-2">Monto ($)</th>
                            <th className="text-right font-medium pb-2">%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {incomeMix.tipo_ingreso.map((item: any, i: number, arr: any[]) => {
                            const totalMix = arr.reduce((acc, curr) => acc + (curr.monto || 0), 0);
                            const pct = totalMix > 0 ? (item.monto / totalMix) * 100 : 0;
                            return (
                              <tr key={i} className="border-b border-slate-700/50 hover:bg-slate-700/50 transition-colors">
                                <td className="py-2.5 flex items-center gap-2">
                                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }}></span>
                                  <span className="text-white text-xs truncate max-w-[200px]" title={item.tipo}>{item.tipo || 'Sin descripción'}</span>
                                </td>
                                <td className="text-right text-emerald-400 py-2.5 text-xs font-semibold">{formatCurrency(item.monto)}</td>
                                <td className="py-2.5 flex items-center justify-end gap-2 text-right">
                                  <span className="text-slate-300 text-xs w-10">{pct.toFixed(1)}%</span>
                                  <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden hidden sm:block">
                                    <div className="h-full" style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }}></div>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {mixView === 'ratio' && productServiceRatio?.concept_mix && (
                    <div className="flex flex-col gap-4">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-slate-400 border-b border-slate-700">
                            <th className="text-left font-medium pb-2">Tipo</th>
                            <th className="text-right font-medium pb-2">Monto ($)</th>
                            <th className="text-right font-medium pb-2">%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {productServiceRatio.concept_mix.map((item: any, i: number) => (
                            <tr
                              key={i}
                              className="border-b border-slate-700/50 hover:bg-slate-700/50 cursor-pointer transition-colors"
                              onClick={() => handleProductServiceClick(item.tipo)}
                            >
                              <td className="py-2.5 flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${item.tipo === 'Servicio' ? 'bg-slate-300' : 'bg-emerald-400'}`}></span>
                                <span className="text-white font-medium">{item.tipo}</span>
                              </td>
                              <td className="text-right text-slate-300 py-2.5">{formatCurrency(item.monto)}</td>
                              <td className="text-right py-2.5">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${item.tipo === 'Servicio' ? 'bg-slate-600/10 text-slate-300' : 'bg-emerald-500/10 text-emerald-400'}`}>{item.pct}%</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div className="mt-2">
                        <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Clasificación por Factura</h4>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-slate-400 border-b border-slate-700">
                              <th className="text-left font-medium pb-2">Facturas tipo</th>
                              <th className="text-center font-medium pb-2">#</th>
                              <th className="text-right font-medium pb-2">% del Monto Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {productServiceRatio.invoice_detail?.map((item: any, i: number) => (
                              <tr
                                key={i}
                                className="border-b border-slate-700/50 hover:bg-slate-700/50 cursor-pointer transition-colors"
                                onClick={() => handleProductServiceClick(item.tipo)}
                              >
                                <td className="py-2 flex items-center gap-2">
                                  <span className={`w-1.5 h-1.5 rounded-full ${item.tipo === 'Servicio' ? 'bg-slate-300' : item.tipo === 'Producto' ? 'bg-emerald-400' : 'bg-yellow-400'}`}></span>
                                  <span className="text-slate-300">{item.tipo}</span>
                                </td>
                                <td className="text-center text-slate-400 py-2">{item.count}</td>
                                <td className="py-2 flex items-center justify-end gap-2">
                                  <span className="text-slate-300 text-xs">{item.monto_pct}%</span>
                                  <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                    <div className={`h-full ${item.tipo === 'Servicio' ? 'bg-slate-600' : item.tipo === 'Producto' ? 'bg-emerald-500' : 'bg-yellow-500'}`} style={{ width: `${item.monto_pct}%` }}></div>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <ProductServiceDrilldownModal
              isOpen={drilldownModalOpen}
              onClose={() => setDrilldownModalOpen(false)}
              tipo={drilldownType}
              data={drilldownData}
              isLoading={isLoadingDrilldown}
              formatCurrency={formatCurrency}
            />

            {/* Cash Flow Analysis */}
            {(ppdPueRatio.length > 0) && (
              <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 ${privacyMode ? 'blur-md select-none' : ''}`}>

                {/* PPD vs PUE Ratio */}
                {ppdPueRatio.length > 0 && (() => {
                  const total = ppdPueRatio.reduce((acc, curr) => acc + (curr.monto || 0), 0);
                  const pueData = ppdPueRatio.find(d => d.metodo === 'PUE') || { monto: 0 };
                  const ppdData = ppdPueRatio.find(d => d.metodo === 'PPD') || { monto: 0 };
                  const puePct = total > 0 ? (pueData.monto / total) * 100 : 0;
                  const ppdPct = total > 0 ? (ppdData.monto / total) * 100 : 0;

                  return (
                    <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 flex flex-col justify-center">
                      <div className="flex justify-between items-center mb-6">
                        <h3 className="text-white font-bold flex items-center gap-2 text-lg">
                          <PieChartIcon size={20} className="text-slate-300" /> Operaciones PUE vs PPD
                        </h3>
                        <span className="text-xs bg-slate-900 text-slate-400 px-3 py-1 rounded-full font-medium border border-slate-700">Distribución</span>
                      </div>

                      <div className="flex justify-between items-end mb-3">
                        <div>
                          <p className="text-sm font-semibold text-emerald-400 mb-1 flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span> Contado (PUE)</p>
                          <p className="text-3xl font-extrabold text-white tracking-tight">{puePct.toFixed(1)}<span className="text-xl text-slate-400 font-medium">%</span></p>
                          <p className="text-xs text-slate-400 mt-1 font-medium">{formatCurrency(pueData.monto)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-amber-400 mb-1 flex items-center justify-end gap-1.5">Crédito (PPD) <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span></p>
                          <p className="text-3xl font-extrabold text-white tracking-tight">{ppdPct.toFixed(1)}<span className="text-xl text-slate-400 font-medium">%</span></p>
                          <p className="text-xs text-slate-400 mt-1 font-medium">{formatCurrency(ppdData.monto)}</p>
                        </div>
                      </div>

                      <div className="w-full h-5 bg-slate-900 rounded-full overflow-hidden flex shadow-inner mt-2">
                        <div className="h-full bg-emerald-500" style={{ width: `${puePct}%` }}></div>
                        <div className="h-full bg-amber-500" style={{ width: `${ppdPct}%` }}></div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

          </div>
        )}

        {/* ─── INVOICES TAB ──────────── */}
        {activeTab === 'invoices' && (
          <InvoicesTable filters={filters} />
        )}

        {/* ─── EMISSIONS TAB  ──────────── */}
        {activeTab === 'collection' && (
          <EmissionsControlModule filters={filters} />
        )}




        {/* ─── COMPANIES TAB ──────────── */}
        {activeTab === 'companies' && (
          <div className="space-y-6">

            {/* Interactive Cross-Billing Network Graph */}
            <CrossBillingNetwork filters={filters} onNodeClick={handleNodeClick} />

            {yearComparison.length > 0 && (
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                <h3 className="text-white font-semibold mb-4">Comparación Interanual</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={yearComparison}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v: number) => formatCompact(v)} />
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#fff', fontSize: 12 }} formatter={(v: number | any) => formatCurrency(v)} />
                    <Legend />
                    <Bar dataKey="2024" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="2025" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="2026" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Company-level detail panel */}
            <CompanyViewPanel filters={filters} />

            {aging && aging.buckets && (
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                <h3 className="text-white font-semibold mb-4">Antigüedad de Saldos</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={aging.buckets}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="bucket" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v: number) => formatCompact(v)} />
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#fff', fontSize: 12 }} formatter={(v: number | any) => formatCurrency(v)} />
                    <Bar dataKey="monto" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {yearComparison.length === 0 && !aging && (
              <div className="text-center py-16">
                <Loader2 className="animate-spin mx-auto text-slate-300 mb-3" size={32} />
                <p className="text-slate-400">Cargando datos de empresas...</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Global Interactive Invoices Modal */}
      <CompanyInvoicesModal
        isOpen={invoiceModalState.isOpen}
        onClose={() => setInvoiceModalState(prev => ({ ...prev, isOpen: false }))}
        companyName={invoiceModalState.companyName}
        category={invoiceModalState.category}
        activeLens={invoiceModalState.activeLens}
        initialTab={invoiceModalState.initialTab}
        baseFilters={filters}
      />
    </Layout>
  );
};

export default DashboardXML;
