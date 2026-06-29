import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from "../../api/axios";
import { 
  AlertCircle, AlertTriangle, CheckCircle2, 
  RefreshCw, FileText, ChevronDown, ChevronUp, Search, X
} from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { InvoiceDetailModal } from './InvoiceDetailModal';
import { TrendingUp, TrendingDown, Clock } from 'lucide-react';
import type { DashboardFilters } from '../../types/filters';

interface Invoice {
    UUID: string;
    FOLIO: string;
    FECHA: string;
    EMPRESA: string;
    CLIENTE: string;
    "TOTAL NETO": number;
    "SALDO PENDIENTE": number;
    "METODO PAGO": string;
    "ESTATUS DE COBRO"?: string;
    ESTATUS: string;
}

interface Meta {
    page: number;
    limit: number;
    total_records: number;
    total_pages: number;
    aggregates: { 
        total_neto: number; 
        total_saldo: number;
        kpis?: {
            critico: number;
            preventivo: number;
            normal: number;
            saldo_critico: number;
        }
    };
}

// ── Lógica de Semáforo ──
const getAgingInfo = (fechaStr: string) => {
    const fechaEmision = new Date(fechaStr);
    const hoy = new Date();
    // Normalizar a media noche para contar días completos
    fechaEmision.setHours(0, 0, 0, 0);
    hoy.setHours(0, 0, 0, 0);
    const diffTime = Math.abs(hoy.getTime() - fechaEmision.getTime());
    const daysOpen = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (daysOpen >= 30) {
        return { days: daysOpen, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', label: 'Crítico', icon: <AlertCircle size={14} className="text-red-400" /> };
    } else if (daysOpen >= 8) {
        return { days: daysOpen, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', label: 'Preventivo', icon: <AlertTriangle size={14} className="text-amber-400" /> };
    } else {
        return { days: daysOpen, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', label: 'Normal', icon: <CheckCircle2 size={14} className="text-emerald-400" /> };
    }
};

interface EmissionsControlModuleProps {
    filters?: DashboardFilters;
}

const EmissionsControlModule = ({ filters }: EmissionsControlModuleProps) => {
    const [data, setData] = useState<Invoice[]>([]);
    const [meta, setMeta] = useState<Meta | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(100);
    const [isExpanded, setIsExpanded] = useState(true);
    
    // Insights State
    const [ppdInsights, setPpdInsights] = useState<{
        promedio_dias_general: number;
        top_rezago: any[];
        top_velocidad: any[];
    } | null>(null);
    const [loadingInsights, setLoadingInsights] = useState(false);
    
    // Interactive features
    const [sortBy, setSortBy] = useState<string>('FECHA');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [agingFilter, setAgingFilter] = useState<'ALL' | 'CRITICO' | 'PREVENTIVO' | 'NORMAL'>('ALL');
    
    // Búsqueda
    const [searchFolio, setSearchFolio] = useState('');

    // Modal
    const [selectedUUID, setSelectedUUID] = useState<string | null>(null);
    const [selectedFolioLabel, setSelectedFolioLabel] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleOpenInvoice = (uuid: string, folio: string) => {
        setSelectedUUID(uuid);
        setSelectedFolioLabel(folio);
        setIsModalOpen(true);
    };

    const handleSort = (col: string) => {
        if (sortBy === col) {
            setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(col);
            setSortDir('asc');
        }
        setPage(1);
    };

    useEffect(() => {
        if (filters?.folio) setSearchFolio(filters.folio);
        if (filters?.empresa || filters?.cliente || filters?.status || filters?.startDate || filters?.endDate || (filters?.years && filters.years.length > 0)) {
            setPage(1);
        }
    }, [filters?.folio, filters?.empresa, filters?.cliente, filters?.status, filters?.startDate, filters?.endDate, filters?.years]);

    const activeStatus = (filters?.status && filters.status !== 'ALL') ? filters.status : 'PENDIENTE';
    const statusLabel = activeStatus.includes(',')
        ? 'Múltiples'
        : activeStatus === 'PENDIENTE'
            ? 'Pendiente'
            : activeStatus === 'PAGADO'
                ? 'Pagado'
                : activeStatus === 'PARCIAL'
                    ? 'Parcial'
                    : activeStatus;

    const filtersKey = useMemo(() => JSON.stringify({
        empresa: filters?.empresa,
        cliente: filters?.cliente,
        folio: filters?.folio,
        startDate: filters?.startDate,
        endDate: filters?.endDate,
        years: filters?.years,
        status: filters?.status
    }), [filters]);

    const fetchPendingInvoices = useCallback(() => {
        setLoading(true);
        setError(null);
        // Pedimos por estatus, ordenados por fecha ascendente (las más viejas primero)
        const params = new URLSearchParams({
            page: page.toString(),
            limit: limit.toString(),
            status: activeStatus,
            sortDir: sortDir
        });
        
        if (sortBy) params.append('sortBy', sortBy);
        if (agingFilter !== 'ALL') params.append('agingStatus', agingFilter);

        if (filters?.empresa) params.append('empresa', filters.empresa);
        if (filters?.cliente) params.append('cliente', filters.cliente);
        if (filters?.years && filters.years.length > 0 && !filters?.startDate) {
            params.append('startDate', `years:${filters.years.join(',')}`);
        } else if (filters?.startDate) {
            params.append('startDate', filters.startDate);
        }
        if (filters?.endDate) params.append('endDate', filters.endDate);

        const activeFolio = searchFolio || filters?.folio || '';
        if (activeFolio) params.append('folio', activeFolio);

        api.get(`/api/dashboard/invoices?${params.toString()}`)
            .then(res => {
                setData(res.data?.data || []);
                setMeta(res.data?.meta || null);
                setLoading(false);
            })
            .catch(err => {
                console.error("Error loading pending invoices:", err);
                setError(err?.response?.data?.detail || "No se pudieron cargar las facturas pendientes.");
                setLoading(false);
            });
    }, [page, limit, searchFolio, sortBy, sortDir, agingFilter, activeStatus, filters, filtersKey]);

    useEffect(() => {
        fetchPendingInvoices();
    }, [fetchPendingInvoices]);

    useEffect(() => {
        setLoadingInsights(true);
        const params = new URLSearchParams();
        if (filters?.empresa) params.append('empresa', filters.empresa);
        if (filters?.cliente) params.append('cliente', filters.cliente);
        if (filters?.years && filters.years.length > 0 && !filters?.startDate) {
            params.append('startDate', `years:${filters.years.join(',')}`);
        } else if (filters?.startDate) {
            params.append('startDate', filters.startDate);
        }
        if (filters?.endDate) params.append('endDate', filters.endDate);
        const query = params.toString();
        const url = query ? `/api/dashboard/analytics/ppd-lifecycle?${query}` : `/api/dashboard/analytics/ppd-lifecycle`;
        api.get(url)
            .then(res => setPpdInsights(res.data))
            .catch(err => console.error("Error loading insights:", err))
            .finally(() => setLoadingInsights(false));
    }, [filters, filtersKey]);

    // KPI Counters from backend (which covers all records in the search/filter universe)
    // with a fallback to counting from the visible rows if the backend data is absent.
    const kpis = useMemo(() => {
        if (meta?.aggregates?.kpis) {
            return meta.aggregates.kpis;
        }

        let critico = 0;
        let preventivo = 0;
        let normal = 0;
        let saldoCritico = 0;

        data.forEach(inv => {
            const info = getAgingInfo(inv.FECHA);
            if (info.days >= 30) { critico++; saldoCritico += inv["SALDO PENDIENTE"]; }
            else if (info.days >= 8) preventivo++;
            else normal++;
        });

        return { critico, preventivo, normal, saldoCritico };
    }, [data, meta]);

    if (error) {
        return (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 h-20 flex items-center justify-center text-red-400">
                {error}
            </div>
        );
    }

    return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
            {/* Header */}
            <div className="space-y-4">
                <div className="flex items-center gap-3 cursor-pointer select-none" onClick={() => setIsExpanded(!isExpanded)}>
                    <div className="p-2 bg-purple-500/10 rounded-lg">
                        <AlertCircle className="text-purple-400" size={20} />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-bold text-white text-lg">Control de Emisiones (Bandeja Vivas)</h3>
                        <p className="text-xs text-slate-500">
                            {meta?.total_records.toLocaleString() || '0'} facturas en estatus {statusLabel}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={(e) => { e.stopPropagation(); fetchPendingInvoices(); }} className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white" title="Recargar Bandeja">
                            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                        </button>
                        <button className="p-2 hover:bg-slate-700 rounded-lg transition-colors">
                            {isExpanded ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
                        </button>
                    </div>
                </div>

                {/* Semáforo KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div onClick={() => { setAgingFilter(agingFilter === 'CRITICO' ? 'ALL' : 'CRITICO'); setPage(1); }} className={`bg-red-500/10 border ${agingFilter === 'CRITICO' ? 'border-red-400 ring-1 ring-red-400/50 scale-[1.02] shadow-lg shadow-red-500/20' : 'border-red-500/20'} rounded-lg p-4 cursor-pointer hover:bg-red-500/20 transition-all duration-200`}>
                        <div className="flex items-center gap-2 text-red-400 text-xs uppercase mb-1 font-semibold">
                            <AlertCircle size={14} /> Crítico (+30 días)
                        </div>
                        <p className="text-3xl font-bold text-white">
                            {loading ? '--' : kpis.critico} <span className="text-sm font-normal text-slate-400">docs en total</span>
                        </p>
                        <p className="text-xs text-red-300 mt-1">Riesgo fiscal / Riesgo de impago</p>
                    </div>
                    <div onClick={() => { setAgingFilter(agingFilter === 'PREVENTIVO' ? 'ALL' : 'PREVENTIVO'); setPage(1); }} className={`bg-amber-500/10 border ${agingFilter === 'PREVENTIVO' ? 'border-amber-400 ring-1 ring-amber-400/50 scale-[1.02] shadow-lg shadow-amber-500/20' : 'border-amber-500/20'} rounded-lg p-4 cursor-pointer hover:bg-amber-500/20 transition-all duration-200`}>
                        <div className="flex items-center gap-2 text-amber-400 text-xs uppercase mb-1 font-semibold">
                            <AlertTriangle size={14} /> Preventivo (8-29 días)
                        </div>
                        <p className="text-3xl font-bold text-white">
                            {loading ? '--' : kpis.preventivo}
                        </p>
                        <p className="text-xs text-amber-300 mt-1">Requiere recordatorio de cierre</p>
                    </div>
                    <div onClick={() => { setAgingFilter(agingFilter === 'NORMAL' ? 'ALL' : 'NORMAL'); setPage(1); }} className={`bg-emerald-500/10 border ${agingFilter === 'NORMAL' ? 'border-emerald-400 ring-1 ring-emerald-400/50 scale-[1.02] shadow-lg shadow-emerald-500/20' : 'border-emerald-500/20'} rounded-lg p-4 cursor-pointer hover:bg-emerald-500/20 transition-all duration-200`}>
                        <div className="flex items-center gap-2 text-emerald-400 text-xs uppercase mb-1 font-semibold">
                            <CheckCircle2 size={14} /> Normal (0-7 días)
                        </div>
                        <p className="text-3xl font-bold text-white">
                            {loading ? '--' : kpis.normal}
                        </p>
                        <p className="text-xs text-emerald-300 mt-1">Emisión reciente, ciclo natural</p>
                    </div>
                </div>
            </div>

            {/* Collapsible Content */}
            {isExpanded && (
                <div className="mt-6">
                    {/* Search / Filters for inbox */}
                    <div className="flex flex-col md:flex-row justify-between gap-4 mb-4 items-center">
                        <div className="flex items-center gap-3">
                            {agingFilter !== 'ALL' && (
                                <button onClick={() => { setAgingFilter('ALL'); setPage(1); }} className="text-xs text-slate-300 hover:text-slate-300 flex items-center gap-1 border border-slate-500/30 bg-slate-600/10 px-3 py-1.5 rounded-md hover:bg-slate-600/20 transition-all ring-1 ring-transparent hover:ring-slate-400/50 font-medium">
                                    <X size={14} /> Filtro Activo: {agingFilter === 'CRITICO' ? 'Crítico (+30 días)' : agingFilter === 'PREVENTIVO' ? 'Preventivo (8-29 días)' : 'Normal (0-7 días)'} (Click para limpiar)
                                </button>
                            )}
                        </div>
                        <div className="flex flex-col md:flex-row justify-end gap-4">
                        <div className="relative w-full md:w-64">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                type="text"
                                placeholder="Buscar Folio..."
                                value={searchFolio}
                                onChange={(e) => setSearchFolio(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && setPage(1)}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:border-slate-500 focus:outline-none"
                            />
                            {searchFolio && (
                                <button onClick={() => { setSearchFolio(''); setPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Table */}
                    </div>
                    <div className="overflow-x-auto max-h-[500px] border border-slate-700 rounded-lg bg-slate-900/30">
                        {loading ? (
                            <div className="flex items-center justify-center h-48 text-slate-400">Cargando bandeja...</div>
                        ) : data.length === 0 ? (
                            <div className="flex items-center justify-center h-48 text-emerald-400 font-semibold border border-dashed border-emerald-500/30 m-4 rounded-lg bg-emerald-500/5">
                                ✓ Bandeja Limpia (No hay facturas pendientes)
                            </div>
                        ) : (
                            <table className="w-full text-sm text-left">
                                <thead className="sticky top-0 bg-slate-800 z-10 shadow-sm">
                                    <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider">
                                        <th className="py-3 px-4 w-32 border-r border-slate-700">Semáforo</th>
                                        <th className="py-3 px-4 cursor-pointer hover:text-white group select-none transition-colors" onClick={() => handleSort('FECHA')}>
                                            <div className="flex items-center gap-1">Días Abierta <span className={`text-[10px] ${sortBy === 'FECHA' ? 'text-slate-300 inline' : 'hidden group-hover:inline text-slate-500'}`}>{sortDir === 'asc' ? '▲' : '▼'}</span></div>
                                        </th>
                                        <th className="py-3 px-4 cursor-pointer hover:text-white group select-none transition-colors" onClick={() => handleSort('FOLIO')}>
                                            <div className="flex items-center gap-1">Folio / Emisión <span className={`text-[10px] ${sortBy === 'FOLIO' ? 'text-slate-300 inline' : 'hidden group-hover:inline text-slate-500'}`}>{sortDir === 'asc' ? '▲' : '▼'}</span></div>
                                        </th>
                                        <th className="py-3 px-4 cursor-pointer hover:text-white group select-none transition-colors" onClick={() => handleSort('CLIENTE')}>
                                            <div className="flex items-center gap-1">Emisora / Cliente <span className={`text-[10px] ${sortBy === 'CLIENTE' ? 'text-slate-300 inline' : 'hidden group-hover:inline text-slate-500'}`}>{sortDir === 'asc' ? '▲' : '▼'}</span></div>
                                        </th>
                                        <th className="py-3 px-4 text-right cursor-pointer hover:text-white group select-none transition-colors" onClick={() => handleSort('SALDO PENDIENTE')}>
                                            <div className="flex items-center justify-end gap-1">Monto <span className={`text-[10px] ${sortBy === 'SALDO PENDIENTE' ? 'text-slate-300 inline' : 'hidden group-hover:inline text-slate-500'}`}>{sortDir === 'asc' ? '▲' : '▼'}</span></div>
                                        </th>
                                        <th className="py-3 px-4 text-center">Acción Sugerida</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-700/50">
                                    {data.map((row) => {
                                        const aging = getAgingInfo(row.FECHA);
                                        return (
                                            <tr key={row.UUID} className="hover:bg-slate-700/30 transition-colors">
                                                <td className={`py-4 px-4 border-r border-slate-700/50 ${aging.bg}`}>
                                                    <div className={`flex items-center font-semibold text-xs gap-1.5 ${aging.color}`}>
                                                        {aging.icon} {aging.label}
                                                    </div>
                                                </td>
                                                <td className="py-4 px-4 text-white font-bold text-center">
                                                    {aging.days} <span className="text-xs text-slate-500 font-normal">días</span>
                                                </td>
                                                <td className="py-4 px-4 text-slate-300 w-48">
                                                    <button 
                                                        onClick={() => handleOpenInvoice(row.UUID, row.FOLIO)}
                                                        className="text-slate-300 font-semibold text-base hover:underline flex items-center gap-1"
                                                    >
                                                        <FileText size={14}/> {row.FOLIO}
                                                    </button>
                                                    <div className="text-xs text-slate-500 mt-1">{formatDate(row.FECHA)}</div>
                                                </td>
                                                <td className="py-4 px-4">
                                                    <div className="text-emerald-400 font-medium truncate max-w-[250px]" title={row.EMPRESA}>{row.EMPRESA}</div>
                                                    <div className="text-slate-400 text-xs mt-0.5 truncate max-w-[250px]" title={row.CLIENTE}>→ {row.CLIENTE}</div>
                                                </td>
                                                <td className="py-4 px-4 text-right">
                                                    <div className="font-bold text-amber-400">{formatCurrency(row["SALDO PENDIENTE"])}</div>
                                                    <div className="text-xs text-slate-500 mt-0.5">PUE/PPD: {row["METODO PAGO"]}</div>
                                                </td>
                                                <td className="py-4 px-4 text-center">
                                                    <div className="flex flex-col gap-1.5 items-center">
                                                        {aging.days >= 30 && <button onClick={() => handleOpenInvoice(row.UUID, row.FOLIO)} className="w-full text-xs font-semibold px-2 py-1 bg-red-500/20 text-red-300 hover:bg-red-500/40 rounded transition-colors border border-red-500/30">Atender Crítico</button>}
                                                        {aging.days >= 8 && aging.days < 30 && <button onClick={() => handleOpenInvoice(row.UUID, row.FOLIO)} className="w-full text-xs font-semibold px-2 py-1 bg-amber-500/20 text-amber-300 hover:bg-amber-500/40 rounded transition-colors border border-amber-500/30">Enviar Aviso</button>}
                                                        {aging.days < 8 && <button onClick={() => handleOpenInvoice(row.UUID, row.FOLIO)} className="w-full text-xs font-semibold px-2 py-1 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/30 rounded transition-colors border border-emerald-500/30">Ver Detalle</button>}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                    
                    {/* Pagination */}
                    {meta && meta.total_pages > 1 && (
                        <div className="flex items-center justify-between mt-4">
                            <div className="text-xs text-slate-500">Resultados ordenados por {sortBy === "FECHA" ? "Días abierta" : sortBy === "SALDO PENDIENTE" ? "Monto" : sortBy} ({sortDir === "asc" ? "Ascendente" : "Descendente"})</div>
                            <div className="flex gap-2">
                                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={meta.page <= 1} className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-xs rounded transition-colors">Anterior</button>
                                <span className="text-xs text-slate-400 flex items-center px-2">Pag {meta.page} de {meta.total_pages}</span>
                                <button onClick={() => setPage(p => Math.min(meta.total_pages, p + 1))} disabled={meta.page >= meta.total_pages} className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-xs rounded transition-colors">Siguiente</button>
                            </div>
                        </div>
                    )}

                    {/* ─── Cobranza Insights (PPD) ─── */}
                    <div className="mt-8 pt-8 border-t border-slate-700">
                        <div className="flex items-center gap-2 mb-6">
                            <Clock className="text-slate-300" size={20} />
                            <h3 className="font-bold text-white text-lg">Inteligencia de Cobranza Histórica (PPD)</h3>
                        </div>

                        {loadingInsights ? (
                            <div className="text-slate-400 text-sm animate-pulse">Analizando historial de complementos de pago...</div>
                        ) : ppdInsights && (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* Velocímetro Global */}
                                <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-5 flex flex-col items-center justify-center text-center">
                                    <h4 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Promedio Global de Cobro</h4>
                                    <div className="text-5xl font-black text-white my-3 flex items-baseline gap-2">
                                        {ppdInsights.promedio_dias_general} <span className="text-lg text-slate-500 font-medium">días</span>
                                    </div>
                                    <p className="text-xs text-slate-500">Tiempo promedio histórico para liquidar facturas PPD en toda la firma.</p>
                                </div>

                                {/* Top Mejores */}
                                <div className="bg-emerald-900/10 border border-emerald-500/20 rounded-xl p-5">
                                    <h4 className="text-emerald-400 text-xs font-bold flex items-center gap-1.5 uppercase tracking-wider mb-4 border-b border-emerald-500/10 pb-2">
                                        <TrendingDown size={14} /> Los Más Veloces en Pagar (Top 5)
                                    </h4>
                                    <div className="space-y-3">
                                        {ppdInsights.top_velocidad?.map((c, i) => (
                                            <div key={i} className="flex justify-between items-center bg-slate-900/50 p-2 rounded-lg">
                                                <div className="text-slate-300 text-xs truncate pr-2 max-w-[200px]" title={c.cliente}>{i+1}. {c.cliente}</div>
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    <span className="text-emerald-400 font-bold text-sm">{c.dias_promedio}d</span>
                                                </div>
                                            </div>
                                        ))}
                                        {(!ppdInsights.top_velocidad || ppdInsights.top_velocidad.length === 0) && (
                                            <div className="text-xs text-slate-500 italic text-center py-2">No hay suficientes datos.</div>
                                        )}
                                    </div>
                                </div>

                                {/* Top Peores */}
                                <div className="bg-red-900/10 border border-red-500/20 rounded-xl p-5">
                                    <h4 className="text-red-400 text-xs font-bold flex items-center gap-1.5 uppercase tracking-wider mb-4 border-b border-red-500/10 pb-2">
                                        <TrendingUp size={14} /> Mayor Riesgo de Morosidad (Top 5)
                                    </h4>
                                    <div className="space-y-3">
                                        {ppdInsights.top_rezago?.map((c, i) => (
                                            <div key={i} className="flex justify-between items-center bg-slate-900/50 p-2 rounded-lg">
                                                <div className="text-slate-300 text-xs truncate pr-2 max-w-[200px]" title={c.cliente}>{i+1}. {c.cliente}</div>
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    <span className="text-red-400 font-bold text-sm">{c.dias_promedio}d</span>
                                                </div>
                                            </div>
                                        ))}
                                        {(!ppdInsights.top_rezago || ppdInsights.top_rezago.length === 0) && (
                                            <div className="text-xs text-slate-500 italic text-center py-2">No hay suficientes datos.</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <InvoiceDetailModal
                identifier={selectedUUID}
                folioLabel={selectedFolioLabel}
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
            />
        </div>
    );
};

export default EmissionsControlModule;
