import { api } from "../../api/axios";

import { useEffect, useMemo, useState } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts';
import { Building2, DollarSign, Users, FileText, ChevronDown, ChevronUp, TrendingDown } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import type { DashboardFilters } from '../../types/filters';

interface CompanySummary {
    empresa: string;
    total_facturado: number;
    saldo_pendiente: number;
    num_facturas: number;
    num_clientes: number;
}

interface CompanyDetail {
    empresa: string;
    kpis: {
        total_facturado: number;
        saldo_pendiente: number;
        num_facturas: number;
        num_clientes: number;
        porcentaje_pendiente: number;
    };
    top_clientes: { cliente: string; total: number; saldo: number; facturas: number }[];
    monthly_trend: { month: string; total: number }[];
    status_distribution: Record<string, number>;
}

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

interface CompanyViewPanelProps {
    filters?: DashboardFilters;
}

const CompanyViewPanel = ({ filters }: CompanyViewPanelProps) => {
    const [companies, setCompanies] = useState<CompanySummary[]>([]);
    const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
    const [companyDetail, setCompanyDetail] = useState<CompanyDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [detailLoading, setDetailLoading] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    const filtersKey = useMemo(() => JSON.stringify({
        empresa: filters?.empresa,
        startDate: filters?.startDate,
        endDate: filters?.endDate,
        years: filters?.years
    }), [filters]);

    useEffect(() => {
        // Backend returns array directly (not wrapped in {data: []})
        const params = new URLSearchParams();
        if (filters?.empresa) params.append('empresa', filters.empresa);
        if (filters?.years && filters.years.length > 0 && !filters?.startDate) {
            params.append('startDate', `years:${filters.years.join(',')}`);
        } else if (filters?.startDate) {
            params.append('startDate', filters.startDate);
        }
        if (filters?.endDate) params.append('endDate', filters.endDate);

        const query = params.toString();
        const url = query ? `/api/dashboard/empresas?${query}` : `/api/dashboard/empresas`;
        api.get(url)
            .then(res => {
                const payload = res.data;
                setCompanies(Array.isArray(payload) ? payload : (payload?.data || []));
                setLoading(false);
            })
            .catch(err => {
                console.error("Error loading companies:", err);
                setLoading(false);
            });
    }, [filtersKey, filters]);

    const loadCompanyDetail = async (empresa: string) => {
        if (selectedCompany === empresa) {
            setSelectedCompany(null);
            setCompanyDetail(null);
            return;
        }

        setSelectedCompany(empresa);
        setDetailLoading(true);

        try {
            const params = new URLSearchParams();
            if (filters?.startDate) params.append('startDate', filters.startDate);
            if (filters?.endDate) params.append('endDate', filters.endDate);
            if (filters?.years && filters.years.length > 0 && !filters?.startDate) {
                params.append('startDate', `years:${filters.years.join(',')}`);
            }
            const query = params.toString();
            const url = query
                ? `/api/dashboard/empresas/${encodeURIComponent(empresa)}/stats?${query}`
                : `/api/dashboard/empresas/${encodeURIComponent(empresa)}/stats`;
            const res = await api.get(url);
            setCompanyDetail(res.data);
        } catch (err) {
            console.error("Error loading company detail:", err);
        } finally {
            setDetailLoading(false);
        }
    };

    const formatCompanyCurrency = (amount: number) => formatCurrency(amount, {
        minimumFractionDigits: 0,
        notation: 'compact',
        compactDisplay: 'short'
    });

    if (loading) {
        return (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 animate-pulse h-32 flex items-center justify-center text-slate-500">
                Cargando empresas emisoras...
            </div>
        );
    }

    const statusColors: Record<string, string> = {
        'PAGADO': '#10b981',
        'PENDIENTE': '#ef4444',
        'PARCIAL': '#f59e0b'
    };

    return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
            {/* Header - Collapsible */}
            <div
                className="flex items-center gap-3 cursor-pointer select-none"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="p-2 bg-purple-500/10 rounded-lg">
                    <Building2 className="text-purple-500" size={24} />
                </div>
                <div className="flex-1">
                    <h3 className="font-bold text-white text-lg">Vista por Empresa Emisora</h3>
                    <p className="text-xs text-slate-500">{companies.length} empresas • Click para expandir y ver detalles</p>
                </div>
                <button className="p-2 hover:bg-slate-700 rounded-lg transition-colors">
                    {isExpanded ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
                </button>
            </div>

            {/* Collapsible Content */}
            {isExpanded && (
                <div className="mt-6">
                    {/* Companies Table */}
                    <div className="overflow-x-auto max-h-[400px]">
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-slate-800 z-10">
                                <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider">
                                    <th className="text-left py-3 px-3">Empresa</th>
                                    <th className="text-right py-3 px-3">Total Facturado</th>
                                    <th className="text-right py-3 px-3">Saldo Pendiente</th>
                                    <th className="text-right py-3 px-3">Facturas</th>
                                    <th className="text-right py-3 px-3">Clientes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {companies.map((company, i) => (
                                    <>
                                        <tr
                                            key={i}
                                            className={`border-b border-slate-700/50 cursor-pointer transition-colors ${selectedCompany === company.empresa ? 'bg-slate-600/10' : 'hover:bg-slate-700/30'
                                                }`}
                                            onClick={() => loadCompanyDetail(company.empresa)}
                                        >
                                            <td className="py-3 px-3">
                                                <div className="flex items-center gap-2">
                                                    <Building2 size={14} className="text-slate-500" />
                                                    <span className="text-white font-medium max-w-[200px] truncate" title={company.empresa}>
                                                        {company.empresa}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="py-3 px-3 text-right text-emerald-400 font-semibold">
                                                {formatCompanyCurrency(company.total_facturado)}
                                            </td>
                                            <td className="py-3 px-3 text-right text-red-400 font-semibold">
                                                {formatCompanyCurrency(company.saldo_pendiente)}
                                            </td>
                                            <td className="py-3 px-3 text-right text-slate-400">
                                                {company.num_facturas.toLocaleString()}
                                            </td>
                                            <td className="py-3 px-3 text-right text-slate-400">
                                                {company.num_clientes}
                                            </td>
                                        </tr>

                                        {/* Expanded Detail Row */}
                                        {selectedCompany === company.empresa && (
                                            <tr key={`detail-${i}`}>
                                                <td colSpan={5} className="bg-slate-900/50 p-4">
                                                    {detailLoading ? (
                                                        <div className="text-center py-8 text-slate-500">Cargando detalles...</div>
                                                    ) : companyDetail ? (
                                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                                            {/* KPIs Mini Cards */}
                                                            <div className="space-y-3">
                                                                <h4 className="text-sm font-semibold text-white mb-3">Resumen</h4>
                                                                <div className="grid grid-cols-2 gap-2">
                                                                    <div className="bg-slate-800 p-3 rounded-lg">
                                                                        <DollarSign size={14} className="text-emerald-400 mb-1" />
                                                                        <p className="text-xs text-slate-500">Total</p>
                                                                        <p className="text-sm font-bold text-white">{formatCompanyCurrency(companyDetail.kpis.total_facturado)}</p>
                                                                    </div>
                                                                    <div className="bg-slate-800 p-3 rounded-lg">
                                                                        <TrendingDown size={14} className="text-red-400 mb-1" />
                                                                        <p className="text-xs text-slate-500">Pendiente</p>
                                                                        <p className="text-sm font-bold text-red-400">{companyDetail.kpis.porcentaje_pendiente}%</p>
                                                                    </div>
                                                                    <div className="bg-slate-800 p-3 rounded-lg">
                                                                        <FileText size={14} className="text-slate-300 mb-1" />
                                                                        <p className="text-xs text-slate-500">Facturas</p>
                                                                        <p className="text-sm font-bold text-white">{companyDetail.kpis.num_facturas}</p>
                                                                    </div>
                                                                    <div className="bg-slate-800 p-3 rounded-lg">
                                                                        <Users size={14} className="text-purple-500 mb-1" />
                                                                        <p className="text-xs text-slate-500">Clientes</p>
                                                                        <p className="text-sm font-bold text-white">{companyDetail.kpis.num_clientes}</p>
                                                                    </div>
                                                                </div>

                                                                {/* Status Pie */}
                                                                <div className="h-[120px]">
                                                                    <ResponsiveContainer width="100%" height="100%">
                                                                        <PieChart>
                                                                            <Pie
                                                                                data={Object.entries(companyDetail.status_distribution).map(([name, value]) => ({ name, value }))}
                                                                                cx="50%"
                                                                                cy="50%"
                                                                                innerRadius={25}
                                                                                outerRadius={45}
                                                                                dataKey="value"
                                                                            >
                                                                                {Object.keys(companyDetail.status_distribution).map((status, index) => (
                                                                                    <Cell key={index} fill={statusColors[status] || COLORS[index % COLORS.length]} />
                                                                                ))}
                                                                            </Pie>
                                                                            <Tooltip />
                                                                        </PieChart>
                                                                    </ResponsiveContainer>
                                                                </div>
                                                            </div>

                                                            {/* Monthly Trend */}
                                                            <div>
                                                                <h4 className="text-sm font-semibold text-white mb-3">Tendencia Mensual</h4>
                                                                <div className="h-[180px]">
                                                                    <ResponsiveContainer width="100%" height="100%">
                                                                        <BarChart data={companyDetail.monthly_trend}>
                                                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                                                            <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 9 }} />
                                                                            <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fill: '#94a3b8', fontSize: 9 }} width={50} />
                                                                            <Tooltip
                                                                                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px' }}
                                                                            />
                                                                            <Bar dataKey="total" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
                                                                        </BarChart>
                                                                    </ResponsiveContainer>
                                                                </div>
                                                            </div>

                                                            {/* Top Clients */}
                                                            <div>
                                                                <h4 className="text-sm font-semibold text-white mb-3">Top Clientes</h4>
                                                                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                                                                    {companyDetail.top_clientes.slice(0, 5).map((client, idx) => (
                                                                        <div key={idx} className="flex items-center justify-between bg-slate-800 p-2 rounded text-xs">
                                                                            <span className="text-slate-300 truncate max-w-[120px]" title={client.cliente}>
                                                                                {client.cliente}
                                                                            </span>
                                                                            <span className="text-emerald-400 font-semibold">{formatCompanyCurrency(client.total)}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : null}
                                                </td>
                                            </tr>
                                        )}
                                    </>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CompanyViewPanel;
