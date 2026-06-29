import { api } from "../../api/axios";

import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { PieChart as PieChartIcon, Activity, Briefcase, Package, LayoutGrid } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

interface MixData {
    category: string;
    value: number;
    percentage: number;
}

interface ConceptMix {
    tipo: string;
    monto: number;
    pct: number;
}

interface InvoiceDetail {
    tipo: string;
    count: number;
    count_pct: number;
    monto: number;
    monto_pct: number;
}

interface DonutItem {
    name: string;
    value: number;
}

interface RatioData {
    concept_mix: ConceptMix[];
    invoice_donut: DonutItem[];
    invoice_detail: InvoiceDetail[];
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'];
const TIPO_COLORS: Record<string, string> = {
    'Servicio': '#3b82f6',
    'Producto': '#10b981',
    'Mixta': '#f59e0b',
};
const TIPO_ICONS: Record<string, typeof Briefcase> = {
    'Servicio': Briefcase,
    'Producto': Package,
    'Mixta': LayoutGrid,
};

const IncomeMixChart = () => {
    const [data, setData] = useState<MixData[]>([]);
    const [ratioData, setRatioData] = useState<RatioData | null>(null);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'mix' | 'ratio'>('mix');

    useEffect(() => {
        Promise.all([
            api.get(`/api/dashboard/analytics/income-mix`).then(res => res.data),
            api.get(`/api/dashboard/analytics/product-service-ratio`).then(res => res.data),
        ])
            .then(([mix, ratio]) => {
                setData(Array.isArray(mix) ? mix : []);
                setRatioData(ratio);
                setLoading(false);
            })
            .catch(err => {
                console.error("Error loading income mix:", err);
                setLoading(false);
            });
    }, []);

    if (loading) {
        return (
            <div className="card animate-pulse h-80 flex items-center justify-center text-slate-500">
                Cargando análisis...
            </div>
        );
    }

    return (
        <div className="card h-full">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-brand-500/10 rounded-lg">
                    {view === 'mix' ? <PieChartIcon className="text-brand-500" size={20} /> : <Activity className="text-brand-500" size={20} />}
                </div>
                <div>
                    <h3 className="font-bold text-white">{view === 'mix' ? 'Mix de Ingresos' : 'Productos vs Servicios'}</h3>
                    <p className="text-xs text-slate-500">{view === 'mix' ? 'Top 10 categorías SAT' : 'Clasificación por Clave de Unidad (E48 = Servicio)'}</p>
                </div>
                <div className="ml-auto flex gap-2 bg-dark-800/60 rounded-full p-1">
                    <button
                        className={`px-3 py-1 text-xs rounded-full transition-colors ${view === 'mix' ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-white'}`}
                        onClick={() => setView('mix')}
                    >
                        Mix
                    </button>
                    <button
                        className={`px-3 py-1 text-xs rounded-full transition-colors ${view === 'ratio' ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-white'}`}
                        onClick={() => setView('ratio')}
                    >
                        Tipo
                    </button>
                </div>
            </div>

            {view === 'mix' ? (
                /* ========== MIX VIEW ========== */
                <>
                    <div className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={data}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={50}
                                    outerRadius={90}
                                    paddingAngle={2}
                                    dataKey="value"
                                    nameKey="category"
                                    label={({ value }) => `${((value ?? 0) / (data.reduce((sum, item) => sum + item.value, 0) || 1) * 100).toFixed(1)}%`}
                                    labelLine={false}
                                >
                                    {data.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="transparent" />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px' }}
                                    formatter={(value?: number, name?: string) => [formatCurrency(value ?? 0, { notation: 'compact', compactDisplay: 'short', minimumFractionDigits: 0 }), name ?? '']}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="mt-2 max-h-[120px] overflow-y-auto">
                        <div className="grid grid-cols-1 gap-1 text-xs">
                            {data.slice(0, 5).map((item, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                    <span className="text-slate-400 truncate flex-1" title={item.category}>{item.category}</span>
                                    <span className="text-slate-200 font-medium">{item.percentage}%</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            ) : (
                /* ========== RATIO VIEW - 3 Panels ========== */
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Panel 1: % Mix por Conceptos */}
                    <div className="bg-dark-800/40 rounded-xl p-4 border border-dark-700/50">
                        <div className="flex items-center gap-2 mb-1">
                            <PieChartIcon size={16} className="text-brand-400" />
                            <h4 className="text-sm font-bold text-white">% Mix por Conceptos</h4>
                        </div>
                        <p className="text-[10px] text-slate-500 mb-4">Por Monto Total ($)</p>

                        <table className="w-full text-xs">
                            <thead>
                                <tr className="text-slate-500 border-b border-dark-700/50">
                                    <th className="text-left pb-2 font-medium">Tipo</th>
                                    <th className="text-right pb-2 font-medium">Monto</th>
                                    <th className="text-right pb-2 font-medium">%</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ratioData?.concept_mix.map((item, i) => {
                                    const Icon = TIPO_ICONS[item.tipo] || Briefcase;
                                    return (
                                        <tr key={i} className="border-b border-dark-700/30">
                                            <td className="py-3">
                                                <div className="flex items-center gap-2">
                                                    <Icon size={14} style={{ color: TIPO_COLORS[item.tipo] || '#94a3b8' }} />
                                                    <span className="text-white font-medium">{item.tipo}</span>
                                                </div>
                                            </td>
                                            <td className="text-right text-slate-300 py-3">
                                                {formatCurrency(item.monto)}
                                            </td>
                                            <td className="text-right py-3">
                                                <span
                                                    className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold"
                                                    style={{
                                                        color: TIPO_COLORS[item.tipo] || '#94a3b8',
                                                        backgroundColor: `${TIPO_COLORS[item.tipo] || '#94a3b8'}15`,
                                                    }}
                                                >
                                                    {item.pct}%
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Panel 2: Donut Chart - Mix por Facturas */}
                    <div className="bg-dark-800/40 rounded-xl p-4 border border-dark-700/50">
                        <div className="flex items-center gap-2 mb-1">
                            <PieChartIcon size={16} className="text-brand-400" />
                            <h4 className="text-sm font-bold text-white">Mix por Facturas</h4>
                        </div>
                        <p className="text-[10px] text-slate-500 mb-2">Por Monto de Factura ($)</p>

                        <div className="h-[200px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={ratioData?.invoice_donut || []}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={55}
                                        outerRadius={80}
                                        paddingAngle={3}
                                        dataKey="value"
                                        nameKey="name"
                                        strokeWidth={0}
                                    >
                                        {(ratioData?.invoice_donut || []).map((item, index) => (
                                            <Cell key={`d-${index}`} fill={TIPO_COLORS[item.name] || COLORS[index]} stroke="transparent" />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                                        formatter={(value: any, name: any) => [
                                            formatCurrency(value, { notation: 'compact', compactDisplay: 'short' }),
                                            name
                                        ]}
                                    />
                                    <Legend
                                        wrapperStyle={{ fontSize: '11px' }}
                                        formatter={(value: string) => <span style={{ color: TIPO_COLORS[value] || '#94a3b8' }}>{value}</span>}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Panel 3: Detalle por Facturas */}
                    <div className="bg-dark-800/40 rounded-xl p-4 border border-dark-700/50">
                        <div className="flex items-center gap-2 mb-1">
                            <PieChartIcon size={16} className="text-brand-400" />
                            <h4 className="text-sm font-bold text-white">Detalle por Facturas</h4>
                        </div>
                        <p className="text-[10px] text-slate-500 mb-4">Cantidad de Notas + Monto Total</p>

                        <table className="w-full text-xs">
                            <thead>
                                <tr className="text-slate-500 border-b border-dark-700/50">
                                    <th className="text-left pb-2 font-medium">Tipo</th>
                                    <th className="text-center pb-2 font-medium"># Facturas</th>
                                    <th className="text-center pb-2 font-medium">% Facturas</th>
                                    <th className="text-right pb-2 font-medium">Monto</th>
                                    <th className="text-right pb-2 font-medium">% Monto</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ratioData?.invoice_detail.map((item, i) => {
                                    const Icon = TIPO_ICONS[item.tipo] || Briefcase;
                                    const color = TIPO_COLORS[item.tipo] || '#94a3b8';
                                    return (
                                        <tr key={i} className="border-b border-dark-700/30">
                                            <td className="py-3">
                                                <div className="flex items-center gap-2">
                                                    <Icon size={14} style={{ color }} />
                                                    <span className="text-white font-medium">{item.tipo}</span>
                                                </div>
                                            </td>
                                            <td className="text-center text-slate-300 py-3 font-semibold">
                                                {item.count.toLocaleString()}
                                            </td>
                                            <td className="text-center text-slate-400 py-3">
                                                {item.count_pct}%
                                            </td>
                                            <td className="text-right text-slate-300 py-3">
                                                {formatCurrency(item.monto)}
                                            </td>
                                            <td className="text-right py-3">
                                                <span
                                                    className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold"
                                                    style={{
                                                        color,
                                                        backgroundColor: `${color}15`,
                                                    }}
                                                >
                                                    {item.monto_pct}%
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default IncomeMixChart;
