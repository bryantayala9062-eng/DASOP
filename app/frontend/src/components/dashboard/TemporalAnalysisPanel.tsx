import { useState, useMemo } from 'react';
import {
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Line, Bar, Legend
} from 'recharts';
import { Calendar, ChevronDown, ChevronUp } from 'lucide-react';

interface TemporalAnalysisPanelProps {
    trendData: any[];
    onSelectTimeLabel?: (label: string) => void;
    onClearFilter?: () => void;
    selectedYears?: string[];
    onSelectYears?: (years: string[]) => void;
}

const TemporalAnalysisPanel = ({ trendData, onSelectTimeLabel, onClearFilter, selectedYears, onSelectYears }: TemporalAnalysisPanelProps) => {
    const [isExpanded, setIsExpanded] = useState(true);

    // Extract unique years from data
    const availableYears = useMemo(() => {
        if (!trendData || !Array.isArray(trendData)) return [];
        return Array.from(new Set(trendData.map(d => {
            return d.MonthYear ? d.MonthYear.split('-')[0] : '';
        }))).filter(y => y).sort();
    }, [trendData]);

    const activeYears = selectedYears && selectedYears.length > 0 ? selectedYears : availableYears;

    const toggleYear = (year: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const next = activeYears.includes(year)
            ? activeYears.filter(y => y !== year)
            : [...activeYears, year].sort();

        // If next is empty (all deselected) or all years selected, we can just clear the explicit filter
        if (next.length === 0 || next.length === availableYears.length) {
            if (onSelectYears) onSelectYears([]);
            if (onClearFilter && next.length === 0) onClearFilter();
        } else {
            if (onSelectYears) onSelectYears(next);
        }
    };

    const filteredData = useMemo(() => {
        return trendData.filter(d => {
            const year = d.MonthYear ? d.MonthYear.split('-')[0] : '';
            return activeYears.includes(year);
        });
    }, [trendData, activeYears]);

    return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
            {/* Header - Collapsible */}
            <div
                className="flex items-center gap-3 cursor-pointer select-none"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="p-2 bg-slate-600/10 rounded-lg">
                    <Calendar className="text-slate-300" size={24} />
                </div>
                <div className="flex-1 flex items-center justify-between">
                    <div>
                        <h3 className="font-bold text-lg text-white">Análisis Temporal Unificado</h3>
                        <p className="text-slate-400 text-sm">Tendencia de Facturación y Volumen</p>
                    </div>

                    {/* Year Filters */}
                    <div className="flex gap-2 mr-4">
                        {availableYears.map(year => (
                            <button
                                key={year}
                                onClick={(e) => toggleYear(year, e)}
                                className={`px-2 py-1 text-xs font-bold rounded transition-colors border ${activeYears.includes(year)
                                    ? 'bg-slate-600 text-white border-slate-500'
                                    : 'bg-transparent text-slate-400 border-slate-600 hover:border-slate-500'
                                    }`}
                            >
                                {year}
                            </button>
                        ))}
                    </div>
                    {onClearFilter && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onClearFilter(); }}
                            className="text-xs font-bold px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white transition-colors mr-4"
                        >
                            Vista Global
                        </button>
                    )}
                </div>
                <button className="text-slate-400 hover:text-white transition-colors">
                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
            </div>

            {/* Collapsible Content */}
            {isExpanded && (
                <div className="mt-6 h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart 
                            data={filteredData}
                            onClick={(state: any) => {
                                if (state && state.activeLabel && onSelectTimeLabel) {
                                    onSelectTimeLabel(state.activeLabel);
                                }
                            }}
                            style={{ cursor: onSelectTimeLabel ? "pointer" : "default", outline: 'none' }}
                        >
                            <defs>
                                <linearGradient id="billingGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                            <XAxis
                                dataKey="MonthYear"
                                tick={{ fill: '#94a3b8', fontSize: 11 }}
                                axisLine={{ stroke: '#475569' }}
                            />

                            {/* Left Axis: Amount ($) */}
                            <YAxis
                                yAxisId="left"
                                tickFormatter={(value) => `$${(value / 1000000).toFixed(0)}M`}
                                tick={{ fill: '#3b82f6', fontSize: 11 }}
                                axisLine={{ stroke: '#3b82f6' }}
                                label={{ value: 'Monto ($)', angle: -90, position: 'insideLeft', fill: '#3b82f6', fontSize: 10 }}
                            />

                            {/* Right Axis: Count (#) */}
                            <YAxis
                                yAxisId="right"
                                orientation="right"
                                tick={{ fill: '#ec4899', fontSize: 11 }}
                                axisLine={{ stroke: '#ec4899' }}
                                label={{ value: 'Cantidad (#)', angle: 90, position: 'insideRight', fill: '#ec4899', fontSize: 10 }}
                                domain={['auto', 'auto']}
                            />

                            <Tooltip
                                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px' }}
                                labelStyle={{ color: '#e2e8f0', fontWeight: 'bold' }}
                                formatter={(value: any, name: any) => {
                                    if (name === 'Monto Facturado') return [`$${Number(value).toLocaleString()}`, name];
                                    if (name === 'Cantidad de Facturas') return [value, name];
                                    return [value, name];
                                }}
                            />
                            <Legend wrapperStyle={{ paddingTop: '10px' }} />

                            <Bar
                                yAxisId="left"
                                dataKey="TOTAL NETO"
                                name="Monto Facturado"
                                fill="url(#billingGradient)"
                                stroke="#3b82f6"
                                radius={[4, 4, 0, 0]}
                                barSize={40}
                                cursor={onSelectTimeLabel ? "pointer" : "default"}
                                onClick={(data: any) => {
                                    const label = data?.payload?.MonthYear || data?.MonthYear;
                                    if (onSelectTimeLabel && label) onSelectTimeLabel(label);
                                }}
                            />
                            <Line
                                yAxisId="right"
                                type="monotone"
                                dataKey="INVOICE_COUNT"
                                name="Cantidad de Facturas"
                                stroke="#ec4899"
                                strokeWidth={4}
                                dot={{ fill: '#ec4899', r: 5 }}
                                activeDot={{ r: 7 }}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                    <p className="text-xs text-slate-500 mt-4 text-center">
                        Correlación entre el dinero ingresado (barras azules) y el volumen de documentos emitidos (línea rosa).
                    </p>
                </div>
            )}
        </div>
    );
};

export default TemporalAnalysisPanel;
