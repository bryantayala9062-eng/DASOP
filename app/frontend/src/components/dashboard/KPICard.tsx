import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

interface KPICardProps {
    title: string;
    value: string;
    subtext?: string;
    icon: LucideIcon;
    trend?: 'up' | 'down' | 'neutral';
    color?: 'brand' | 'success' | 'warning' | 'danger';
    privacyMode?: boolean;
}

const KPICard: React.FC<KPICardProps> = ({ title, value, subtext, icon: Icon, trend, color = 'brand', privacyMode = false }) => {
    const colorMap = {
        brand: 'text-slate-300 bg-slate-400/10 border-slate-400/20',
        success: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
        warning: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
        danger: 'text-red-400 bg-red-400/10 border-red-400/20',
    };

    return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 relative overflow-hidden group hover:border-slate-600 transition-all duration-300">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">{title}</h3>
                    <h2 className={`text-2xl font-bold text-white mt-1 transition-all duration-300 ${privacyMode ? 'blur-md select-none' : ''}`}>
                        {value}
                    </h2>
                </div>
                <div className={`p-3 rounded-xl border ${colorMap[color]} transition-transform group-hover:scale-110`}>
                    <Icon size={24} />
                </div>
            </div>

            {subtext && (
                <div className="flex items-center gap-2 mt-2">
                    {trend === 'up' && <ArrowUpRight size={16} className="text-emerald-400" />}
                    {trend === 'down' && <ArrowDownRight size={16} className="text-red-400" />}
                    {trend === 'neutral' && <Minus size={16} className="text-slate-500" />}
                    <span className="text-xs text-slate-500 font-medium">{subtext}</span>
                </div>
            )}
        </div>
    );
};

export default KPICard;
