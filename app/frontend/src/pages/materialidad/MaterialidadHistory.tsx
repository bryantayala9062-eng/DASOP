import { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../../api/axios';
import Layout from '../../components/Layout';
import { Download, Search, Eye, X, Loader2, Upload, History, Filter, RefreshCw, Trash2, Link2, Link2Off, Building2, Save, ChevronDown, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DOC_TYPES, getDocType } from '../../utils/docTypes';

interface Empresa { id: number; razon_social: string; rfc: string; }
interface Documento {
    id: number; tipo_documento: string; fecha_subida: string;
    ruta_fisica: string; periodo?: string; resultado_op?: string;
    razon_social?: string;
    cliente?: string;
    tipo_contrato?: string;
    contrato_id?: number | null;
    clientes_empresa?: string[];
}

const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' });

const VITE_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8005';

const MaterialidadHistory = () => {
    const [empresas, setEmpresas] = useState<Empresa[]>([]);
    const [empresaId, setEmpresaId] = useState<number | ''>('');
    const [documentos, setDocumentos] = useState<Documento[]>([]);
    const [loading, setLoading] = useState(false);
    const [viewingDoc, setViewingDoc] = useState<{ tipo: string; url: string } | null>(null);
    const [search, setSearch] = useState('');
    const [tipoFilter, setTipoFilter] = useState('ALL');
    // Cambiar tipo
    const [changingType, setChangingType] = useState<Documento | null>(null);
    const [changeLoading, setChangeLoading] = useState(false);
    // Eliminar
    const [deletingDoc, setDeletingDoc] = useState<Documento | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    // Vincular Contrato
    const [vincularModalDoc, setVincularModalDoc] = useState<Documento | null>(null);
    const [contratos, setContratos] = useState<any[]>([]);
    const [contratoSearch, setContratoSearch] = useState('');
    const [vincularLoading, setVincularLoading] = useState(false);
    const [showFullForm, setShowFullForm] = useState(false);
    const [desvinculandoDocId, setDesvinculandoDocId] = useState<number | null>(null);

    // Combobox de empresa
    const [empresaSearch, setEmpresaSearch] = useState('');
    const [empresaOpen, setEmpresaOpen] = useState(false);
    const empresaRef = useRef<HTMLDivElement>(null);

    // Cerrar combobox al hacer click fuera
    useEffect(() => {
        const h = (e: MouseEvent) => {
            if (empresaRef.current && !empresaRef.current.contains(e.target as Node)) {
                setEmpresaOpen(false);
            }
        };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    const [fullForm, setFullForm] = useState({
        cliente: '', representante_cliente: '', empresa: '',
        tipo_contrato: 'Prestación de Servicios', concepto: '',
        fecha_inicio: new Date().toISOString().split('T')[0],
        periodo: '1', clave_periodo: 'A', fecha_fin: '',
        responsable_interno: '', email_responsable: '',
        email_legal: '', representante_empresa: '', declarations: ''
    });

    // Auto-calculo de Fecha Fin
    useEffect(() => {
        if (fullForm.fecha_inicio && fullForm.periodo && fullForm.clave_periodo && !fullForm.fecha_fin) {
            try {
                const date = new Date(fullForm.fecha_inicio);
                const p = parseInt(fullForm.periodo);
                if (!isNaN(p)) {
                    if (fullForm.clave_periodo === 'A') date.setFullYear(date.getFullYear() + p);
                    else if (fullForm.clave_periodo === 'M') date.setMonth(date.getMonth() + p);
                    else if (fullForm.clave_periodo === 'D') date.setDate(date.getDate() + p);
                    setFullForm(prev => ({ ...prev, fecha_fin: date.toISOString().split('T')[0] }));
                }
            } catch (e) {}
        }
    }, [fullForm.fecha_inicio, fullForm.periodo, fullForm.clave_periodo]);

    useEffect(() => {
        api.get('/api/materialidad/empresas')
            .then(res => { setEmpresas(res.data); if (res.data.length > 0) setEmpresaId(res.data[0].id); })
            .catch(err => console.error(err));
    }, []);

    useEffect(() => {
        if (!empresaId) return;
        setLoading(true);
        api.get(`/api/materialidad/documentos/${empresaId}`)
            .then(res => setDocumentos(res.data))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, [empresaId]);

    const handleDownload = async (docId: number, doc: Documento) => {
        try {
            const res = await api.get(`/api/materialidad/documentos/download/${docId}`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement('a');
            a.href = url;
            // El backend ya devuelve el nombre correcto en Content-Disposition,
            // pero también lo construimos en el frontend como fallback
            const meta = getDocType(doc.tipo_documento);
            const empresa = doc.razon_social || empresaActual?.razon_social || 'Empresa';
            a.setAttribute('download', `${meta.label} - ${empresa}.pdf`);
            document.body.appendChild(a); a.click(); a.remove();
            window.URL.revokeObjectURL(url);
        } catch { alert('No se pudo descargar el archivo.'); }
    };

    const handleView = (doc: Documento) => {
        const token = sessionStorage.getItem('token');
        setViewingDoc({
            tipo: doc.tipo_documento,
            url: `${VITE_API_URL}/api/materialidad/documentos/view/${doc.id}?token=${token}`,
        });
    };

    const handleChangeType = async (docId: number, nuevoTipo: string) => {
        setChangeLoading(true);
        try {
            await api.patch(`/api/materialidad/documentos/${docId}/tipo`, { nuevo_tipo: nuevoTipo });
            // Recargar documentos
            if (empresaId) {
                const res = await api.get(`/api/materialidad/documentos/${empresaId}`);
                setDocumentos(res.data);
            }
            setChangingType(null);
        } catch (err: any) {
            alert('Error al cambiar tipo: ' + (err.response?.data?.detail || err.message));
        } finally {
            setChangeLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!deletingDoc) return;
        setDeleteLoading(true);
        try {
            await api.delete(`/api/materialidad/documentos/${deletingDoc.id}`);
            setDocumentos(prev => prev.filter(d => d.id !== deletingDoc.id));
            setDeletingDoc(null);
        } catch (err: any) {
            alert('Error al eliminar: ' + (err.response?.data?.detail || err.message));
        } finally {
            setDeleteLoading(false);
        }
    };

    const fetchContratos = async () => {
        try {
            const res = await api.get('/api/legal/contratos');
            setContratos(res.data);
        } catch (err) { console.error(err); }
    };

    useEffect(() => {
        if (vincularModalDoc) fetchContratos();
    }, [vincularModalDoc]);

    const handleVincularExistente = async (contratoId: number) => {
        if (!vincularModalDoc) return;
        setVincularLoading(true);
        try {
            await api.patch(`/api/materialidad/documentos/${vincularModalDoc.id}/vincular`, { contrato_id: contratoId });
            // Actualizar tabla local
            const c = contratos.find(x => x.id === contratoId);
            setDocumentos(prev => prev.map(d => d.id === vincularModalDoc.id ? { ...d, cliente: c?.cliente } : d));
            setVincularModalDoc(null);
        } catch (err: any) {
            alert(err.response?.data?.detail || 'Error al vincular');
        } finally {
            setVincularLoading(false);
        }
    };

    const handleCrearYVincular = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!vincularModalDoc) return;
        setVincularLoading(true);
        try {
            // 1. Crear contrato
            const payload = { ...fullForm, gen_template: false };
            const res = await api.post('/api/legal/contratos', payload);
            const newId = res.data.id;
            // 2. Vincular
            await api.patch(`/api/materialidad/documentos/${vincularModalDoc.id}/vincular`, { contrato_id: newId });
            
            setDocumentos(prev => prev.map(d => d.id === vincularModalDoc.id ? { ...d, cliente: fullForm.cliente } : d));
            setVincularModalDoc(null);
        } catch (err: any) {
            alert(err.response?.data?.detail || 'Error al crear y vincular');
        } finally {
            setVincularLoading(false);
        }
    };

    const handleDesvincular = async (docId: number) => {
        if (!confirm('¿Quitar la relación con Seguimiento Legal? El documento y el expediente seguirán existiendo por separado.')) return;
        setDesvinculandoDocId(docId);
        try {
            await api.patch(`/api/materialidad/documentos/${docId}/desvincular`);
            setDocumentos(prev => prev.map(d => d.id === docId ? { ...d, cliente: undefined } : d));
        } catch (err: any) {
            alert(err.response?.data?.detail || 'Error al desvincular');
        } finally {
            setDesvinculandoDocId(null);
        }
    };

    const contratosFiltrados = useMemo(() => {
        if (!contratoSearch) return contratos;
        return contratos.filter(c => 
            c.cliente.toLowerCase().includes(contratoSearch.toLowerCase()) ||
            String(c.id).includes(contratoSearch)
        );
    }, [contratos, contratoSearch]);

    const empresaActual = empresas.find(e => e.id === empresaId);

    const empresasFiltradas = useMemo(() =>
        empresas.filter(e =>
            e.razon_social.toLowerCase().includes(empresaSearch.toLowerCase()) ||
            e.rfc.toLowerCase().includes(empresaSearch.toLowerCase())
        ), [empresas, empresaSearch]);

    // Completitud de la empresa
    const tiposPresentes = useMemo(() => new Set(documentos.map(d => d.tipo_documento)), [documentos]);
    const completados = DOC_TYPES.filter(t => tiposPresentes.has(t.id)).length;
    const pct = Math.round((completados / DOC_TYPES.length) * 100);

    // Filtros
    const filtered = useMemo(() => {
        let r = documentos;
        if (tipoFilter !== 'ALL') r = r.filter(d => d.tipo_documento === tipoFilter);
        if (search.trim()) {
            const q = search.toLowerCase();
            r = r.filter(d =>
                d.ruta_fisica.toLowerCase().includes(q) ||
                d.tipo_documento.toLowerCase().includes(q) ||
                (d.periodo || '').toLowerCase().includes(q)
            );
        }
        return r;
    }, [documentos, tipoFilter, search]);

    return (
        <Layout>
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-8">
                <div>
                    <h2 className="text-2xl font-bold text-white mb-1 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                            <History size={20} className="text-emerald-400" />
                        </div>
                        Expediente de Materialidad
                    </h2>
                    <p className="text-slate-400 text-sm mt-1">Documentos por empresa — descarga, visualiza y filtra</p>
                </div>
                <div className="flex bg-slate-800/80 p-1.5 rounded-xl border border-slate-700/50 self-start">
                    <Link to="/materialidad" className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg text-sm font-medium transition-colors">
                        <Upload size={16} /> Cargar
                    </Link>
                    <div className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg text-sm font-medium shadow-sm">
                        <History size={16} /> Historial
                    </div>
                </div>
            </div>

            {/* Empresa selector + completitud */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-1">
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Empresa</label>
                        <div className="relative" ref={empresaRef}>
                            <button
                                type="button"
                                onClick={() => setEmpresaOpen(o => !o)}
                                className="w-full flex items-center justify-between bg-slate-900 border border-slate-700 hover:border-slate-500 text-white rounded-xl px-4 py-3 text-sm transition-colors"
                            >
                                <span className={empresaActual ? 'text-white' : 'text-slate-500'}>
                                    {empresaActual ? (
                                        <><span className="font-semibold">{empresaActual.razon_social}</span>
                                        <span className="text-slate-400 ml-2 font-mono text-xs">{empresaActual.rfc}</span></>
                                    ) : 'Seleccionar empresa...'}
                                </span>
                                <ChevronDown size={16} className={`text-slate-400 transition-transform ${empresaOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {empresaOpen && (
                                <div className="absolute z-30 w-full mt-1 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl overflow-hidden">
                                    <div className="p-2 border-b border-slate-700">
                                        <div className="relative">
                                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                            <input
                                                autoFocus
                                                type="text"
                                                value={empresaSearch}
                                                onChange={e => setEmpresaSearch(e.target.value)}
                                                placeholder="Buscar empresa o RFC..."
                                                className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-slate-500"
                                            />
                                        </div>
                                    </div>
                                    <div className="max-h-64 overflow-y-auto">
                                        {empresasFiltradas.length === 0
                                            ? <p className="text-slate-500 text-sm text-center py-4">Sin resultados</p>
                                            : empresasFiltradas.map(emp => (
                                                <button key={emp.id} type="button"
                                                    onClick={() => {
                                                        setEmpresaId(emp.id);
                                                        setTipoFilter('ALL');
                                                        setSearch('');
                                                        setEmpresaOpen(false);
                                                        setEmpresaSearch('');
                                                    }}
                                                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-700 transition-colors flex items-center justify-between ${
                                                        emp.id === empresaId ? 'bg-slate-700/60 text-white' : 'text-slate-300'
                                                    }`}
                                                >
                                                    <span className="font-medium">{emp.razon_social}</span>
                                                    <span className="text-slate-500 font-mono text-xs">{emp.rfc}</span>
                                                </button>
                                            ))
                                        }
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    {empresaActual && (
                        <div className="sm:text-right shrink-0">
                            <p className="text-xs text-slate-400 mb-1">
                                <span className={pct === 100 ? 'text-emerald-400 font-bold' : 'text-white font-bold'}>{completados}</span>
                                <span className="text-slate-500"> / {DOC_TYPES.length} tipos cargados</span>
                            </p>
                            <div className="w-48 bg-slate-700 rounded-full h-2 overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : pct > 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                            <p className="text-xs text-slate-500 mt-1">{pct}% completo</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Chips de tipo + buscador */}
            {documentos.length > 0 && (
                <div className="mb-5 space-y-3">
                    <div className="relative">
                        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar por nombre de archivo, tipo o periodo..."
                            className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl pl-10 pr-10 py-3 text-sm focus:outline-none focus:border-slate-500 transition-colors"
                        />
                        {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"><X size={16} /></button>}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <Filter size={14} className="text-slate-500" />
                        <button onClick={() => setTipoFilter('ALL')}
                            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${tipoFilter === 'ALL' ? 'bg-slate-600 border-slate-500 text-white' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}
                        >Todos ({documentos.length})</button>
                        {DOC_TYPES.filter(t => tiposPresentes.has(t.id)).map(tipo => {
                            const count = documentos.filter(d => d.tipo_documento === tipo.id).length;
                            return (
                                <button key={tipo.id} onClick={() => setTipoFilter(tipo.id)}
                                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-all flex items-center gap-1 ${tipoFilter === tipo.id ? `${tipo.bg} ${tipo.border} ${tipo.color}` : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}
                                >
                                    {tipo.icon} {tipo.shortLabel} <span className="opacity-60">·{count}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Content */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="animate-spin text-emerald-400" size={28} />
                    <span className="ml-3 text-slate-400 text-sm">Cargando documentos...</span>
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20 bg-slate-800/30 border border-slate-700/50 rounded-xl">
                    <span className="text-4xl block mb-3">{search || tipoFilter !== 'ALL' ? '🔍' : '📂'}</span>
                    <h3 className="text-white font-semibold mb-1">
                        {search || tipoFilter !== 'ALL' ? 'Sin resultados' : 'Sin documentos'}
                    </h3>
                    <p className="text-slate-400 text-sm">
                        {search || tipoFilter !== 'ALL'
                            ? 'Ajusta tu búsqueda o filtros.'
                            : empresaActual ? `No hay documentos para ${empresaActual.razon_social}.` : 'Selecciona una empresa.'}
                    </p>
                </div>
            ) : (
                <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700 bg-slate-800/80">
                        <span className="text-sm font-semibold text-white">{empresaActual?.razon_social}</span>
                        <span className="text-xs text-slate-400 bg-slate-700/50 px-2 py-0.5 rounded-full">
                            {filtered.length} {filtered.length !== documentos.length ? `de ${documentos.length}` : ''} documento{filtered.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-slate-800/60">
                                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Tipo</th>
                                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Archivo</th>
                                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Cliente</th>
                                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Periodo</th>
                                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Fecha</th>
                                    <th className="text-center px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(doc => {
                                    const meta = getDocType(doc.tipo_documento);
                                    return (
                                        <tr key={doc.id} className="border-t border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                                            <td className="px-5 py-3">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${meta.bg} ${meta.border} border ${meta.color}`}>
                                                    {meta.icon} {meta.shortLabel}
                                                </span>
                                                {doc.tipo_documento === 'OPINION_CUMPLIMIENTO' && doc.resultado_op && (
                                                    <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded font-bold ${doc.resultado_op === 'POSITIVA' ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'}`}>
                                                        {doc.resultado_op}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3 text-sm text-slate-300 truncate max-w-[200px]"
                                                title={doc.ruta_fisica.split('/').pop()}>
                                                <span className="font-medium">{meta.label}</span>
                                                {(doc.razon_social || empresaActual?.razon_social) && (
                                                    <span className="text-slate-500 text-xs ml-1">— {doc.razon_social || empresaActual?.razon_social}</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3 text-sm text-slate-300">
                                                {doc.cliente ? (
                                                    <span className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="text-white font-medium">{doc.cliente}</span>
                                                        {doc.contrato_id && (
                                                            <Link
                                                                to={`/legal?contrato=${doc.contrato_id}`}
                                                                title="Ver expediente en Seguimiento Legal"
                                                                className="flex items-center gap-0.5 px-1.5 py-0.5 bg-indigo-500/10 hover:bg-indigo-500/25 text-indigo-400 border border-indigo-500/30 rounded text-[10px] font-bold transition-all"
                                                            >
                                                                <ExternalLink size={9} /> Legal
                                                            </Link>
                                                        )}
                                                        <button
                                                            onClick={() => handleDesvincular(doc.id)}
                                                            disabled={desvinculandoDocId === doc.id}
                                                            title="Quitar relación con Legal"
                                                            className="flex items-center gap-1 px-1.5 py-0.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded text-[10px] font-bold transition-all disabled:opacity-50"
                                                        >
                                                            {desvinculandoDocId === doc.id
                                                                ? <Loader2 size={10} className="animate-spin" />
                                                                : <Link2Off size={10} />}
                                                            Quitar
                                                        </button>
                                                    </span>
                                                ) : doc.tipo_documento === 'CONTRATO_MARCO' ? (
                                                    <button 
                                                        onClick={() => {
                                                            setVincularModalDoc(doc);
                                                            setFullForm(prev => ({ ...prev, cliente: '', empresa: doc.razon_social || empresaActual?.razon_social || '' }));
                                                            setShowFullForm(false);
                                                        }}
                                                        className="flex items-center gap-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 px-2 py-1 rounded border border-indigo-500/30 text-xs font-bold transition-all"
                                                    >
                                                        <Link2 size={12} /> VINCULAR
                                                    </button>
                                                ) : (
                                                    <span className="text-slate-600">—</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3 text-sm text-slate-400 font-medium">{doc.periodo ? doc.periodo.toUpperCase() : '—'}</td>
                                            <td className="px-5 py-3 text-xs text-slate-400">{formatDate(doc.fecha_subida)}</td>
                                            <td className="px-5 py-3">
                                                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                                    <button onClick={() => handleView(doc)}
                                                        className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-700/50 border border-slate-600 text-slate-300 rounded-lg text-xs font-medium hover:bg-slate-700 transition-all"
                                                    ><Eye size={13} /> Ver</button>
                                                    <button onClick={() => handleDownload(doc.id, doc)}
                                                        className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-700/50 border border-slate-600 text-slate-300 rounded-lg text-xs font-medium hover:bg-slate-700 transition-all"
                                                    ><Download size={13} /> Descargar</button>
                                                    <button onClick={() => setChangingType(doc)}
                                                        className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-lg text-xs font-medium hover:bg-amber-500/20 transition-all"
                                                        title="Corregir tipo de documento"
                                                    ><RefreshCw size={12} /> Corregir</button>
                                                    <button onClick={() => setDeletingDoc(doc)}
                                                        className="flex items-center gap-1 px-2.5 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/20 transition-all"
                                                        title="Eliminar"
                                                    ><Trash2 size={12} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* PDF Viewer Modal */}
            {viewingDoc && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setViewingDoc(null)}>
                    <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-5xl h-[85vh] shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
                            <span className="text-white font-semibold flex items-center gap-2">
                                {getDocType(viewingDoc.tipo).icon}
                                <span>{getDocType(viewingDoc.tipo).label}</span>
                            </span>
                            <button onClick={() => setViewingDoc(null)} className="text-slate-400 hover:text-white"><X size={20} /></button>
                        </div>
                        <div className="flex-1 p-2">
                            <iframe src={viewingDoc.url} className="w-full h-full rounded-lg border border-slate-700" title="Visor PDF" />
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Cambiar Tipo */}
            {changingType && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => !changeLoading && setChangingType(null)}>
                    <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
                            <h3 className="text-white font-semibold flex items-center gap-2">
                                <RefreshCw size={18} className="text-amber-400" /> Corregir tipo de documento
                            </h3>
                            <button onClick={() => setChangingType(null)} className="text-slate-400 hover:text-white"><X size={20} /></button>
                        </div>
                        <div className="p-5">
                            <p className="text-slate-400 text-sm mb-1">Tipo actual:</p>
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold mb-4 ${getDocType(changingType.tipo_documento).bg} ${getDocType(changingType.tipo_documento).border} border ${getDocType(changingType.tipo_documento).color}`}>
                                {getDocType(changingType.tipo_documento).icon} {getDocType(changingType.tipo_documento).label}
                            </span>
                            <p className="text-slate-400 text-sm mb-3">Selecciona el tipo correcto:</p>
                            <div className="grid grid-cols-2 gap-2">
                                {DOC_TYPES.filter(t => t.id !== changingType.tipo_documento).map(tipo => (
                                    <button key={tipo.id} onClick={() => handleChangeType(changingType.id, tipo.id)}
                                        disabled={changeLoading}
                                        className={`flex items-center gap-2 p-3 rounded-xl border-2 border-slate-700 bg-slate-900/50 hover:${tipo.border} hover:${tipo.bg} text-left transition-all disabled:opacity-50`}
                                    >
                                        <span className="text-xl">{tipo.icon}</span>
                                        <span className={`text-xs font-semibold ${tipo.color}`}>{tipo.label}</span>
                                    </button>
                                ))}
                            </div>
                            {changeLoading && <p className="text-center text-slate-400 text-sm mt-3">Actualizando...</p>}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal: Eliminar ── */}
            {deletingDoc && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => !deleteLoading && setDeletingDoc(null)}>
                    <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
                            <h3 className="text-white font-semibold">🗑️ Eliminar documento</h3>
                            <button onClick={() => setDeletingDoc(null)} className="text-slate-400 hover:text-white"><X size={20} /></button>
                        </div>
                        <div className="p-6">
                            <p className="text-white mb-1">¿Eliminar este documento permanentemente?</p>
                            <p className="text-slate-400 text-sm">
                                <span className="font-semibold">{getDocType(deletingDoc.tipo_documento).icon} {getDocType(deletingDoc.tipo_documento).label}</span>
                                {' — '}{deletingDoc.ruta_fisica.split('/').pop()}
                            </p>
                            <p className="text-red-400 text-xs mt-2">Esta acción eliminará el archivo del servidor.</p>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-700">
                            <button onClick={() => setDeletingDoc(null)} disabled={deleteLoading} className="px-4 py-2 border border-slate-600 text-slate-300 rounded-lg text-sm hover:bg-slate-700">Cancelar</button>
                            <button onClick={handleDelete} disabled={deleteLoading} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-500 disabled:opacity-50">
                                {deleteLoading ? 'Eliminando...' : 'Sí, eliminar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Modal: Vincular con Legal */}
            {vincularModalDoc && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={() => setVincularModalDoc(null)}>
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                    <Link2 className="text-indigo-400" /> Relacionar Documento con Seguimiento Legal
                                </h3>
                                <p className="text-slate-400 text-sm mt-1">Archivo: <span className="text-indigo-300 font-mono">{vincularModalDoc.ruta_fisica.split('/').pop()}</span></p>
                            </div>
                            <button onClick={() => setVincularModalDoc(null)} className="text-slate-400 hover:text-white transition-colors"><X size={24} /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            {/* Toggle Tabs */}
                            <div className="flex gap-2 mb-8 bg-slate-900/50 p-1 rounded-xl border border-slate-700 max-w-md mx-auto">
                                <button 
                                    onClick={() => setShowFullForm(false)}
                                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-all ${!showFullForm ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-500 hover:text-slate-300'}`}
                                >
                                    Relacionar Existente
                                </button>
                                <button 
                                    onClick={() => setShowFullForm(true)}
                                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-all ${showFullForm ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-500 hover:text-slate-300'}`}
                                >
                                    Nueva Ficha Completa
                                </button>
                            </div>

                            {!showFullForm ? (
                                <div className="space-y-6">
                                    <div className="relative">
                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                        <input 
                                            type="text" 
                                            placeholder="Buscar cliente por nombre o ID..."
                                            value={contratoSearch}
                                            onChange={e => setContratoSearch(e.target.value)}
                                            className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl pl-11 pr-4 py-3.5 focus:border-indigo-500 outline-none transition-all"
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                                        {contratosFiltrados.length === 0 ? (
                                            <div className="col-span-2 py-12 text-center bg-slate-900/30 rounded-2xl border border-slate-700/50 border-dashed">
                                                <p className="text-slate-500 italic">No se encontraron resultados</p>
                                            </div>
                                        ) : (
                                            contratosFiltrados.map(c => (
                                                <button 
                                                    key={c.id}
                                                    onClick={() => handleVincularExistente(c.id)}
                                                    disabled={vincularLoading}
                                                    className="text-left p-4 bg-slate-900 border border-slate-700 rounded-xl hover:border-indigo-500 hover:bg-indigo-500/5 group transition-all"
                                                >
                                                    <div className="flex justify-between items-start mb-2">
                                                        <span className="text-[10px] font-bold text-indigo-400 bg-indigo-400/10 px-2 py-0.5 rounded uppercase">ID: {c.id}</span>
                                                        {/* Badge sugerido si empresa coincide */}
                                                    </div>
                                                    <div className="text-white font-bold mb-1 truncate">{c.cliente}</div>
                                                    <div className="text-slate-500 text-xs truncate">{c.tipo_contrato}</div>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <form onSubmit={handleCrearYVincular} className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="col-span-2 bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-4 flex gap-3 items-center">
                                            <Building2 className="text-indigo-400 flex-shrink-0" />
                                            <div>
                                                <p className="text-indigo-300 text-xs font-bold uppercase tracking-wider">Empresa Emisora Detectada</p>
                                                <p className="text-white font-semibold">{vincularModalDoc.razon_social || empresaActual?.razon_social}</p>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-400 uppercase">Cliente (Razón Social)</label>
                                            <input required type="text" value={fullForm.cliente} onChange={e => setFullForm({...fullForm, cliente: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-2.5 focus:border-indigo-500 outline-none" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-400 uppercase">Tipo de Contrato</label>
                                            <input required type="text" list="tipos-modal" value={fullForm.tipo_contrato} onChange={e => setFullForm({...fullForm, tipo_contrato: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-2.5 focus:border-indigo-500 outline-none" />
                                            <datalist id="tipos-modal">
                                                <option value="Prestación de Servicios" /><option value="Arrendamiento" /><option value="NDA / Confidencialidad" /><option value="Compraventa" />
                                            </datalist>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-400 uppercase">Responsable Interno</label>
                                            <input required type="text" value={fullForm.responsable_interno} onChange={e => setFullForm({...fullForm, responsable_interno: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-2.5 focus:border-indigo-500 outline-none" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-400 uppercase">Email Responsable</label>
                                            <input required type="email" value={fullForm.email_responsable} onChange={e => setFullForm({...fullForm, email_responsable: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-2.5 focus:border-indigo-500 outline-none" />
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 col-span-2">
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold text-slate-400 uppercase">Fecha Inicio</label>
                                                <input type="date" value={fullForm.fecha_inicio} onChange={e => setFullForm({...fullForm, fecha_inicio: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-2.5 focus:border-indigo-500 outline-none" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold text-slate-400 uppercase">Vencimiento (Fecha Fin)</label>
                                                <input type="date" value={fullForm.fecha_fin} onChange={e => setFullForm({...fullForm, fecha_fin: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-2.5 focus:border-indigo-500 outline-none" />
                                            </div>
                                        </div>

                                        <div className="md:col-span-2 space-y-2">
                                            <label className="text-xs font-bold text-slate-400 uppercase">Concepto / Objeto del Contrato</label>
                                            <input type="text" value={fullForm.concepto} onChange={e => setFullForm({...fullForm, concepto: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-2.5 focus:border-indigo-500 outline-none" />
                                        </div>
                                    </div>
                                    
                                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
                                        <button type="button" onClick={() => setShowFullForm(false)} className="px-6 py-2.5 text-slate-400 hover:text-white font-bold transition-all">Cancelar</button>
                                        <button type="submit" disabled={vincularLoading} className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-indigo-900/20 disabled:opacity-50">
                                            {vincularLoading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                                            Crear y Vincular
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
};

export default MaterialidadHistory;
