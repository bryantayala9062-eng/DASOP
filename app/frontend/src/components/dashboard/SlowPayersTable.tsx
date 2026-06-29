import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import SlowPayersTabs from './SlowPayersTabs';
import { formatCurrency } from '../../utils/formatters';

// Backend returns snake_case fields
interface SlowPayer {
    cliente: string;
    saldo_pendiente: number;
    dias_promedio: number;
    facturas_pendientes: number;
}

interface AgingBucket {
    bucket: string;
    saldo: number;
    facturas: number;
    clientes: number;
}

interface ParetoItem {
    cliente: string;
    total: number;
    porcentaje_acumulado: number;
    facturas: number;
}

import { api } from "../../api/axios";
import type { DashboardFilters } from '../../types/filters';

interface SlowPayersTableProps {
    filters?: DashboardFilters;
}

const SlowPayersTable = ({ filters }: SlowPayersTableProps) => {
    const [slowPayers, setSlowPayers] = useState<SlowPayer[]>([]);
    const [agingData, setAgingData] = useState<AgingBucket[]>([]);
    const [paretoData, setParetoData] = useState<ParetoItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isExpanded, setIsExpanded] = useState(true);

    const filtersKey = useMemo(() => JSON.stringify({
        empresa: filters?.empresa,
        cliente: filters?.cliente,
        startDate: filters?.startDate,
        endDate: filters?.endDate,
        years: filters?.years,
        status: filters?.status,
        folio: filters?.folio
    }), [filters]);

    useEffect(() => {
        setLoading(true);
        const params = new URLSearchParams();
        if (filters?.empresa) params.append('empresa', filters.empresa);
        if (filters?.cliente) params.append('cliente', filters.cliente);
        if (filters?.folio) params.append('folio', filters.folio);
        if (filters?.years && filters.years.length > 0 && !filters?.startDate) {
            params.append('startDate', `years:${filters.years.join(',')}`);
        } else if (filters?.startDate) {
            params.append('startDate', filters.startDate);
        }
        if (filters?.endDate) params.append('endDate', filters.endDate);
        if (filters?.status && filters.status !== 'ALL') params.append('status', filters.status);
        const query = params.toString();
        const suffix = query ? `?${query}` : '';

        Promise.all([
            api.get(`/api/dashboard/analytics/slow-payers${suffix}`),
            api.get(`/api/dashboard/analytics/aging${suffix}`),
            api.get(`/api/dashboard/analytics/pareto${suffix}`),
        ])
            .then(([slow, aging, pareto]) => {
                const slowData = slow.data;
                setSlowPayers(Array.isArray(slowData) ? slowData : (slowData?.data || []));
                const agingPayload = aging.data;
                setAgingData(Array.isArray(agingPayload) ? agingPayload : (agingPayload?.buckets || []));
                const paretoPayload = pareto.data;
                setParetoData(Array.isArray(paretoPayload) ? paretoPayload : []);
                setLoading(false);
            })
            .catch(err => {
                console.error("Error loading slow payer analytics:", err);
                setError("No se pudieron cargar las métricas de morosidad.");
                setLoading(false);
            });
    }, [filters, filtersKey]);

    const totalDeuda = slowPayers.reduce((sum, r) => sum + (r.saldo_pendiente || 0), 0);

    if (loading) {
        return (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 animate-pulse h-20 flex items-center justify-center text-slate-500">
                Cargando datos de pagadores...
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
            <div
                className="flex items-center gap-3 cursor-pointer select-none"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="p-2 bg-red-500/10 rounded-lg">
                    <AlertTriangle className="text-red-400" size={20} />
                </div>
                <div className="flex-1">
                    <h3 className="font-bold text-white">Clientes con Mayor Morosidad</h3>
                    <p className="text-xs text-slate-500">Top 10 • Deuda Total: {formatCurrency(totalDeuda, { minimumFractionDigits: 0 })}</p>
                </div>
                <button className="p-2 hover:bg-slate-700 rounded-lg transition-colors">
                    {isExpanded ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
                </button>
            </div>

            {/* Collapsible Content */}
            {isExpanded && (
                <div className="mt-4">
                    <SlowPayersTabs slowPayers={slowPayers} aging={agingData} pareto={paretoData} />
                </div>
            )}
        </div>
    );
};

export default SlowPayersTable;
