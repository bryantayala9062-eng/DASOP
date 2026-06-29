import { useState, useEffect } from 'react';
import { api } from '../../api/axios';
import {
    ShieldAlert, AlertTriangle, FileWarning, Copy, FileText,
    DollarSign, Target, CalendarClock, CreditCard, ChevronDown,
    ChevronUp, Loader2, ExternalLink, TrendingUp, AlertOctagon,
    Zap
} from 'lucide-react';
import { InvoiceDetailModal } from './InvoiceDetailModal';
import AuditRiskPanel from './AuditRiskPanel';

// ─── Types ─────────────────────────────
interface RiskAlert {
    tipo: string;
    severidad: string;
    folio: string;
    uuid: string;
    empresa: string;
    cliente: string;
    monto: number;
    fecha: string;
    descripcion: string;
    detalles: Record<string, any>;
}

interface RiskCategory {
    id: string;
    titulo: string;
    severidad: string;
    icono: string;
    count: number;
    monto_total: number;
    alertas: RiskAlert[];
}

interface RiskScanResult {
    score_global: number;
    nivel_riesgo: string;
    resumen: {
        total_alertas: number;
        monto_comprometido: number;
        por_severidad: Record<string, number>;
    };
    categorias: RiskCategory[];
}

// ─── Helpers ──────────────────────────
const formatCurrency = (n: number) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n ?? 0);

const formatCompact = (n: number): string => {
    if (!n) return '$0';
    if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1_000) return '$' + (n / 1_000).toFixed(0) + 'K';
    return '$' + n.toFixed(0);
};

const SEVERITY_CONFIG: Record<string, { bg: string; text: string; border: string; badge: string }> = {
    CRITICO: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30', badge: 'bg-red-500/20 text-red-300' },
    ALTO: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', badge: 'bg-amber-500/20 text-amber-300' },
    MEDIO: { bg: 'bg-slate-600/10', text: 'text-slate-300', border: 'border-slate-500/30', badge: 'bg-slate-600/20 text-slate-300' },
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
    iva_discrepancia: <AlertTriangle size={18} />,
    factura_outlier: <TrendingUp size={18} />,
    factura_clonada: <Copy size={18} />,
    descripcion_sospechosa: <FileText size={18} />,
    sobreprecio: <DollarSign size={18} />,
    monto_redondo: <Target size={18} />,
    concentracion_temporal: <CalendarClock size={18} />,
    discrepancia_pago: <CreditCard size={18} />,
};

// ─── Score Gauge ──────────────────────
const ScoreGauge = ({ score, nivel }: { score: number; nivel: string }) => {
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    const progress = (score / 100) * circumference;
    const color = score >= 60 ? '#ef4444' : score >= 30 ? '#f59e0b' : '#10b981';
    const bgRing = score >= 60 ? '#991b1b' : score >= 30 ? '#92400e' : '#064e3b';

    return (
        <div className="flex flex-col items-center">
            <svg width="140" height="140" viewBox="0 0 140 140">
                {/* Background ring */}
                <circle cx="70" cy="70" r={radius} fill="none" stroke={bgRing} strokeWidth="10" opacity="0.3" />
                {/* Progress ring */}
                <circle
                    cx="70" cy="70" r={radius} fill="none"
                    stroke={color} strokeWidth="10" strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference - progress}
                    transform="rotate(-90 70 70)"
                    style={{ transition: 'stroke-dashoffset 1s ease-in-out' }}
                />
                {/* Score text */}
                <text x="70" y="64" textAnchor="middle" fill="white" fontSize="32" fontWeight="bold">{score}</text>
                <text x="70" y="84" textAnchor="middle" fill="#94a3b8" fontSize="11" fontWeight="500">/ 100</text>
            </svg>
            <span
                className="mt-1 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
                style={{ backgroundColor: `${color}22`, color }}
            >
                Riesgo {nivel}
            </span>
        </div>
    );
};

// ─── Main Component ───────────────────
interface Props {
    filters?: any;
}

const SATRiskDashboard = ({ filters = {} }: Props) => {
    const [data, setData] = useState<RiskScanResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
    const [selectedFolio, setSelectedFolio] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const fetchScan = async () => {
        setLoading(true);
        setError(null);
        try {
            // Construir params dinámicamente según filtros
            const p: Record<string, string> = {};
            if (filters.empresa) p.empresa = filters.empresa;
            if (filters.cliente) p.cliente = filters.cliente;
            
            if (filters.years && filters.years.length > 0 && !filters.startDate) {
                p.startDate = `years:${filters.years.join(',')}`;
            } else if (filters.startDate) {
                p.startDate = filters.startDate;
            }
            if (filters.endDate) p.endDate = filters.endDate;

            const res = await api.get('/api/dashboard/risk/full-scan', { params: p });
            setData(res.data);
        } catch (err: any) {
            setError(err.response?.data?.detail || err.message || 'Error ejecutando escaneo');
        }
        setLoading(false);
    };

    useEffect(() => { fetchScan(); }, [filters]);

    const handleOpenInvoice = (folioOrUuid: string) => {
        if (!folioOrUuid) return;
        setSelectedFolio(folioOrUuid);
        setIsModalOpen(true);
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="relative">
                    <Loader2 className="animate-spin text-red-400" size={48} />
                    <Zap className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-amber-400" size={20} />
                </div>
                <div className="text-center">
                    <p className="text-white font-semibold text-lg">Escaneando riesgos fiscales...</p>
                    <p className="text-slate-500 text-sm mt-1">Ejecutando 8 motores de detección</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-6 rounded-xl flex items-center gap-3">
                <AlertOctagon size={24} />
                <div>
                    <p className="font-semibold">Error en el escaneo</p>
                    <p className="text-sm text-red-300">{error}</p>
                </div>
                <button onClick={fetchScan} className="ml-auto px-4 py-2 bg-red-500/20 rounded-lg hover:bg-red-500/30 text-sm font-medium transition-colors">
                    Reintentar
                </button>
            </div>
        );
    }

    if (!data) return null;

    const { score_global, nivel_riesgo, resumen, categorias } = data;

    return (
        <div className="space-y-6">

            {/* ─── Header: Score + KPIs ───────────────────── */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
                <div className="flex flex-col lg:flex-row items-center gap-6">

                    {/* Score Gauge */}
                    <ScoreGauge score={score_global} nivel={nivel_riesgo} />

                    {/* KPI Cards */}
                    <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-4 w-full">
                        <div className="bg-slate-900/60 rounded-lg p-4 border border-slate-700/50">
                            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Total Alertas</p>
                            <p className="text-2xl font-bold text-white mt-1">{resumen.total_alertas.toLocaleString()}</p>
                            <p className="text-xs text-slate-500 mt-1">En 8 categorías</p>
                        </div>
                        <div className="bg-slate-900/60 rounded-lg p-4 border border-slate-700/50">
                            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Monto Comprometido</p>
                            <p className="text-2xl font-bold text-amber-400 mt-1">{formatCompact(resumen.monto_comprometido)}</p>
                            <p className="text-xs text-slate-500 mt-1">Valor en riesgo</p>
                        </div>
                        <div className="bg-slate-900/60 rounded-lg p-4 border border-red-500/20">
                            <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wider">🔴 Críticas</p>
                            <p className="text-2xl font-bold text-red-400 mt-1">{resumen.por_severidad?.CRITICO || 0}</p>
                            <p className="text-xs text-slate-500 mt-1">Requieren atención inmediata</p>
                        </div>
                        <div className="bg-slate-900/60 rounded-lg p-4 border border-amber-500/20">
                            <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">🟡 Altas + 🟠 Medias</p>
                            <p className="text-2xl font-bold text-amber-400 mt-1">
                                {(resumen.por_severidad?.ALTO || 0) + (resumen.por_severidad?.MEDIO || 0)}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">Revisar en calendario</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ─── Category Panels ───────────────────────── */}
            <div className="space-y-3">
                <h3 className="text-white font-semibold flex items-center gap-2 text-lg">
                    <ShieldAlert size={20} className="text-red-400" />
                    Detalle por Categoría de Riesgo
                </h3>

                {categorias.map(cat => {
                    const sev = SEVERITY_CONFIG[cat.severidad] || SEVERITY_CONFIG.MEDIO;
                    const isExpanded = expandedCategory === cat.id;
                    const icon = CATEGORY_ICONS[cat.id] || <FileWarning size={18} />;

                    return (
                        <div key={cat.id} className={`border rounded-xl overflow-hidden transition-all ${cat.count > 0 ? sev.border : 'border-slate-700/50'}`}>
                            {/* Category Header */}
                            <div
                                className={`flex items-center gap-3 p-4 cursor-pointer select-none hover:bg-slate-700/20 transition-colors ${cat.count > 0 ? sev.bg : 'bg-slate-800/30'}`}
                                onClick={() => cat.count > 0 && setExpandedCategory(isExpanded ? null : cat.id)}
                            >
                                <div className={`p-2.5 rounded-lg ${sev.bg} ${sev.text}`}>
                                    {icon}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-semibold text-white text-sm">{cat.titulo}</h4>
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${sev.badge}`}>
                                            {cat.severidad}
                                        </span>
                                    </div>
                                </div>
                                <div className="text-right flex items-center gap-4">
                                    {cat.count > 0 ? (
                                        <>
                                            <div>
                                                <p className={`text-lg font-bold ${sev.text}`}>{cat.count}</p>
                                                <p className="text-[10px] text-slate-500">{formatCompact(cat.monto_total)}</p>
                                            </div>
                                            <button className="p-1 text-slate-400 hover:text-white">
                                                {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                            </button>
                                        </>
                                    ) : (
                                        <span className="text-emerald-400 text-sm font-medium flex items-center gap-1">✓ Limpio</span>
                                    )}
                                </div>
                            </div>

                            {/* Expanded Alert Table */}
                            {isExpanded && cat.alertas.length > 0 && (
                                <div className="border-t border-slate-700/50 bg-slate-900/50 max-h-[400px] overflow-auto">
                                    <table className="w-full text-xs">
                                        <thead className="sticky top-0 bg-slate-800 z-10">
                                            <tr className="border-b border-slate-700 text-slate-400 uppercase tracking-wider">
                                                <th className="text-left py-2.5 px-3 w-24">Folio</th>
                                                <th className="text-left py-2.5 px-3 w-20">Fecha</th>
                                                <th className="text-left py-2.5 px-3">Empresa</th>
                                                <th className="text-left py-2.5 px-3">Cliente</th>
                                                <th className="text-right py-2.5 px-3 w-28">Monto</th>
                                                <th className="text-left py-2.5 px-3">Hallazgo</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {cat.alertas.slice(0, 100).map((alert, i) => (
                                                <tr key={i} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                                                    <td className="py-2 px-3">
                                                        {alert.folio && alert.uuid ? (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleOpenInvoice(alert.uuid || alert.folio); }}
                                                                className="flex items-center gap-1 text-slate-300 font-semibold hover:text-slate-300 hover:underline transition-colors"
                                                                title="Ver detalle"
                                                            >
                                                                {alert.folio.length > 12 ? alert.folio.slice(0, 12) + '…' : alert.folio}
                                                                <ExternalLink size={10} />
                                                            </button>
                                                        ) : (
                                                            <span className="text-slate-500">{alert.folio || '-'}</span>
                                                        )}
                                                    </td>
                                                    <td className="py-2 px-3 text-slate-400">{alert.fecha?.slice(0, 10) || '-'}</td>
                                                    <td className="py-2 px-3 text-slate-300 max-w-[100px] truncate" title={alert.empresa}>{alert.empresa || '-'}</td>
                                                    <td className="py-2 px-3 text-slate-300 max-w-[120px] truncate" title={alert.cliente}>{alert.cliente || '-'}</td>
                                                    <td className={`py-2 px-3 text-right font-semibold ${sev.text}`}>
                                                        {formatCurrency(alert.monto)}
                                                    </td>
                                                    <td className="py-2 px-3 text-slate-400 max-w-[250px]">
                                                        <span className="line-clamp-2">{alert.descripcion}</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {cat.alertas.length > 100 && (
                                        <div className="px-4 py-2 text-center text-xs text-slate-500 border-t border-slate-700/50">
                                            Mostrando 100 de {cat.alertas.length} alertas
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* ─── Audit Panel (existing) ────────────────── */}
            <div>
                <h3 className="text-white font-semibold flex items-center gap-2 text-lg mb-3">
                    <AlertOctagon size={20} className="text-amber-400" />
                    Auditoría de Cumplimiento Fiscal
                </h3>
                <AuditRiskPanel />
            </div>

            {/* Invoice Modal */}
            <InvoiceDetailModal
                identifier={selectedFolio}
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
            />
        </div>
    );
};

export default SATRiskDashboard;
