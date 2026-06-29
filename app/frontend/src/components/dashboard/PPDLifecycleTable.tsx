import { useEffect, useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { api } from "../../api/axios";
import type { DashboardFilters } from '../../types/filters';

// Represents the structure of PPD lifecycle metrics
interface PPDLifecycleData {
    promedio_dias_general: number;
    top_rezago: Array<{
        cliente: string;
        dias_promedio: number;
        facturas_pagadas: number;
    }>;
}

interface PPDLifecycleTableProps {
    filters?: DashboardFilters;
}

const PPDLifecycleTable = ({ filters }: PPDLifecycleTableProps) => {
    const [ppdLifecycle, setPpdLifecycle] = useState<PPDLifecycleData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const filtersKey = useMemo(() => JSON.stringify({
        empresa: filters?.empresa,
        startDate: filters?.startDate,
        endDate: filters?.endDate,
        years: filters?.years
    }), [filters]);

    useEffect(() => {
        setLoading(true);
        const params = new URLSearchParams();
        if (filters?.empresa) params.append('empresa', filters.empresa);
        if (filters?.years && filters.years.length > 0 && !filters?.startDate) {
            params.append('startDate', `years:${filters.years.join(',')}`);
        } else if (filters?.startDate) {
            params.append('startDate', filters.startDate);
        }
        if (filters?.endDate) params.append('endDate', filters.endDate);
        const query = params.toString();
        const url = query ? `/api/dashboard/analytics/ppd-lifecycle?${query}` : `/api/dashboard/analytics/ppd-lifecycle`;
        api.get(url)
            .then(res => {
                const data = res.data;
                // Verify it's not a generic error/array
                if (data && !Array.isArray(data)) {
                    setPpdLifecycle(data as PPDLifecycleData);
                } else {
                    setPpdLifecycle(null);
                }
                setLoading(false);
            })
            .catch(err => {
                console.error("Error loading ppd-lifecycle analytics:", err);
                setError("No se pudieron cargar las métricas de días de pago PPD.");
                setLoading(false);
            });
    }, [filters, filtersKey]);

    if (loading) {
        return (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 animate-pulse h-20 flex items-center justify-center text-slate-500">
                Cargando métricas de pago...
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

    if (!ppdLifecycle || !ppdLifecycle.top_rezago || ppdLifecycle.top_rezago.length === 0) {
        return null;
    }

    return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden flex flex-col h-full">
            <div className="px-5 py-4 border-b border-slate-700 bg-amber-500/10 flex justify-between items-center">
                <h3 className="text-amber-400 font-semibold flex items-center gap-2">
                    <TrendingUp size={18} /> Top Clientes con Peor Promedio de Pago (PPD)
                </h3>
                <div className="text-right">
                    <span className="text-xs text-amber-500 block leading-tight">Métrica Global</span>
                    <span className="text-sm text-white font-bold">{ppdLifecycle.promedio_dias_general} días prom.</span>
                </div>
            </div>
            <div className="overflow-x-auto max-h-[300px] overflow-y-auto flex-1 p-2">
                <ul className="space-y-1">
                    {ppdLifecycle.top_rezago.map((c, i) => (
                        <li key={i} className="flex justify-between items-center bg-slate-900/40 hover:bg-slate-700/30 p-2 rounded-lg border border-slate-800">
                            <div className="flex items-center gap-3 overflow-hidden">
                                <span className="text-xs font-bold text-slate-500 w-4 block flex-shrink-0">#{i + 1}</span>
                                <div className="flex flex-col overflow-hidden">
                                    <span className="text-sm text-white truncate max-w-[200px]" title={c.cliente}>{c.cliente}</span>
                                    <span className="text-[10px] text-slate-400">{c.facturas_pagadas} Facturas Pagadas</span>
                                </div>
                            </div>
                            <div className="flex flex-col items-end flex-shrink-0 ml-2">
                                <span className={`text-sm font-bold ${c.dias_promedio > 30 ? 'text-red-400' : 'text-amber-400'}`}>{c.dias_promedio}</span>
                                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Días</span>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

export default PPDLifecycleTable;
