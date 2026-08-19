import { api } from "../../api/axios";
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  FileText, ChevronDown, ChevronUp, ExternalLink,
  Filter, X, ArrowUpDown, ArrowUp, ArrowDown, CheckSquare, Square, Search
} from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { InvoiceDetailModal } from './InvoiceDetailModal';
import { ExportButton } from './ExportButton';
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
    "FORMA PAGO": string;
    "ESTATUS DE COBRO"?: string;
    ESTATUS: string;
    CANCELADO?: string;
}

interface InvoicesMeta {
    page: number;
    limit: number;
    total_records: number;
    total_pages: number;
    aggregates: { total_neto: number; total_saldo: number };
}

interface Props { filters: DashboardFilters; }

// ─── Opciones de estatus ─────────────────────────────────────────────────────
const STATUS_OPTIONS = [
    { value: 'PENDIENTE', label: 'Pendiente', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' },
    { value: 'PARCIAL',   label: 'Parcial',   color: 'text-slate-300',  bg: 'bg-slate-600/10 border-slate-500/30' },
    { value: 'PAGADO',    label: 'Pagado',    color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
];

const statusBadge = (estatus: string) => {
    const val = (estatus || '').toUpperCase();
    if (val === 'PENDIENTE') return <span className="inline-flex px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">Pendiente</span>;
    if (val === 'PARCIAL')   return <span className="inline-flex px-2 py-0.5 rounded text-xs font-semibold bg-slate-600/10 text-slate-300 border border-slate-500/20">Parcial</span>;
    if (val === 'PAGADO')    return <span className="inline-flex px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Pagado</span>;
    if (val === 'CANCELADO') return <span className="inline-flex px-2 py-0.5 rounded text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">Cancelado</span>;
    return <span className="inline-flex px-2 py-0.5 rounded text-xs font-semibold bg-slate-700 text-slate-400">{estatus || '—'}</span>;
};

interface SearchableSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: string[];
    placeholder: string;
    emptyLabel: string;
}

const SearchableSelect = ({ value, onChange, options, placeholder, emptyLabel }: SearchableSelectProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!isOpen) {
            setSearchQuery('');
        }
    }, [isOpen]);

    const filteredOptions = options.filter(option =>
        (option || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleSelect = (option: string) => {
        onChange(option);
        setIsOpen(false);
    };

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange('');
        setSearchQuery('');
    };

    return (
        <div ref={containerRef} className="relative w-full text-left">
            <button
                type="button"
                onClick={() => setIsOpen(o => !o)}
                className="w-full flex items-center justify-between bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white hover:border-slate-500 transition-colors focus:outline-none"
            >
                <span className={`truncate ${!value ? 'text-slate-400' : 'text-white font-medium'}`}>
                    {value || placeholder}
                </span>
                
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {value && (
                        <span 
                            onClick={handleClear} 
                            className="p-0.5 hover:bg-slate-600 rounded-full text-slate-400 hover:text-white transition-colors"
                            title="Limpiar"
                        >
                            <X size={12} />
                        </span>
                    )}
                    <ChevronDown size={14} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
            </button>

            {isOpen && (
                <div className="absolute z-40 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl overflow-hidden">
                    <div className="p-2 border-b border-slate-700 bg-slate-900/50">
                        <div className="relative">
                            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                autoFocus
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Buscar..."
                                className="w-full bg-slate-900 border border-slate-700 text-white rounded pl-8 pr-2 py-1.5 text-xs focus:outline-none focus:border-slate-500"
                            />
                        </div>
                    </div>

                    <div className="max-h-60 overflow-y-auto">
                        <button
                            type="button"
                            onClick={() => handleSelect('')}
                            className={`w-full text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:bg-slate-700/60 transition-colors ${!value ? 'bg-slate-700/40 text-white' : ''}`}
                        >
                            {emptyLabel}
                        </button>
                        {filteredOptions.length === 0 ? (
                            <p className="text-slate-500 text-xs text-center py-4 italic">Sin resultados</p>
                        ) : (
                            filteredOptions.map((opt) => (
                                <button
                                    key={opt}
                                    type="button"
                                    onClick={() => handleSelect(opt)}
                                    className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-700 transition-colors truncate flex items-center justify-between ${
                                        value === opt ? 'bg-slate-700/40 text-white font-medium border-l-2 border-emerald-500' : 'text-slate-300'
                                    }`}
                                    title={opt}
                                >
                                    <span>{opt}</span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const InvoicesTable = ({ filters }: Props) => {
    const [data, setData] = useState<Invoice[]>([]);
    const [meta, setMeta] = useState<InvoicesMeta | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(50);
    const [isExpanded, setIsExpanded] = useState(true);
    const [showFilters, setShowFilters] = useState(true);

    // Local filters
    const [localEmpresa, setLocalEmpresa] = useState('');
    const [localCliente, setLocalCliente] = useState('');
    const [localConcepto, setLocalConcepto] = useState('');
    const [localFolio, setLocalFolio] = useState('');
    const [localLens, setLocalLens] = useState('');
    const [localYear, setLocalYear] = useState('');
    const [empresaOptions, setEmpresaOptions] = useState<string[]>([]);
    const [clienteOptions, setClienteOptions] = useState<string[]>([]);
    const [conceptoOptions, setConceptoOptions] = useState<string[]>([]);

    // ── Nuevos: multi-status + sort ──────────────────────────────────────────
    const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [showStatusDropdown, setShowStatusDropdown] = useState(false);
    const statusDropdownRef = useRef<HTMLDivElement>(null);
    // ─────────────────────────────────────────────────────────────────────────

    // Modal
    const [selectedUUID, setSelectedUUID] = useState<string | null>(null);
    const [selectedFolioLabel, setSelectedFolioLabel] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleOpenInvoice = (uuid: string, folio: string) => {
        setSelectedUUID(uuid);
        setSelectedFolioLabel(folio);
        setIsModalOpen(true);
    };

    // Cerrar dropdown al click fuera
    useEffect(() => {
        const handle = (e: MouseEvent) => {
            if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
                setShowStatusDropdown(false);
            }
        };
        document.addEventListener('mousedown', handle);
        return () => document.removeEventListener('mousedown', handle);
    }, []);

    // Toggle status checkbox
    const toggleStatus = (val: string) => {
        setSelectedStatuses(prev => {
            const next = new Set(prev);
            if (next.has(val)) next.delete(val);
            else next.add(val);
            return next;
        });
        setPage(1);
    };

    const clearStatuses = () => { setSelectedStatuses(new Set()); setPage(1); };

    // Load filter options
    useEffect(() => {
        const activeEmpresa = localEmpresa || filters.empresa || '';
        const activeCliente = localCliente || filters.cliente || '';
        const activeLens = localLens || filters.lens || '';
        const params = new URLSearchParams();
        if (activeEmpresa) params.append('empresa', activeEmpresa);
        if (activeCliente) params.append('cliente', activeCliente);
        if (activeLens) params.append('lens', activeLens);
        api.get(`/api/dashboard/filters?${params.toString()}`)
            .then(res => {
                if (res.data?.empresas) setEmpresaOptions(res.data.empresas);
                if (res.data?.clientes) setClienteOptions(res.data.clientes);
                if (res.data?.conceptos) setConceptoOptions(res.data.conceptos);
            })
            .catch(err => console.error("Failed to load options", err));
    }, [localEmpresa, localCliente, localLens, filters.empresa, filters.cliente, filters.lens]);

    // Sync global → local
    const prevFiltersRef = useRef<DashboardFilters>(filters);
    useEffect(() => {
        const prev = prevFiltersRef.current;
        if (filters.empresa !== prev.empresa) setLocalEmpresa(filters.empresa || '');
        if (filters.cliente !== prev.cliente) setLocalCliente(filters.cliente || '');
        if (filters.folio !== prev.folio) setLocalFolio(filters.folio || '');
        if (filters.lens !== prev.lens) setLocalLens(filters.lens || '');
        if (filters.status !== prev.status) {
            if (filters.status && filters.status !== 'ALL') {
                const parsed = String(filters.status)
                    .split(',')
                    .map(s => s.trim())
                    .filter(Boolean);
                setSelectedStatuses(new Set(parsed));
            } else {
                setSelectedStatuses(new Set());
            }
        }
        prevFiltersRef.current = filters;
    }, [filters]);

    const clearLocalFilters = () => {
        setLocalEmpresa('');
        setLocalCliente('');
        setLocalConcepto('');
        setLocalFolio('');
        setLocalLens('');
        setLocalYear('');
        setSelectedStatuses(new Set());
    };

    // ── Label del botón de estatus ──────────────────────────────────────────
    const statusLabel = selectedStatuses.size === 0
        ? 'Todos los estatus'
        : selectedStatuses.size === 1
            ? STATUS_OPTIONS.find(o => o.value === Array.from(selectedStatuses)[0])?.label ?? 'Filtrado'
            : `${selectedStatuses.size} estatus`;

    // Fetch principal (sin dependencias fantasma)
    useEffect(() => {
        let isCancelled = false;
        setLoading(true);
        setError(null);

        const timer = setTimeout(() => {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: limit.toString(),
                sortDir,
                t: Date.now().toString() // cache buster bypass
            });

            const activeEmpresa = localEmpresa || filters.empresa;
            const activeCliente = localCliente || filters.cliente;
            const activeFolio = localFolio || filters.folio;
            const activeLens = localLens || filters.lens;

            if (activeEmpresa) params.append('empresa', activeEmpresa);
            if (activeCliente) params.append('cliente', activeCliente);
            if (localConcepto) params.append('concepto', localConcepto);
            if (activeFolio) params.append('folio', activeFolio);
            if (activeLens) params.append('lens', activeLens);
            
            if (localYear) {
                params.append('startDate', `years:${localYear}`);
            } else if (filters.years && filters.years.length > 0 && !filters.startDate) {
                params.append('startDate', `years:${filters.years.join(',')}`);
            } else if (filters.startDate) {
                params.append('startDate', filters.startDate);
            }
            if (filters.endDate) params.append('endDate', filters.endDate);

            // Multi-status: mandar como string separado por coma
            if (selectedStatuses.size > 0) {
                params.append('status', Array.from(selectedStatuses).join(','));
            } else if (filters.status && filters.status !== 'ALL') {
                params.append('status', filters.status);
            }

            api.get(`/api/dashboard/invoices?${params.toString()}`)
                .then(res => {
                    if (!isCancelled) {
                        setData(res.data?.data || []);
                        setMeta(res.data?.meta || null);
                        setLoading(false);
                    }
                })
                .catch(err => {
                    if (!isCancelled) {
                        console.error("Error loading invoices:", err);
                        setError(err?.response?.data?.detail || "No se pudieron cargar las facturas.");
                        setLoading(false);
                    }
                });
        }, 300);

        return () => {
            isCancelled = true;
            clearTimeout(timer);
        };
    }, [page, limit, sortDir, filters, localEmpresa, localCliente, localConcepto, localFolio, localLens, selectedStatuses]);

    // Resetear a pag 1 si cambian filtros (no depender del Set directamente)
    const filterFingerprint = [localEmpresa, localCliente, localConcepto, localFolio, localLens, localYear, Array.from(selectedStatuses).join(','), sortDir, JSON.stringify(filters)].join('|');
    useEffect(() => {
        setPage(1);
    }, [filterFingerprint]);

    if (error) return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 h-20 flex items-center justify-center text-red-400">{error}</div>
    );

    return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
            {/* Header */}
            <div className="flex flex-col gap-4 mb-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                        <div className="p-2 bg-slate-600/10 rounded-lg">
                            <FileText className="text-slate-300" size={24} />
                        </div>
                        <div>
                            <h3 className="font-bold text-white text-lg">Facturas Emitidas</h3>
                            <p className="text-xs text-slate-500">
                                {meta ? `${meta.total_records.toLocaleString()} registros encontrados` : 'Cargando...'}
                            </p>
                        </div>
                        <button className="p-1 hover:bg-slate-700 rounded-full ml-2">
                            {isExpanded ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
                        </button>
                    </div>

                    <div className="flex items-center gap-3 self-end md:self-auto">
                        {meta && (
                            <div className="hidden lg:flex gap-4 mr-4 text-right">
                                <div>
                                    <p className="text-xs text-slate-500 uppercase">Total Neto</p>
                                    <p className="text-sm font-bold text-white">{formatCurrency(meta.aggregates.total_neto)}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 uppercase">Saldo Pend.</p>
                                    <p className="text-sm font-bold text-amber-400">{formatCurrency(meta.aggregates.total_saldo)}</p>
                                </div>
                            </div>
                        )}
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`p-2 rounded-lg border transition-colors ${showFilters ? 'bg-slate-600/20 border-slate-500 text-slate-300' : 'bg-slate-700 border-slate-600 text-slate-400 hover:text-white'}`}
                            title="Filtros Avanzados"
                        >
                            <Filter size={18} />
                        </button>
                        <ExportButton 
                            data={[]} // handled by onExport
                            onExport={async () => {
                                const params = new URLSearchParams({
                                    page: '1',
                                    limit: '100000',
                                    sortDir
                                });
                                const activeEmpresa = localEmpresa || filters.empresa;
                                const activeCliente = localCliente || filters.cliente;
                                const activeFolio = localFolio || filters.folio;
                                const activeLens = localLens || filters.lens;

                                if (activeEmpresa) params.append('empresa', activeEmpresa);
                                if (activeCliente) params.append('cliente', activeCliente);
                                if (localConcepto) params.append('concepto', localConcepto);
                                if (activeFolio) params.append('folio', activeFolio);
                                if (activeLens) params.append('lens', activeLens);
                                
                                if (localYear) {
                                    params.append('startDate', `years:${localYear}`);
                                } else if (filters.years && filters.years.length > 0 && !filters.startDate) {
                                    params.append('startDate', `years:${filters.years.join(',')}`);
                                } else if (filters.startDate) {
                                    params.append('startDate', filters.startDate);
                                }
                                if (filters.endDate) params.append('endDate', filters.endDate);

                                if (selectedStatuses.size > 0) {
                                    params.append('status', Array.from(selectedStatuses).join(','));
                                } else if (filters.status && filters.status !== 'ALL') {
                                    params.append('status', filters.status);
                                }

                                const res = await api.get(`/api/dashboard/invoices?${params.toString()}`);
                                const fullData = res.data?.data || [];
                                return fullData.map((row: any) => ({
                                    ...row,
                                    FECHA: row.FECHA ? row.FECHA.split(' ')[0] : row.FECHA
                                }));
                            }}
                            filename="Reporte_Facturas" 
                            label="Exportar" 
                            className="bg-slate-700 hover:bg-slate-600 border border-slate-600" 
                        />
                    </div>
                </div>

                {/* Filters Panel */}
                {isExpanded && showFilters && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3 p-4 bg-slate-900/50 rounded-lg border border-slate-700 animate-in slide-in-from-top-2">

                        {/* Empresa */}
                        <div>
                            <label className="text-xs text-slate-500 block mb-1">Empresa Emisora</label>
                            <SearchableSelect
                                value={localEmpresa}
                                onChange={setLocalEmpresa}
                                options={empresaOptions}
                                placeholder="Todas"
                                emptyLabel="Todas"
                            />
                        </div>

                        {/* Cliente */}
                        <div>
                            <label className="text-xs text-slate-500 block mb-1">Cliente</label>
                            <SearchableSelect
                                value={localCliente}
                                onChange={setLocalCliente}
                                options={clienteOptions}
                                placeholder="Buscar cliente..."
                                emptyLabel="Todos los clientes"
                            />
                        </div>

                        {/* Folio */}
                        <div>
                            <label className="text-xs text-slate-500 block mb-1">Folio / UUID</label>
                            <div className="relative">
                                <input type="text" value={localFolio} onChange={e => setLocalFolio(e.target.value)}
                                    placeholder="Buscar folio..."
                                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white focus:border-slate-500 focus:outline-none" />
                                {localFolio && (
                                    <button onClick={() => setLocalFolio('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* ── MULTI-STATUS (tipo Excel) ── */}
                        <div ref={statusDropdownRef} className="relative">
                            <label className="text-xs text-slate-500 block mb-1">Estatus de Cobro</label>
                            <button
                                onClick={() => setShowStatusDropdown(p => !p)}
                                className={`w-full flex items-center justify-between px-3 py-2 rounded border text-sm transition-colors
                                    ${selectedStatuses.size > 0
                                        ? 'bg-slate-600/10 border-slate-500/50 text-slate-300'
                                        : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-500'}`}
                            >
                                <span className="truncate">{statusLabel}</span>
                                <ChevronDown size={14} className="text-slate-500 ml-2 shrink-0" />
                            </button>

                            {showStatusDropdown && (
                                <div className="absolute z-30 mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg shadow-xl overflow-hidden">
                                    {/* Seleccionar/Limpiar todo */}
                                    <div className="px-3 py-2 border-b border-slate-700 flex items-center justify-between">
                                        <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Filtrar por estatus</span>
                                        {selectedStatuses.size > 0 && (
                                            <button onClick={clearStatuses} className="text-xs text-slate-500 hover:text-red-400 transition-colors flex items-center gap-1">
                                                <X size={11} /> Limpiar
                                            </button>
                                        )}
                                    </div>
                                    {STATUS_OPTIONS.map(opt => (
                                        <button
                                            key={opt.value}
                                            onClick={() => toggleStatus(opt.value)}
                                            className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-700/60 transition-colors text-left
                                                ${selectedStatuses.has(opt.value) ? 'bg-slate-700/40' : ''}`}
                                        >
                                            {selectedStatuses.has(opt.value)
                                                ? <CheckSquare size={15} className="text-slate-300 shrink-0" />
                                                : <Square size={15} className="text-slate-600 shrink-0" />}
                                            <span className={`text-sm font-medium ${opt.color}`}>{opt.label}</span>
                                            {selectedStatuses.has(opt.value) && (
                                                <span className={`ml-auto text-xs px-1.5 py-0.5 rounded border ${opt.bg} ${opt.color}`}>✓</span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Concepto SAT */}
                        <div>
                            <label className="text-xs text-slate-500 block mb-1">Concepto SAT</label>
                            <SearchableSelect
                                value={localConcepto}
                                onChange={setLocalConcepto}
                                options={conceptoOptions}
                                placeholder="Buscar concepto..."
                                emptyLabel="Todos los conceptos"
                            />
                        </div>

                        {/* Tipo de Riesgo */}
                        <div>
                            <label className="text-xs text-slate-500 block mb-1">Tipo de Riesgo</label>
                            <div className="relative">
                                <select value={localLens} onChange={e => setLocalLens(e.target.value)}
                                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white focus:border-slate-500 focus:outline-none appearance-none">
                                    <option value="">Todos los registros</option>
                                    <option value="debt">Deuda (PPD sin REP)</option>
                                    <option value="intangibles">Servicios Intangibles</option>
                                </select>
                                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                            </div>
                        </div>

                        {/* Año */}
                        <div>
                            <label className="text-xs text-slate-500 block mb-1">Año</label>
                            <div className="relative">
                                <select value={localYear} onChange={e => setLocalYear(e.target.value)}
                                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white focus:border-slate-500 focus:outline-none appearance-none">
                                    <option value="">Todos los años</option>
                                    {Array.from({length: 10}, (_, i) => new Date().getFullYear() + 2 - i).map(y => (
                                        <option key={y} value={y}>{y}</option>
                                    ))}
                                </select>
                                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                            </div>
                        </div>

                        {/* Limpiar */}
                        <div className="flex items-end">
                            <button onClick={clearLocalFilters}
                                className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-sm transition-colors flex items-center justify-center gap-2">
                                <X size={16} /> Limpiar Filtros
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Table */}
            {isExpanded && (
                <>
                    {loading ? (
                        <div className="animate-pulse h-64 flex items-center justify-center text-slate-500">Cargando facturas...</div>
                    ) : data.length === 0 ? (
                        <div className="h-32 flex items-center justify-center text-slate-500 border border-dashed border-slate-700 rounded-lg">
                            No se encontraron facturas con los filtros actuales.
                        </div>
                    ) : (
                        <div className="overflow-x-auto max-h-[600px] border border-slate-700 rounded-lg bg-slate-900/30">
                            <table className="w-full text-sm text-left">
                                <thead className="sticky top-0 bg-slate-800 z-10 shadow-sm">
                                    <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider">
                                        <th className="py-3 px-4">Folio</th>

                                        {/* ── Fecha con orden clickeable ── */}
                                        <th className="py-3 px-4">
                                            <button
                                                onClick={() => { setSortDir(d => d === 'desc' ? 'asc' : 'desc'); setPage(1); }}
                                                className="flex items-center gap-1.5 hover:text-white transition-colors group"
                                                title={sortDir === 'desc' ? 'Más reciente primero — click para invertir' : 'Más antiguo primero — click para invertir'}
                                            >
                                                Fecha
                                                <span className="transition-transform">
                                                    {sortDir === 'desc'
                                                        ? <ArrowDown size={13} className="text-slate-300" />
                                                        : <ArrowUp size={13} className="text-slate-300" />}
                                                </span>
                                            </button>
                                        </th>
                                        <th className="py-3 px-4">Emisora</th>
                                        <th className="py-3 px-4">Cliente</th>
                                        <th className="py-3 px-4 text-center">Método</th>
                                        <th className="py-3 px-4 text-right">Total</th>
                                        <th className="py-3 px-4 text-right">Saldo</th>
                                        <th className="py-3 px-4 text-center">Estatus</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-700">
                                    {data.map((row) => (
                                        <tr key={row.UUID} className="hover:bg-slate-700/40 transition-colors">
                                            <td className="py-3 px-4">
                                                <button
                                                    onClick={() => handleOpenInvoice(row.UUID, row.FOLIO)}
                                                    className="flex items-center gap-1.5 text-slate-300 font-semibold hover:text-white hover:underline group"
                                                >
                                                    {row.FOLIO}
                                                    <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </button>
                                            </td>
                                            <td className="py-3 px-4 text-slate-300 whitespace-nowrap">{formatDate(row.FECHA)}</td>
                                            <td className="py-3 px-4 text-emerald-400/90 max-w-[200px] truncate font-medium" title={row.EMPRESA}>{row.EMPRESA}</td>
                                            <td className="py-3 px-4 text-slate-200 max-w-[200px] truncate" title={row.CLIENTE}>{row.CLIENTE}</td>
                                            <td className="py-3 px-4 text-center text-xs text-slate-400">
                                                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-600">{row["METODO PAGO"]}</span>
                                            </td>
                                            <td className="py-3 px-4 text-right font-medium text-slate-200">{formatCurrency(row["TOTAL NETO"])}</td>
                                            <td className="py-3 px-4 text-right">
                                                {row["SALDO PENDIENTE"] > 1
                                                    ? <span className="text-amber-400 font-semibold">{formatCurrency(row["SALDO PENDIENTE"])}</span>
                                                    : <span className="text-slate-600">-</span>}
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                {statusBadge(row["ESTATUS DE COBRO"] || '')}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination */}
                    {meta && meta.total_pages > 1 && (
                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-700">
                            <div className="flex items-center gap-2">
                                <label className="text-xs text-slate-500">Filas por página</label>
                                <select value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
                                    className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white focus:border-slate-500 focus:outline-none">
                                    {[25, 50, 100, 200, 500].map(n => <option key={n} value={n}>{n}</option>)}
                                </select>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-slate-400">
                                <span>Página {meta.page} de {meta.total_pages}</span>
                                <div className="flex gap-1 ml-2">
                                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={meta.page === 1}
                                        className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded transition-colors">Anterior</button>
                                    <button onClick={() => setPage(p => Math.min(meta.total_pages, p + 1))} disabled={meta.page === meta.total_pages}
                                        className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded transition-colors">Siguiente</button>
                                </div>
                            </div>
                        </div>
                    )}
                </>
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

export default InvoicesTable;
