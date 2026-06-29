import { useState } from 'react';
import { AlertTriangle, ClipboardList, Users } from 'lucide-react';
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

interface Props {
    slowPayers: SlowPayer[];
    aging: AgingBucket[];
    pareto: ParetoItem[];
}

const tabs = [
    { id: 'morosos', label: 'Top Morosos', icon: Users },
    { id: 'aging', label: 'Aging Report', icon: ClipboardList },
    { id: 'pareto', label: 'Pareto 80/20', icon: AlertTriangle },
];

const SlowPayersTabs = ({ slowPayers, aging, pareto }: Props) => {
    const [activeTab, setActiveTab] = useState('morosos');

    const renderMorosos = () => (
        <div className="space-y-2">
            {slowPayers.map((row, idx) => (
                <div key={(row.cliente || '') + idx} className="grid grid-cols-12 gap-4 py-2 px-3 rounded bg-slate-900/40 border border-slate-700">
                    <div className="col-span-4">
                        <p className="text-white text-sm font-semibold truncate">{row.cliente}</p>
                        <p className="text-xs text-slate-500">{row.facturas_pendientes} facturas</p>
                    </div>
                    <div className="col-span-4">
                        <p className="text-xs text-slate-500">Días promedio</p>
                        <p className="text-lg font-bold text-amber-400">{Math.round(row.dias_promedio || 0)}</p>
                    </div>
                    <div className="col-span-4">
                        <p className="text-xs text-slate-500">Saldo pendiente</p>
                        <p className="text-lg font-bold text-amber-400">{formatCurrency(row.saldo_pendiente || 0)}</p>
                    </div>
                </div>
            ))}
        </div>
    );

    const renderAging = () => (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {aging.map(bucket => (
                <div key={bucket.bucket} className="p-3 border border-slate-700 rounded bg-slate-900/60">
                    <p className="text-xs text-slate-500 uppercase">{bucket.bucket}</p>
                    <p className="text-xl font-bold text-white">{formatCurrency(bucket.saldo)}</p>
                    <p className="text-xs text-slate-500">{bucket.facturas} facturas · {bucket.clientes} clientes</p>
                </div>
            ))}
        </div>
    );

    const renderPareto = () => (
        <div className="space-y-2 max-h-[260px] overflow-y-auto pr-2">
            {pareto.map((item, idx) => (
                <div key={(item.cliente || '') + idx} className="flex items-center gap-3 border border-slate-700 rounded px-3 py-2 bg-slate-900/40">
                    <div className="w-10 text-center">
                        <p className="text-lg font-bold text-slate-300">{idx + 1}</p>
                    </div>
                    <div className="flex-1">
                        <p className="text-sm text-white font-semibold truncate">{item.cliente}</p>
                        <p className="text-xs text-slate-500">{item.facturas} facturas</p>
                    </div>
                    <div className="text-right">
                        <p className="text-sm text-white font-semibold">{formatCurrency(item.total)}</p>
                        <p className="text-xs text-slate-500">{item.porcentaje_acumulado.toFixed(1)}% acumulado</p>
                    </div>
                </div>
            ))}
        </div>
    );

    return (
        <div>
            <div className="flex flex-wrap gap-2 mb-4">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${activeTab === tab.id ? 'bg-slate-600 text-white border-slate-500' : 'text-slate-400 border-slate-700 hover:border-slate-500/40'}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        <tab.icon size={14} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'morosos' && renderMorosos()}
            {activeTab === 'aging' && renderAging()}
            {activeTab === 'pareto' && renderPareto()}
        </div>
    );
};

export default SlowPayersTabs;
