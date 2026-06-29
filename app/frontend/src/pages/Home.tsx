import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import {
    Scale, FileText, PieChart,
    ArrowRight, AlertCircle, Activity, Clock
} from 'lucide-react';
function getGreeting(nombre: string) {
    const h = new Date().getHours();
    const name = nombre?.split(' ')[0] || '';
    if (h < 12) return `Buenos días, ${name}`;
    if (h < 19) return `Buenas tardes, ${name}`;
    return `Buenas noches, ${name}`;
}

// ── Module Card ────────────────────────────────────────────────
interface ModuleCardProps {
    title: string;
    desc: string;
    icon: React.ReactNode;
    accent: string;
    border: string;
    bg: string;
    badge?: string;
    path: string;
    allowed: boolean;
    navigate: (p: string) => void;
}
const ModuleCard: React.FC<ModuleCardProps> = ({
    title, desc, icon, accent, border, bg, badge, path, allowed, navigate
}) => (
    <div
        onClick={() => allowed && navigate(path)}
        className={`group relative flex flex-col gap-3 rounded-xl border ${border} ${bg} p-6
            transition-all duration-200
            ${allowed ? 'cursor-pointer hover:scale-[1.02] hover:shadow-xl hover:shadow-black/30' : 'opacity-40 cursor-not-allowed'}`}
    >
        <div className="flex items-start justify-between">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center bg-slate-900/60 ${accent}`}>
                {icon}
            </div>
            {badge && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-300 border border-slate-500/30">
                    {badge}
                </span>
            )}
        </div>
        <div>
            <h3 className={`text-base font-semibold ${accent} mb-1`}>{title}</h3>
            <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
        </div>
        {allowed && (
            <div className={`flex items-center gap-1 text-xs font-medium ${accent} mt-1
                opacity-0 group-hover:opacity-100 transition-opacity duration-150`}>
                Ir al módulo <ArrowRight size={13} />
            </div>
        )}
    </div>
);

// ── Main Page ──────────────────────────────────────────────────
const Home: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();

    const [now, setNow] = useState(new Date());

    // Live clock
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(t);
    }, []);

    const modules = [
        {
            key: 'dashboard',
            title: 'Análisis XML',
            desc: 'Dashboard financiero con KPIs de facturación, análisis de cobranza, riesgo SAT y red de facturación.',
            icon: <PieChart size={22} />,
            accent: 'text-purple-400',
            border: 'border-purple-500/25 hover:border-purple-400/60',
            bg: 'bg-purple-500/5 hover:bg-purple-500/10',
            badge: 'CORE',
            path: '/dashboard',
            allowed: !!user?.mod_dashboard,
        },
        {
            key: 'legal',
            title: 'Seguimiento Legal',
            desc: 'Gestión completa de contratos: redacción, firma, vencimientos y alertas automáticas por correo.',
            icon: <Scale size={22} />,
            accent: 'text-slate-300',
            border: 'border-slate-500/25 hover:border-slate-400/60',
            bg: 'bg-slate-500/5 hover:bg-slate-500/10',
            path: '/legal',
            allowed: !!user?.mod_legal,
        },
        {
            key: 'materialidad',
            title: 'Materialidad',
            desc: 'Control de documentos corporativos por empresa: actas constitutivas, opiniones de cumplimiento y expedientes.',
            icon: <FileText size={22} />,
            accent: 'text-emerald-400',
            border: 'border-emerald-500/25 hover:border-emerald-400/60',
            bg: 'bg-emerald-500/5 hover:bg-emerald-500/10',
            path: '/materialidad',
            allowed: !!user?.mod_materialidad,
        },
    ];

    const timeStr = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

    return (
        <Layout>
            <div className="space-y-8 max-w-6xl mx-auto">

                {/* ── Header ── */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-white">
                            {user ? getGreeting(user.nombre) : 'Portal Optimal'}
                        </h1>
                        <p className="text-slate-400 text-sm mt-1 capitalize">{dateStr}</p>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400 text-sm bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-2 w-fit">
                        <Clock size={14} className="text-slate-500" />
                        <span>{timeStr}</span>
                        <span className="text-slate-600">·</span>
                        <Activity size={14} className="text-emerald-400" />
                        <span className="text-emerald-400 text-xs font-medium">Sistema activo</span>
                    </div>
                </div>

                {/* ── Modules ── */}
                <div>
                    <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">
                        Módulos del sistema
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {modules.map(m => (
                            <ModuleCard key={m.key} {...m} navigate={navigate} />
                        ))}
                    </div>
                </div>

                {/* ── Footer note ── */}
                <div className="flex items-center gap-2 text-xs text-slate-600 pt-2 border-t border-slate-800">
                    <AlertCircle size={12} />
                    <span>Los datos financieros se actualizan automáticamente al recargar el archivo Excel fuente.</span>
                </div>

            </div>
        </Layout>
    );
};

export default Home;
