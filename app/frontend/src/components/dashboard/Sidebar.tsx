import { api } from "../../api/axios";

import React, { useState, useEffect } from 'react';
import { Search, Calendar, Filter, Building2, User, Box, CreditCard } from 'lucide-react';
import type { DashboardFilters } from '../../types/filters';

interface SidebarProps {
    onFilterChange: (filters: DashboardFilters) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onFilterChange }) => {
    const [filters, setFilters] = useState<DashboardFilters>({
        startDate: '',
        endDate: '',
        folio: '',
        cliente: '',
        empresa: '',
        status: 'ALL'
    });

    const [empresas, setEmpresas] = useState<string[]>([]);
    
    // Smart Search State
    const [nlpQuery, setNlpQuery] = useState('');
    const [isNlpLoading, setIsNlpLoading] = useState(false);

    useEffect(() => {
        api.get(`/api/dashboard/filters`)
            .then(res => res)
            .then(res => {
                const data = res.data;
                if (data && Array.isArray(data.empresas)) {
                    setEmpresas(data.empresas);
                } else {
                    setEmpresas([]);
                }
            })
            .catch(err => {
                console.error("Failed to load filters", err);
                setEmpresas([]);
            });
    }, []);

    
    const handleNlpSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!nlpQuery.trim()) return;
        setIsNlpLoading(true);
        try {
            const res = await api.get(`/api/dashboard/nlp-parse?q=${encodeURIComponent(nlpQuery)}`);
            const parsed = res.data?.filters;
            
            if (parsed) {
                const newFilters: DashboardFilters = {
                    ...filters,
                    status: parsed.status || 'ALL',
                    cliente: parsed.cliente || '',
                    empresa: parsed.empresa || '',
                    startDate: parsed.startDate || '',
                    endDate: parsed.endDate || '',
                    folio: parsed.folio || ''
                };
                setFilters(newFilters);
                onFilterChange(newFilters);
            }
        } catch (err) {
            console.error("NLP parsing error", err);
        } finally {
            setIsNlpLoading(false);
            setNlpQuery('');
        }
    };

    const handleChange = (key: keyof DashboardFilters, value: string) => {
        const newFilters = { ...filters, [key]: value };
        setFilters(newFilters);
        onFilterChange(newFilters);
    };

    return (
        <aside className="w-80 bg-dark-800 border-r border-dark-700 h-screen flex flex-col fixed left-0 top-0 z-50 overflow-y-auto">
            <div className="p-6 border-b border-dark-700 flex items-center gap-3">
                <Filter className="text-brand-500" size={24} />
                <h2 className="text-xl font-bold text-white">Filtros Avanzados</h2>
            </div>

            <div className="p-6 space-y-6">

                {/* Smart Search */}
                <div className="space-y-3 bg-slate-600/10 border border-slate-600/30 p-4 rounded-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-slate-600/20 blur-3xl rounded-full translate-x-10 -translate-y-10 group-hover:bg-slate-600/30 transition-all"></div>
                    <label className="text-sm font-bold text-slate-300 flex items-center gap-2 relative z-10 select-none">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/></svg> Asistente Mágico
                    </label>
                    <form onSubmit={handleNlpSearch} className="relative z-10 m-0">
                        <textarea
                            value={nlpQuery}
                            onChange={(e) => setNlpQuery(e.target.value)}
                            onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleNlpSearch(e as any); } }}
                            placeholder="Ej. facturas pendientes de Soriana del mes pasado..."
                            className="w-full bg-dark-900/50 border border-slate-600/30 rounded-lg p-3 text-[11px] text-white placeholder-slate-300/30 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400/50 resize-none h-16 transition-all shadow-inner"
                        />
                        <div className="flex justify-between items-center mt-2">
                            <span className="text-[9px] text-slate-400/60 leading-tight">Presiona <span className="font-bold border border-slate-600/30 px-1 rounded bg-slate-800/60">Enter</span> para aplicar</span>
                            <button 
                                type="submit" 
                                disabled={isNlpLoading || !nlpQuery.trim()}
                                className="text-[10px] uppercase font-bold tracking-wider bg-slate-600 hover:bg-slate-400 text-white px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isNlpLoading ? '...' : 'Aplicar'}
                            </button>
                        </div>
                    </form>
                </div>

                {/* Rango de Fechas */}
                <div className="space-y-3">
                    <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                        <Calendar size={16} /> Rango de Fechas
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                        <input
                            type="date"
                            className="input-dark text-xs"
                            value={filters.startDate}
                            onChange={(e) => handleChange('startDate', e.target.value)}
                        />
                        <input
                            type="date"
                            className="input-dark text-xs"
                            value={filters.endDate}
                            onChange={(e) => handleChange('endDate', e.target.value)}
                        />
                    </div>
                </div>

                {/* Buscadores */}
                <div className="space-y-3">
                    <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                        <Search size={16} /> Buscar Folio
                    </label>
                    <input
                        type="text"
                        placeholder="EJ: K-47, E-149..."
                        className="input-dark"
                        value={filters.folio}
                        onChange={(e) => handleChange('folio', e.target.value)}
                    />
                </div>

                <div className="space-y-3">
                    <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                        <User size={16} /> Buscar Cliente
                    </label>
                    <input
                        type="text"
                        placeholder="Click para ver opciones..."
                        className="input-dark"
                        value={filters.cliente}
                        onChange={(e) => handleChange('cliente', e.target.value)}
                    />
                </div>

                <div className="space-y-3">
                    <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                        <Box size={16} /> Buscar Producto
                    </label>
                    <input
                        type="text"
                        placeholder="Click para ver opciones..."
                        className="input-dark"
                        disabled
                    />
                </div>

                <div className="space-y-3">
                    <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                        <Building2 size={16} /> Buscar Empresa
                    </label>
                    <select
                        className="input-dark appearance-none cursor-pointer"
                        value={filters.empresa}
                        onChange={(e) => handleChange('empresa', e.target.value)}
                    >
                        <option value="">Todas las empresas</option>
                        {empresas.map(e => (
                            <option key={e} value={e}>{e}</option>
                        ))}
                    </select>
                </div>

                {/* Estatus Toggle */}
                <div className="space-y-3">
                    <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                        <CreditCard size={16} /> Estatus de Cobro
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={() => handleChange('status', 'PAGADO')}
                            className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${filters.status === 'PAGADO' ? 'bg-success text-white ring-2 ring-white/20' : 'bg-dark-900 text-slate-500 hover:bg-dark-700'}`}
                        >
                            PAGADO
                        </button>
                        <button
                            onClick={() => handleChange('status', 'PENDIENTE')}
                            className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${filters.status === 'PENDIENTE' ? 'bg-danger text-white ring-2 ring-white/20' : 'bg-dark-900 text-slate-500 hover:bg-dark-700'}`}
                        >
                            PENDIENTE
                        </button>
                        <button
                            onClick={() => handleChange('status', 'PARCIAL')}
                            className={`col-span-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${filters.status === 'PARCIAL' ? 'bg-warning text-white ring-2 ring-white/20' : 'bg-dark-900 text-slate-500 hover:bg-dark-700'}`}
                        >
                            PARCIAL
                        </button>
                    </div>
                </div>

                <button
                    onClick={() => {
                        const clearedFilters: DashboardFilters = { startDate: '', endDate: '', folio: '', cliente: '', empresa: '', status: 'ALL' as const };
                        setFilters(clearedFilters);
                        onFilterChange(clearedFilters);
                    }}
                    className="w-full mt-8 btn-primary bg-slate-700 hover:bg-slate-600 text-xs"
                >
                    Limpiar Filtros
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
