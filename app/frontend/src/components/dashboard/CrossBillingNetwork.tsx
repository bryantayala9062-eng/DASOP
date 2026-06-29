import { useEffect, useState, useRef, useCallback, useMemo, Fragment } from 'react';
import ReactECharts from 'echarts-for-react';
import { api } from '../../api/axios';
import { Activity, Shield, AlertTriangle, ArrowRight, ShieldAlert, AlertOctagon, Download, Search, X } from 'lucide-react';
import type { DashboardFilters } from '../../types/filters';
import { OPStatusBadge } from './OPStatusBadge';

interface CrossBillingNetworkProps {
    filters?: DashboardFilters;
    onNodeClick?: (companyName: string, category: 'emisor' | 'receptor', activeLens: string) => void;
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n ?? 0);

export const CrossBillingNetwork = ({ filters, onNodeClick }: CrossBillingNetworkProps) => {
    const [echartsNodes, setEchartsNodes] = useState<any[]>([]);
    const [echartsLinks, setEchartsLinks] = useState<any[]>([]);
    const [topLinks, setTopLinks] = useState<any[]>([]);
    const [carruselRisk, setCarruselRisk] = useState<any[]>([]);
    const [efosRisk, setEfosRisk] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [topN, setTopN] = useState(100);
    const [lens, setLens] = useState<'total' | 'debt' | 'intangibles'>('total');
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedEfos, setExpandedEfos] = useState<number | null>(null);
    const [expandedCarrusel, setExpandedCarrusel] = useState<number | null>(null);
    const chartRef = useRef<any>(null);
    const debounceRef = useRef<any>(null);
    const nodeContractLookupRef = useRef<Record<string, { pending: number; total: number }>>({});
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchNetwork(topN, lens);
    }, [filters]);

    // Prevent browser zoom when interacting with the chart
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (e: WheelEvent) => {
            // e.ctrlKey is true when pinching on a trackpad or using Ctrl+Wheel
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
            }
        };

        container.addEventListener('wheel', handleWheel, { passive: false });

        return () => {
            container.removeEventListener('wheel', handleWheel);
        };
    }, []);

    const buildParams = (limit: number, currentLens: string = lens) => {
        const p: Record<string, string> = {};
        if (filters?.empresa) p.empresa = filters.empresa;
        if (filters?.years && filters.years.length > 0 && !filters?.startDate) {
            p.startDate = `years:${filters.years.join(',')}`;
        } else if (filters?.startDate) {
            p.startDate = filters.startDate;
        }
        if (filters?.endDate) p.endDate = filters.endDate;
        p.min_weight = '10000'; // Show links above 10k
        p.limit = String(limit);
        p.lens = currentLens;
        return { params: p };
    };

    const fetchNetwork = useCallback(async (limit: number, currentLens: string = lens) => {
        setLoading(true);
        try {
            const [networkRes, carruselRes, efosRes] = await Promise.all([
                api.get('/api/dashboard/analytics/network', buildParams(limit, currentLens)),
                api.get('/api/dashboard/analytics/risk-carrusel', buildParams(limit, 'total')),
                api.get('/api/dashboard/analytics/risk-efos', buildParams(limit, 'total'))
            ]);

            const rawNodes = networkRes.data.nodes;
            const rawLinks = networkRes.data.links;

            // Compute min/max monto for scaling
            const montoValues = rawNodes.map((n: any) => n.total_monto || 0);
            const maxMonto = Math.max(...montoValues, 1);
            const minMonto = Math.min(...montoValues, 0);

            const nodes = rawNodes.map((n: any) => {
                const val = n.total_monto || 0;
                const size = 15 + 40 * ((val - minMonto) / (maxMonto - minMonto || 1));
                return {
                    id: n.id,
                    name: n.label,
                    symbolSize: Math.max(15, Math.min(55, size)),
                    category: n.type === 'Emisor' ? 0 : 1,
                    value: val,
                    // Propagate contract fields provided by the backend (safe defaults)
                    contracts_count: n.contracts_count ?? 0,
                    pending_contracts: n.pending_contracts ?? 0,
                    has_pending_contracts: !!n.has_pending_contracts,
                    draggable: true,
                    label: { show: true, position: 'right', color: '#ffffff', textBorderColor: '#0d1117', textBorderWidth: 2, fontSize: 11 },
                };
            });

            const maxLinkVal = Math.max(...rawLinks.map((l: any) => l.value), 1);
            const links = rawLinks.map((l: any) => ({
                source: l.source,
                target: l.target,
                value: l.value,
                lineStyle: { width: 1 + 5 * (l.value / maxLinkVal) },
            }));

            setEchartsNodes(nodes);
            setEchartsLinks(links);
            setTopLinks([...rawLinks].sort((a: any, b: any) => b.value - a.value).slice(0, 10));
            setCarruselRisk(Array.isArray(carruselRes.data) ? carruselRes.data : []);
            setEfosRisk(Array.isArray(efosRes.data) ? efosRes.data : []);

            // Build a quick lookup to access node contract info when rendering the Top 10 table
            const nodeContractLookup: Record<string, { pending: number; total: number }> = {};
            nodes.forEach((nd: any) => {
                nodeContractLookup[nd.id] = { pending: nd.pending_contracts ?? 0, total: nd.contracts_count ?? 0 };
            });
            nodeContractLookupRef.current = nodeContractLookup;
        } catch (err) {
            setError('No se pudo cargar la topología de la red.');
        }
        setLoading(false);
    }, [filters]);

    const filteredNodes = useMemo(() => {
        if (!searchTerm) return echartsNodes;
        const lowerTerm = searchTerm.toLowerCase();
        
        const matchedNodeIds = new Set(
            echartsNodes.filter(n => n.name.toLowerCase().includes(lowerTerm)).map(n => n.id)
        );
        
        const connectedNodeIds = new Set(matchedNodeIds);
        echartsLinks.forEach(l => {
            const src = typeof l.source === 'object' ? l.source.id : l.source;
            const tgt = typeof l.target === 'object' ? l.target.id : l.target;
            if (matchedNodeIds.has(src)) connectedNodeIds.add(tgt);
            if (matchedNodeIds.has(tgt)) connectedNodeIds.add(src);
        });

        return echartsNodes.filter(n => connectedNodeIds.has(n.id));
    }, [echartsNodes, echartsLinks, searchTerm]);

    const filteredLinks = useMemo(() => {
        if (!searchTerm) return echartsLinks;
        const nodeIds = new Set(filteredNodes.map(n => n.id));
        return echartsLinks.filter(l => {
            const src = typeof l.source === 'object' ? l.source.id : l.source;
            const tgt = typeof l.target === 'object' ? l.target.id : l.target;
            return nodeIds.has(src) && nodeIds.has(tgt);
        });
    }, [echartsLinks, filteredNodes, searchTerm]);

    const filteredTopLinks = useMemo(() => {
        if (!searchTerm) return topLinks;
        return [...filteredLinks].sort((a: any, b: any) => (b.value || 0) - (a.value || 0)).slice(0, 10);
    }, [topLinks, filteredLinks, searchTerm]);

    const handleTopNChange = (val: number) => {
        setTopN(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => { fetchNetwork(val, lens); }, 400);
    };

    const handleLensChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value as 'total' | 'debt' | 'intangibles';
        setLens(val);
        fetchNetwork(topN, val);
    };

    const handleDownloadPng = () => {
        if (!chartRef.current) return;
        const echartsInstance = chartRef.current.getEchartsInstance();
        const url = echartsInstance.getDataURL({ type: 'png', pixelRatio: 4, backgroundColor: '#0d1117' });
        const link = document.createElement('a');
        link.download = `Mapa_Interempresarial_Top_${topN}.png`;
        link.href = url;
        link.click();
    };

            const getChartOption = () => ({
                backgroundColor: 'transparent',
                tooltip: {
                    show: typeof window !== 'undefined' ? window.innerWidth > 768 : true,
                    trigger: 'item',
                    formatter: (params: any) => {
                        if (params.dataType === 'node') {
                            // Use propagated contract info if available
                            const contracts = params.data.contracts_count ?? 0;
                            const pending = params.data.pending_contracts ?? 0;
                            const pendingLabel = pending > 0 ? ` <span style="color:#ffb86b">(Pendientes: ${pending})</span>` : '';
                            return `<b>${params.data.name}</b><br/>Tipo: ${params.data.category === 0 ? 'Emisor' : 'Receptor'}<br/>Volumen: $${(params.data.value || 0).toLocaleString('es-MX', { minimumFractionDigits: 0 })}<br/>Contratos asociados: ${contracts}${pendingLabel}`;
                        } else if (params.dataType === 'edge') {
                            return `Flujo: <b>${params.data.source}</b> &#8594; <b>${params.data.target}</b><br/>Monto: $${(params.data.value || 0).toLocaleString('es-MX', { minimumFractionDigits: 0 })}`;
                        }
                        return '';
                    },
                    backgroundColor: 'rgba(22,27,34,0.95)',
                    borderColor: '#30363d',
                    textStyle: { color: '#c9d1d9', fontSize: 12 },
                    enterable: false,
                    transitionDuration: 0,
                    extraCssText: 'pointer-events: none; z-index: 50;',
                },
        legend: [
            { data: ['Emisor', 'Receptor / Tercero'], bottom: 10, textStyle: { color: '#c9d1d9', fontSize: 12 }, itemGap: 24 }
        ],
        series: [{
            name: 'Flujo',
            type: 'graph',
            layout: 'force',
            data: filteredNodes,
            links: filteredLinks,
            categories: [
                { name: 'Emisor', itemStyle: { color: '#4A90E2' } },
                { name: 'Receptor / Tercero', itemStyle: { color: '#F5A623' } },
            ],
            roam: true,
            zoom: 0.75,
            draggable: true,
            labelLayout: {
                hideOverlap: true
            },
            label: { 
                show: true, 
                position: 'right', 
                formatter: (params: any) => {
                    const text = params.name || '';
                    // Divide el texto largo o trúncalo
                    if (text.length > 25) {
                        return text.substring(0, 25) + '...';
                    }
                    return text;
                }
            },
            force: { repulsion: 1500, edgeLength: [80, 250], gravity: 0.1, friction: 0.6 },
            edgeSymbol: ['none', 'arrow'],
            edgeSymbolSize: [5, 10],
            lineStyle: { 
                color: lens === 'debt' ? '#ef4444' : lens === 'intangibles' ? '#a855f7' : 'source', 
                curveness: 0.1, 
                opacity: 0.4 
            },
            emphasis: {
                focus: typeof window !== 'undefined' && window.innerWidth <= 768 ? 'none' : 'adjacency',
                lineStyle: { width: 8, opacity: 1 },
            },
        }],
    });

    return (
        <div className="space-y-6 w-full">
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden flex flex-col w-full">
                <div className="px-5 py-4 border-b border-slate-700 bg-slate-800 flex justify-between items-center z-10 w-full flex-wrap gap-3">
                <div className="flex flex-col">
                    <h3 className="text-white font-bold flex items-center gap-2 text-lg">
                        <Activity className="text-emerald-400" size={20} /> Mapa de Flujo Interempresarial
                    </h3>
                    <p className="text-slate-400 text-xs">Detección de Fracturación Cruzada y Ecosistema de Facturas</p>
                </div>
                {/* Lenses control */}
                <div className="flex items-center gap-2">
                    <select
                        value={lens}
                        onChange={handleLensChange}
                        className="bg-slate-900/50 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 outline-none focus:border-slate-500 transition-colors"
                    >
                        <option value="total">🔍 Flujo Total</option>
                        <option value="debt">🔴 Deuda (PPD sin REP)</option>
                        <option value="intangibles">🟣 Servicios Intangibles</option>
                    </select>
                </div>

                {/* Slider control */}
                <div className="flex items-center gap-3 bg-slate-900/50 px-4 py-2 rounded-lg border border-slate-700 h-[34px]">
                    <span className="text-slate-400 text-xs whitespace-nowrap">Nodos:</span>
                    <input
                        type="range"
                        min={10}
                        max={1000}
                        step={10}
                        value={topN}
                        onChange={e => handleTopNChange(Number(e.target.value))}
                        className="w-24 accent-slate-400 cursor-pointer"
                    />
                    <span className="text-slate-300 font-bold text-sm w-8 text-right">{topN}</span>
                </div>
                {/* Search control */}
                <div className="flex items-center gap-2 bg-slate-900/50 px-3 py-1.5 rounded-lg border border-slate-700 h-[34px]">
                    <Search size={14} className="text-slate-500 shrink-0" />
                    <input
                        type="text"
                        placeholder="Buscar empresa..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="bg-transparent border-none text-xs text-white focus:outline-none w-28 md:w-40 placeholder:text-slate-500"
                    />
                    {searchTerm && (
                        <button onClick={() => setSearchTerm('')} className="text-slate-500 hover:text-white shrink-0"><X size={14} /></button>
                    )}
                </div>
                <div className="flex gap-2 items-center">
                    <span className="text-xs bg-slate-600/20 text-slate-300 px-3 py-1 rounded-full border border-slate-500/30 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-600"></span> Emisores</span>
                    <span className="text-xs bg-amber-500/20 text-amber-500 px-3 py-1 rounded-full border border-amber-500/30 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span> Receptores</span>
                    <button onClick={handleDownloadPng} className="ml-2 hover:bg-slate-700 p-1.5 rounded-lg text-slate-400 transition-colors" title="Descargar PNG">
                        <Download size={16} />
                    </button>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row w-full h-[600px] lg:h-[700px]">
                {/* ECharts Graph View */}
                <div 
                    ref={containerRef}
                    className="echarts-grab-wrapper w-full lg:w-2/3 h-full relative bg-slate-900 border-r border-slate-700 touch-none"
                    style={{ overscrollBehavior: 'none' }}
                >
                    <style>{`
                        .echarts-grab-wrapper div[style*="cursor: default"] {
                            cursor: grab !important;
                        }
                        .echarts-grab-wrapper div[style*="cursor: default"]:active {
                            cursor: grabbing !important;
                        }
                        .echarts-grab-wrapper canvas[style*="cursor: default"] {
                            cursor: grab !important;
                        }
                        .echarts-grab-wrapper canvas[style*="cursor: default"]:active {
                            cursor: grabbing !important;
                        }
                    `}</style>
                    {loading ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/50 z-20 backdrop-blur-sm">
                            <div className="animate-spin h-8 w-8 border-4 border-slate-500 border-t-transparent rounded-full mb-4"></div>
                        </div>
                    ) : error ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10">
                            <AlertTriangle className="text-red-500 mb-2" size={32} />
                            <p className="text-slate-400">{error}</p>
                        </div>
                    ) : echartsNodes.length === 0 ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10">
                            <Shield className="text-slate-600 mb-2 opacity-50" size={48} />
                            <p className="text-slate-500 text-sm">No se encontraron flujos cruzados.</p>
                        </div>
                    ) : (
                        <ReactECharts
                            ref={chartRef}
                            option={getChartOption()}
                            style={{ width: '100%', height: '100%' }}
                            theme="dark"
                            notMerge={true}
                            lazyUpdate={false}
                            onEvents={{
                                'click': (params: any) => {
                                    if (params.dataType === 'node' && onNodeClick) {
                                        // Prefer opening contracts tab when node contains pending contracts
                                        const hasPending = (params.data?.has_pending_contracts) || ((params.data?.pending_contracts ?? 0) > 0);
                                        const initialTab = hasPending ? 'contracts' : 'invoices';
                                        onNodeClick(params.data.name, params.data.category === 0 ? 'emisor' : 'receptor', lens, initialTab);
                                    }
                                }
                            }}
                        />
                    )}
                </div>

                {/* Table View */}
                <div className="w-full lg:w-1/3 h-full bg-slate-800 flex flex-col overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-700 bg-slate-800/80">
                        <h4 className="text-slate-200 font-semibold text-sm">Top 10 Conexiones</h4>
                        <p className="text-slate-400 text-xs">Mayores flujos de facturación detectados</p>
                    </div>
                    <div className="flex-1 overflow-y-auto px-4 py-2">
                        {filteredTopLinks.length === 0 && !loading && (
                            <div className="text-slate-500 text-sm text-center py-4">Sin datos</div>
                        )}
                        <table className="w-full text-xs box-border">
                            <tbody>
                                {filteredTopLinks.map((link, idx) => {
                                    const sourceName = typeof link.source === 'object' ? link.source.name : link.source;
                                    const targetName = typeof link.target === 'object' ? link.target.name : link.target;
                                    // Try to get pending info from the lookup built after fetching
                                    const lookup = nodeContractLookupRef.current || {};
                                    const srcPending = lookup[link.source]?.pending || 0;
                                    const tgtPending = lookup[link.target]?.pending || 0;
                                    return (
                                        <tr key={idx} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                                            <td className="py-2.5 max-w-[150px]">
                                                <div className="flex flex-col gap-1 w-full">
                                                    <div 
                                                        className="text-slate-300 truncate font-medium cursor-pointer hover:underline hover:text-slate-300 transition-colors" 
                                                        title={sourceName}
                                                        onClick={() => onNodeClick?.(sourceName, 'emisor', lens, (lookup[link.source]?.pending || 0) > 0 ? 'contracts' : 'invoices')}
                                                    >
                                                        {sourceName}{srcPending > 0 && (<span className="ml-2 text-[11px] bg-yellow-500/10 text-yellow-300 px-2 py-0.5 rounded">Pend: {srcPending}</span>)}
                                                    </div>
                                                    <OPStatusBadge companyName={sourceName} size="sm" className="self-start" />
                                                    <div className="flex items-center text-slate-500 justify-start">
                                                        <ArrowRight size={12} className="text-slate-600" />
                                                    </div>
                                                    <div 
                                                        className="text-amber-400 truncate block cursor-pointer hover:underline hover:text-amber-300 transition-colors" 
                                                        title={targetName}
                                                        onClick={() => onNodeClick?.(targetName, 'receptor', lens, (lookup[link.target]?.pending || 0) > 0 ? 'contracts' : 'invoices')}
                                                    >
                                                        {targetName}{tgtPending > 0 && (<span className="ml-2 text-[11px] bg-yellow-500/10 text-yellow-300 px-2 py-0.5 rounded">Pend: {tgtPending}</span>)}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className={`py-2.5 text-right align-top font-bold whitespace-nowrap pl-2 ${lens === 'debt' ? 'text-red-400' : lens === 'intangibles' ? 'text-purple-400' : 'text-emerald-400'}`}>
                                                {formatCurrency(link.value)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            </div>

            {/* Risk Panels */}
            {(!loading && (carruselRisk.length > 0 || efosRisk.length > 0)) && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 w-full">
                    
                    {/* Panel EFOS */}
                    {efosRisk.length > 0 && (
                        <div className="bg-slate-800 border border-rose-900/50 rounded-xl overflow-hidden shadow-lg shadow-rose-900/20">
                            <div className="px-5 py-4 bg-rose-500/10 border-b border-rose-500/20 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <AlertOctagon className="text-rose-500" size={20} />
                                    <div>
                                        <h3 className="text-rose-400 font-bold text-sm">Alerta de Pulverización (Riesgo EFOS)</h3>
                                        <p className="text-rose-300/70 text-xs">Clientes que reciben facturas de {'>='}3 empresas de la firma</p>
                                    </div>
                                </div>
                                <span className="bg-rose-500/20 text-rose-400 font-bold px-2.5 py-1 rounded-lg text-xs border border-rose-500/30">
                                    {efosRisk.length} casos detectados
                                </span>
                            </div>
                            <div className="p-0 overflow-x-auto">
                                <table className="w-full text-sm text-left whitespace-nowrap">
                                    <thead className="text-xs text-slate-400 bg-slate-800/50 border-b border-slate-700">
                                        <tr>
                                            <th className="px-4 py-3 font-medium">CLIENTE FINAL</th>
                                            <th className="px-4 py-3 font-medium text-center">EMPRESAS INVOLUCRADAS</th>
                                            <th className="px-4 py-3 font-medium text-right">MONTO TOTAL RECIBIDO</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-700/50">
                                        {efosRisk.slice(0, 10).map((risk, i) => (
                                            <Fragment key={i}>
                                            <tr className="hover:bg-slate-700/30 transition-colors cursor-pointer" onClick={() => setExpandedEfos(expandedEfos === i ? null : i)}>
                                                <td className="px-4 py-3">
                                                    <div className="font-semibold text-slate-200 max-w-[200px] truncate" title={risk.cliente}>{risk.cliente}</div>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="inline-flex items-center justify-center px-2 py-1 rounded-md bg-amber-500/10 text-amber-400 font-bold border border-amber-500/20 text-xs hover:bg-amber-500/20 transition-colors">
                                                        {risk.num_empresas} empresas <span className="inline-block ml-1">{expandedEfos === i ? '▲' : '▼'}</span>
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right font-bold text-rose-400">
                                                    {formatCurrency(risk.total_recibido)}
                                                </td>
                                            </tr>
                                            {expandedEfos === i && risk.empresas_emisoras && (
                                                <tr className="bg-slate-800/80">
                                                    <td colSpan={3} className="px-4 py-3 border-l-2 border-rose-500 text-left">
                                                        <div className="text-xs text-slate-300">
                                                            <div className="font-semibold text-rose-400 mb-2">Desglose de Facturación por Empresa Emisora:</div>
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                                {risk.empresas_emisoras.map((emp: any, j: number) => (
                                                                    <div key={j} className="flex justify-between items-center bg-slate-700/30 px-3 py-2 rounded border border-slate-700/50">
                                                                        <span className="truncate mr-4 text-slate-300" title={emp.empresa}>{emp.empresa}</span>
                                                                        <span className="font-mono text-emerald-400 font-medium shrink-0">{formatCurrency(emp.monto)}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                            </Fragment>
                                        ))}
                                    </tbody>
                                </table>
                                {efosRisk.length > 10 && (
                                    <div className="px-4 py-3 text-center border-t border-slate-700/50">
                                        <span className="text-xs text-slate-400 italic">Mostrando los 10 casos principales de {efosRisk.length} totales.</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Panel Carrusel */}
                    {carruselRisk.length > 0 && (
                        <div className="bg-slate-800 border border-orange-900/50 rounded-xl overflow-hidden shadow-lg shadow-orange-900/20">
                            <div className="px-5 py-4 bg-orange-500/10 border-b border-orange-500/20 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <ShieldAlert className="text-orange-500" size={20} />
                                    <div>
                                        <h3 className="text-orange-400 font-bold text-sm">Alerta de Facturación Cruzada (Carrusel)</h3>
                                        <p className="text-orange-300/70 text-xs">Empresas emisoras que también operan como clientes intrafirma</p>
                                    </div>
                                </div>
                                <span className="bg-orange-500/20 text-orange-400 font-bold px-2.5 py-1 rounded-lg text-xs border border-orange-500/30">
                                    {carruselRisk.length} alertas
                                </span>
                            </div>
                            <div className="p-0 overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-slate-400 bg-slate-800/50 border-b border-slate-700">
                                        <tr>
                                            <th className="px-4 py-3 font-medium">EMPRESA DEL DESPACHO</th>
                                            <th className="px-4 py-3 font-medium text-right">MONTO FACTURADO (EMITE)</th>
                                            <th className="px-4 py-3 font-medium text-right bg-orange-500/5">MONTO CANALIZADO (RECIBE)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-700/50">
                                        {carruselRisk.slice(0, 10).map((risk, i) => (
                                            <Fragment key={i}>
                                            <tr className="hover:bg-slate-700/30 transition-colors cursor-pointer" onClick={() => setExpandedCarrusel(expandedCarrusel === i ? null : i)}>
                                                <td className="px-4 py-3">
                                                    <div className="font-semibold text-slate-200 max-w-[200px] truncate" title={risk.empresa}>{risk.empresa}</div>
                                                    <div className="text-[10px] text-slate-500 mt-0.5">Ratio Emitido/Recibido: {risk.ratio === Infinity ? 'N/A' : `${risk.ratio.toFixed(1)}x`}</div>
                                                </td>
                                                <td className="px-4 py-3 text-right font-medium text-slate-300">
                                                    {formatCurrency(risk.emite)}
                                                </td>
                                                <td className="px-4 py-3 text-right bg-orange-500/5 cursor-pointer">
                                                    <span className="font-bold text-orange-400 block">{formatCurrency(risk.recibe)}</span>
                                                    <span className="text-[10px] text-slate-400 block hover:text-orange-300 transition-colors font-medium">
                                                        de {risk.proveedores?.length || 0} intrafirmas <span className="inline-block ml-1">{expandedCarrusel === i ? '▲' : '▼'}</span>
                                                    </span>
                                                </td>
                                            </tr>
                                            {expandedCarrusel === i && risk.proveedores && (
                                                <tr className="bg-slate-800/80">
                                                    <td colSpan={3} className="px-4 py-3 border-l-2 border-orange-500 text-left">
                                                        <div className="text-xs text-slate-300">
                                                            <div className="font-semibold text-orange-400 mb-2">Empresas Intrafirma de las que Recibe (Proveedores):</div>
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                                {risk.proveedores.map((prov: any, j: number) => (
                                                                    <div key={j} className="flex justify-between items-center bg-slate-700/30 px-3 py-2 rounded border border-slate-700/50">
                                                                        <span className="truncate mr-4 text-slate-300" title={prov.empresa}>{prov.empresa}</span>
                                                                        <span className="font-mono text-emerald-400 font-medium shrink-0">{formatCurrency(prov.monto)}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                            </Fragment>
                                        ))}
                                    </tbody>
                                </table>
                                {carruselRisk.length > 10 && (
                                    <div className="px-4 py-3 text-center border-t border-slate-700/50">
                                        <span className="text-xs text-slate-400 italic">Mostrando las 10 mayores alertas de {carruselRisk.length} totales.</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
