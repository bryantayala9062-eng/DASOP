import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from "../../api/axios";
import { CreditCard, Search, FileText, Filter, ChevronDown, ChevronUp, Gauge, ExternalLink } from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { InvoiceDetailModal } from './InvoiceDetailModal';
import { ExportButton } from './ExportButton';
import SlowPayersTable from './SlowPayersTable';
import PPDLifecycleTable from './PPDLifecycleTable';
import type { DashboardFilters } from '../../types/filters';

interface Complemento {
    "FOLIO PAGO (REP)": string;
    "FECHA PAGO": string;
    "EMPRESA": string;
    "CLIENTE": string;
    "FOLIO RELACIONADO": string;
    "NUM PARCIALIDAD": number;
    "IMPORTE PAGADO": number;
    "SALDO INSOLUTO": number;
}

interface ComplementoMeta {
    page: number;
    limit: number;
    total_records: number;
    total_pages: number;
    aggregates: {
        total_pagado: number;
        total_saldo: number;
    };
}

interface CollectionBucket {
    label: string;
    amount: number;
    percentage: number;
    range: {
        start: number;
        end: number | null;
    };
}

interface CollectionMetrics {
    dso: number;
    period_days: number;
    average_daily_sales: number;
    receivables: number;
    overdue_balance: number;
    current_balance: number;
    total_sales: number;
    buckets: CollectionBucket[];
}

interface CollectionModuleProps {
    filters?: DashboardFilters;
}

const CollectionModule = ({ filters }: CollectionModuleProps) => {
    const [data, setData] = useState<Complemento[]>([]);
    const [meta, setMeta] = useState<ComplementoMeta | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const [metrics, setMetrics] = useState<CollectionMetrics | null>(null);
    const [metricsLoading, setMetricsLoading] = useState(true);
    const [metricsError, setMetricsError] = useState<string | null>(null);

    // Filters
    const [empresaFilter, setEmpresaFilter] = useState<string>('');
    const [clienteFilter, setClienteFilter] = useState<string>('');
    const [searchFolio, setSearchFolio] = useState<string>('');
    const [empresaOptions, setEmpresaOptions] = useState<string[]>([]);
    const [clienteOptions, setClienteOptions] = useState<string[]>([]);

    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(50);

    // Invoice Detail Modal State
    const [selectedFolio, setSelectedFolio] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleOpenInvoice = (folio: string) => {
        if (!folio || folio === '-') return;
        setSelectedFolio(folio);
        setIsModalOpen(true);
    };

    const filtersKey = useMemo(() => JSON.stringify({
        empresa: filters?.empresa,
        cliente: filters?.cliente,
        folio: filters?.folio,
        startDate: filters?.startDate,
        endDate: filters?.endDate,
        years: filters?.years
    }), [filters]);

    const fetchComplementos = useCallback(() => {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({
            page: page.toString(),
            limit: limit.toString(),
        });
        const activeEmpresa = empresaFilter || filters?.empresa || '';
        const activeCliente = clienteFilter || filters?.cliente || '';
        const activeFolio = searchFolio || filters?.folio || '';

        if (activeEmpresa) params.append('empresa', activeEmpresa);
        if (activeCliente) params.append('cliente', activeCliente);
        if (activeFolio) params.append('folio', activeFolio);

        api.get(`/api/dashboard/complementos?${params.toString()}`)
            .then(res => {
                const result = res.data;
                if (Array.isArray(result)) {
                    setData(result);
                    setMeta(null);
                } else {
                    setData(Array.isArray(result.data) ? result.data : []);
                    setMeta(result.meta || null);
                }
                setLoading(false);
            })
            .catch(err => {
                console.error("Error loading complementos:", err);
                setError("No se pudo cargar la relación de pagos.");
                setLoading(false);
            });
    }, [clienteFilter, empresaFilter, limit, page, searchFolio, filters, filtersKey]);

    const loadMetrics = useCallback(() => {
        setMetricsLoading(true);
        setMetricsError(null);

        const params = new URLSearchParams();
        const activeEmpresa = empresaFilter || filters?.empresa || '';
        const activeCliente = clienteFilter || filters?.cliente || '';
        const activeFolio = searchFolio || filters?.folio || '';

        if (activeEmpresa) params.append('empresa', activeEmpresa);
        if (activeCliente) params.append('cliente', activeCliente);
        if (activeFolio) params.append('folio', activeFolio);
        if (filters?.years && filters.years.length > 0 && !filters?.startDate) {
            params.append('startDate', `years:${filters.years.join(',')}`);
        } else if (filters?.startDate) {
            params.append('startDate', filters.startDate);
        }
        if (filters?.endDate) params.append('endDate', filters.endDate);
        if (filters?.status && filters.status !== 'ALL') params.append('status', filters.status);

        const queryString = params.toString();
        const endpoint = queryString
            ? `/api/dashboard/analytics/collection-metrics?${queryString}`
            : `/api/dashboard/analytics/collection-metrics`;

        api.get(endpoint)
            .then(res => {
                setMetrics(res.data as CollectionMetrics);
            })
            .catch(err => {
                console.error("Error loading collection metrics:", err);
                setMetrics(null);
                setMetricsError("No se pudieron cargar las métricas de cobranza.");
            })
            .finally(() => {
                setMetricsLoading(false);
            });
    }, [clienteFilter, empresaFilter, searchFolio, filters, filtersKey]);

    useEffect(() => {
        fetchComplementos();
    }, [fetchComplementos]);

    useEffect(() => {
        loadMetrics();
    }, [loadMetrics]);

    useEffect(() => {
        const params = new URLSearchParams();
        if (filters?.empresa) params.append('empresa', filters.empresa);
        if (filters?.years && filters.years.length > 0 && !filters?.startDate) {
            params.append('startDate', `years:${filters.years.join(',')}`);
        } else if (filters?.startDate) {
            params.append('startDate', filters.startDate);
        }
        if (filters?.endDate) params.append('endDate', filters.endDate);
        const query = params.toString();
        const url = query ? `/api/dashboard/filters?${query}` : `/api/dashboard/filters`;
        api.get(url)
            .then(res => {
                const result = res.data;
                setEmpresaOptions(Array.isArray(result?.empresas) ? result.empresas : []);
                setClienteOptions(Array.isArray(result?.clientes) ? result.clientes : []);
            })
            .catch(err => {
                console.error("Error loading filters:", err);
            });
    }, [filters, filtersKey]);

    useEffect(() => {
        setEmpresaFilter(filters?.empresa || '');
        setClienteFilter(filters?.cliente || '');
        setSearchFolio(filters?.folio || '');
        setPage(1);
    }, [filters?.empresa, filters?.cliente, filters?.folio]);

    const empresas = useMemo(() => empresaOptions, [empresaOptions]);
    const clientes = useMemo(() => clienteOptions, [clienteOptions]);
    const bucketData = useMemo(() => metrics?.buckets ?? [], [metrics]);

    const totals = useMemo(() => {
        if (meta) {
            return {
                totalPagado: meta.aggregates.total_pagado,
                totalSaldo: meta.aggregates.total_saldo,
                count: meta.total_records,
            };
        }
        const totalPagado = data.reduce((sum, r) => sum + (r["IMPORTE PAGADO"] || 0), 0);
        const totalSaldo = data.reduce((sum, r) => sum + (r["SALDO INSOLUTO"] || 0), 0);
        return { totalPagado, totalSaldo, count: data.length };
    }, [data, meta]);

    const kpiLoading = metricsLoading && !metrics;
    const totalPages = meta?.total_pages || 1;

    const clampPercentage = (value?: number) => {
        if (typeof value !== 'number' || Number.isNaN(value)) return 0;
        return Math.min(100, Math.max(0, value));
    };

    const formatPercentage = (value?: number) => {
        const safeValue = clampPercentage(value);
        return Number.isInteger(safeValue) ? `${safeValue}%` : `${safeValue.toFixed(1)}%`;
    };

    if (loading) {
        return (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 animate-pulse h-20 flex items-center justify-center text-slate-500">
                Cargando relación de pagos...
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 h-20 flex items-center justify-center text-red-400">
                {error}
            </div>
        );
    }

    return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
            {/* Header - Always Visible, Clickable */}
            <div className="space-y-4">
                <div
                    className="flex items-center gap-3 cursor-pointer select-none"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    <div className="p-2 bg-slate-600/10 rounded-lg">
                        <CreditCard className="text-slate-300" size={20} />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-bold text-white">Relación de Pagos (Complementos)</h3>
                        <p className="text-xs text-slate-500">{totals.count.toLocaleString()} registros • Total: {formatCurrency(totals.totalPagado)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <ExportButton
                            data={data}
                            filename="Reporte_Complementos"
                            label="Exportar"
                            className="bg-slate-700 hover:bg-slate-600 border border-slate-600"
                        />
                        <button className="p-2 hover:bg-slate-700 rounded-lg transition-colors" onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}>
                            {isExpanded ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
                        </button>
                    </div>
                </div>

                {/* Always-visible KPI bar */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-4">
                        <div className="flex items-center gap-2 text-slate-400 text-xs uppercase">
                            <Gauge size={14} className="text-slate-300" />
                            <span>DSO</span>
                        </div>
                        <p className="text-3xl font-bold text-white">
                            {kpiLoading ? '---' : (metrics?.dso ?? '—')}
                        </p>
                        <p className="text-xs text-slate-500">Días promedio de cobro</p>
                    </div>
                    <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-4">
                        <p className="text-xs text-slate-400 uppercase">Cartera</p>
                        <p className="text-xl font-bold text-white">
                            {kpiLoading ? '---' : formatCurrency(metrics?.receivables || totals.totalSaldo)}
                        </p>
                        <p className="text-xs text-slate-500 min-h-[1rem]">
                            {kpiLoading ? 'Calculando vencidos…' : `${formatCurrency(metrics?.overdue_balance || 0)} vencido`}
                        </p>
                    </div>
                    <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-4">
                        <p className="text-xs text-slate-400 uppercase">Ventas período</p>
                        <p className="text-xl font-bold text-white">
                            {kpiLoading ? '---' : formatCurrency(metrics?.total_sales || 0)}
                        </p>
                        <p className="text-xs text-slate-500 min-h-[1rem]">
                            {kpiLoading ? 'Determinando periodo…' : `${metrics?.period_days ?? 0} días analizados`}
                        </p>
                    </div>
                    <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-4">
                        <p className="text-xs text-slate-400 uppercase">Velocidad de cobro</p>
                        <p className="text-xl font-bold text-white">
                            {kpiLoading ? '---' : formatCurrency(metrics?.average_daily_sales || 0)}
                        </p>
                        <p className="text-xs text-slate-500">Promedio diario</p>
                    </div>
                </div>
            </div>

            {/* Collapsible Content */}
            {isExpanded && (
                <>
                    {/* Filters Row */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6 mb-6 p-4 bg-slate-900/50 rounded-lg border border-slate-700">
                        <div className="flex items-center gap-2">
                            <Filter size={16} className="text-slate-500" />
                            <span className="text-xs text-slate-400 font-semibold uppercase">Filtros:</span>
                        </div>

                        <div>
                            <label className="text-xs text-slate-500 block mb-1">Empresa Emisora</label>
                            <select
                                value={empresaFilter}
                                onChange={(e) => setEmpresaFilter(e.target.value)}
                                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white focus:border-slate-500 focus:outline-none"
                            >
                                <option value="">Todas las empresas</option>
                                {empresas.map(emp => (
                                    <option key={emp} value={emp}>{emp}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-xs text-slate-500 block mb-1">Cliente</label>
                            <select
                                value={clienteFilter}
                                onChange={(e) => setClienteFilter(e.target.value)}
                                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white focus:border-slate-500 focus:outline-none"
                            >
                                <option value="">Todos los clientes</option>
                                {clientes.map(cli => (
                                    <option key={cli} value={cli}>{cli}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-xs text-slate-500 block mb-1">Buscar Folio</label>
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input
                                    type="text"
                                    placeholder="Ej: REP-001"
                                    value={searchFolio}
                                    onChange={(e) => setSearchFolio(e.target.value)}
                                    className="w-full bg-slate-700 border border-slate-600 rounded pl-9 pr-3 py-2 text-sm text-white focus:border-slate-500 focus:outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                        <div className="lg:col-span-3">
                            <div className="overflow-x-auto max-h-[400px]">
                                <table className="w-full text-sm">
                                    <thead className="sticky top-0 bg-slate-800 z-10">
                                        <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider">
                                            <th className="text-left py-3 px-2">Folio Pago</th>
                                            <th className="text-left py-3 px-2">Fecha</th>
                                            <th className="text-left py-3 px-2">Empresa</th>
                                            <th className="text-left py-3 px-2">Cliente</th>
                                            <th className="text-left py-3 px-2">Factura Rel.</th>
                                            <th className="text-center py-3 px-2">Parc.</th>
                                            <th className="text-right py-3 px-2">Importe Pagado</th>
                                            <th className="text-right py-3 px-2">Saldo Insoluto</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.map((row, i) => (
                                            <tr
                                                key={i}
                                                className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                                            >
                                                <td className="py-2 px-2">
                                                    <span className="inline-flex items-center gap-1 text-slate-300 font-semibold text-xs">
                                                        <FileText size={12} />
                                                        {row["FOLIO PAGO (REP)"] || '-'}
                                                    </span>
                                                </td>
                                                <td className="py-2 px-2 text-slate-400 text-xs">
                                                    {formatDate(row["FECHA PAGO"])}
                                                </td>
                                                <td className="py-2 px-2 text-slate-200 text-xs max-w-[120px] truncate" title={row.EMPRESA}>
                                                    {row.EMPRESA}
                                                </td>
                                                <td className="py-2 px-2 text-slate-200 text-xs max-w-[150px] truncate" title={row.CLIENTE}>
                                                    {row.CLIENTE}
                                                </td>
                                                <td className="py-2 px-2 text-slate-400 text-xs">
                                                    {row["FOLIO RELACIONADO"] && row["FOLIO RELACIONADO"] !== '-' ? (
                                                        <button
                                                            onClick={() => handleOpenInvoice(row["FOLIO RELACIONADO"])}
                                                            className="flex items-center gap-1 hover:text-slate-300 hover:underline transition-colors text-left"
                                                            title="Ver detalle de factura"
                                                        >
                                                            <span className="truncate max-w-[180px]">{row["FOLIO RELACIONADO"]}</span>
                                                            <ExternalLink size={10} />
                                                        </button>
                                                    ) : '-'}
                                                </td>
                                                <td className="py-2 px-2 text-center text-slate-400 text-xs">
                                                    {row["NUM PARCIALIDAD"] || 1}
                                                </td>
                                                <td className="py-2 px-2 text-right text-emerald-400 font-semibold text-xs">
                                                    {formatCurrency(row["IMPORTE PAGADO"] || 0)}
                                                </td>
                                                <td className="py-2 px-2 text-right text-amber-400 font-semibold text-xs">
                                                    {formatCurrency(row["SALDO INSOLUTO"] || 0)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="lg:col-span-2">
                            <h4 className="text-sm font-semibold text-white mb-3">Distribución de cartera</h4>
                            <div className="space-y-2">
                                {metricsLoading && bucketData.length === 0 && (
                                    <div className="border border-dashed border-slate-700 rounded-lg p-4 text-center text-xs text-slate-500">
                                        Generando distribución…
                                    </div>
                                )}
                                {!metricsLoading && bucketData.length === 0 && !metricsError && (
                                    <div className="border border-dashed border-slate-700 rounded-lg p-4 text-center text-xs text-slate-500">
                                        Sin datos de cartera para los filtros aplicados.
                                    </div>
                                )}
                                {metricsError && (
                                    <div className="border border-red-400/40 rounded-lg p-4 text-center text-xs text-red-400">
                                        {metricsError}
                                    </div>
                                )}
                                {bucketData.map(bucket => (
                                    <div key={`${bucket.label}-${bucket.range.start ?? 'start'}-${bucket.range.end ?? 'open'}`} className="border border-slate-700 rounded-lg p-3 bg-slate-900/50">
                                        <div className="flex items-center justify-between text-xs text-slate-400">
                                            <span>{bucket.label}</span>
                                            <span>{formatPercentage(bucket.percentage)}</span>
                                        </div>
                                        <div className="w-full bg-slate-800 rounded-full h-2 mt-2">
                                            <div
                                                className="h-2 rounded-full bg-slate-600"
                                                style={{ width: `${clampPercentage(bucket.percentage)}%` }}
                                            ></div>
                                        </div>
                                        <p className="text-sm font-semibold text-white mt-2">{formatCurrency(bucket.amount)}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Pagination */}
                    {meta && (
                        <div className="mt-4 flex flex-col gap-3 border-t border-slate-700 pt-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                    <span>Mostrando página {meta.page} de {Math.max(totalPages, 1)}</span>
                                    <span>•</span>
                                    <span>{meta.total_records.toLocaleString()} registros totales</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <label className="text-xs text-slate-500">Por página</label>
                                    <select
                                        value={limit}
                                        onChange={(e) => {
                                            setPage(1);
                                            setLimit(Number(e.target.value));
                                        }}
                                        className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white focus:border-slate-500 focus:outline-none"
                                    >
                                        {[25, 50, 100, 200, 500].map(size => (
                                            <option key={size} value={size}>{size}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        className="px-3 py-1 rounded bg-slate-700 text-xs disabled:opacity-40"
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={meta.page <= 1}
                                    >
                                        Prev
                                    </button>
                                    <span className="text-xs text-slate-400">{meta.page}</span>
                                    <button
                                        className="px-3 py-1 rounded bg-slate-700 text-xs disabled:opacity-40"
                                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        disabled={meta.page >= totalPages}
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Totals Footer */}
                    <div className="mt-4 pt-4 border-t border-slate-700 grid grid-cols-3 gap-4">
                        <div className="text-center">
                            <p className="text-xs text-slate-500 uppercase">Registros</p>
                            <p className="text-xl font-bold text-white">{totals.count.toLocaleString()}</p>
                        </div>
                        <div className="text-center">
                            <p className="text-xs text-slate-500 uppercase">Total Pagado</p>
                            <p className="text-xl font-bold text-emerald-400">{formatCurrency(totals.totalPagado)}</p>
                        </div>
                        <div className="text-center">
                            <p className="text-xs text-slate-500 uppercase">Saldo Insoluto</p>
                            <p className="text-xl font-bold text-amber-400">{formatCurrency(totals.totalSaldo)}</p>
                        </div>
                    </div>

                    {/* Additional Payment Metrics */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6 pt-6 border-t border-slate-700">
                        <SlowPayersTable filters={filters} />
                        <PPDLifecycleTable filters={filters} />
                    </div>
                </>
            )}

            <InvoiceDetailModal
                identifier={selectedFolio}
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
            />
        </div>
    );
};

export default CollectionModule;
