import React, { useState, useEffect, useRef, useMemo } from 'react';
import { api } from '../../api/axios';
import Layout from '../../components/Layout';
import { Upload, FileText, CheckCircle, XCircle, Plus, X, Building2, History, FolderOpen, Layers, AlertTriangle, Search, ChevronDown, ChevronRight, Trash2, Loader2, Save, Eye, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { clearOPStatusCache } from '../../components/dashboard/OPStatusBadge';
import { DOC_TYPES } from '../../utils/docTypes';

interface Empresa {
    id: number;
    razon_social: string;
    rfc: string;
}

interface ContratoLegal {
    id: number;
    cliente: string;
    tipo_contrato: string;
    empresa_id?: number | null;
    empresa?: string | null;
    concepto?: string | null;
    fecha_inicio?: string | null;
    fecha_fin?: string | null;
}

const MaterialidadUpload = () => {
    const [empresas, setEmpresas] = useState<Empresa[]>([]);
    const [empresaId, setEmpresaId] = useState<number | ''>('');
    const [tipoDoc, setTipoDoc] = useState(DOC_TYPES[0].id);
    const [archivo, setArchivo] = useState<File | null>(null);
    const [dragover, setDragover] = useState(false);
    const [loading, setLoading] = useState(false);
    const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [activeTab, setActiveTab] = useState<'upload' | 'lote' | 'vincular' | 'cafi'>('upload');
    // CAFIS
    const [cafis, setCafis] = useState<any[]>([]);
    const [cafiListSearch, setCafiListSearch] = useState('');
    const [cafiFilterEmisora, setCafiFilterEmisora] = useState<'Todos' | 'EXFIS' | 'HOLDINGS' | 'NAMUR MONS'>('Todos');
    const [clientesUnicos, setClientesUnicos] = useState<string[]>([]);
    const [cafiLoading, setCafiLoading] = useState(false);
    const [showCafiModal, setShowCafiModal] = useState(false);
    const [cafiPreviewUrl, setCafiPreviewUrl] = useState<string | null>(null);
    const [cafiForm, setCafiForm] = useState({ emisora: '', cliente: '', fecha_creacion: '', fecha_vencimiento: '', cafi_id: null as number | null, tipo_archivo: 'contrato' });
    const [cafiFile, setCafiFile] = useState<File | null>(null);
    const cafiFileInputRef = useRef<HTMLInputElement>(null);
    const [cafiClienteSearch, setCafiClienteSearch] = useState('');
    const [cafiClienteOpen, setCafiClienteOpen] = useState(false);
    const cafiClienteRef = useRef<HTMLDivElement>(null);
    const [expandedCafiGroups, setExpandedCafiGroups] = useState<Record<string, boolean>>({});

    const groupedCafis = useMemo(() => {
        const groups: Record<string, any[]> = {};
        const filteredCafis = cafis.filter(c => 
            (!cafiListSearch || (c.cliente || '').toLowerCase().includes(cafiListSearch.toLowerCase()) || (c.emisora || '').toLowerCase().includes(cafiListSearch.toLowerCase())) &&
            (cafiFilterEmisora === 'Todos' || (c.emisora || '').toUpperCase() === cafiFilterEmisora)
        );
        
        filteredCafis.forEach(c => {
            const key = `${c.emisora || 'Desconocida'}|||${c.cliente || 'Desconocido'}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(c);
        });
        
        return Object.entries(groups).map(([key, items]) => {
            const [emisora, cliente] = key.split('|||');
            return { key, emisora, cliente, items };
        });
    }, [cafis, cafiListSearch, cafiFilterEmisora]);

    const toggleCafiGroup = (key: string) => {
        setExpandedCafiGroups(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const fetchCafis = async () => {
        try {
            setCafiLoading(true);
            const [resCafis, resClientes] = await Promise.all([
                api.get('/api/materialidad/cafis'),
                api.get('/api/materialidad/clientes-unicos')
            ]);
            setCafis(resCafis.data);
            setClientesUnicos(resClientes.data);
        } catch (err) { console.error(err); }
        finally { setCafiLoading(false); }
    };

    useEffect(() => { if (activeTab === 'cafi') fetchCafis(); }, [activeTab]);

    const handleCafiSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!cafiFile) {
            setAlert({ type: 'error', message: 'El archivo PDF es obligatorio' });
            return;
        }
        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('archivo', cafiFile);
            if (cafiForm.emisora) formData.append('emisora', cafiForm.emisora);
            if (cafiForm.cliente) formData.append('cliente', cafiForm.cliente);
            if (cafiForm.fecha_creacion) formData.append('fecha_creacion', cafiForm.fecha_creacion);
            if (cafiForm.fecha_vencimiento) formData.append('fecha_vencimiento', cafiForm.fecha_vencimiento);
            if (cafiForm.cafi_id) formData.append('cafi_id', String(cafiForm.cafi_id));
            formData.append('tipo_archivo', cafiForm.tipo_archivo);
            await api.post('/api/materialidad/cafis/upload', formData);
            setAlert({ type: 'success', message: 'CAFI subido exitosamente' });
            setShowCafiModal(false);
            setCafiFile(null);
            setCafiForm({ emisora: '', cliente: '', fecha_creacion: '', fecha_vencimiento: '', cafi_id: null, tipo_archivo: 'contrato' });
            fetchCafis();
        } catch (err: any) {
            setAlert({ type: 'error', message: err.response?.data?.detail || 'Error al subir CAFI' });
        } finally { setLoading(false); }
    };

    const handleDeleteCafi = async (id: number) => {
        if (!confirm('¿Seguro que deseas eliminar este CAFI?')) return;
        try {
            await api.delete('/api/materialidad/cafis/' + id);
            setAlert({ type: 'success', message: 'CAFI eliminado' });
            fetchCafis();
        } catch (err: any) {
            setAlert({ type: 'error', message: err.response?.data?.detail || 'Error al eliminar CAFI' });
        }
    };

    const ESTATUS_CYCLE = ['pendiente', 'en_proceso', 'completo'] as const;
    const ESTATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
        pendiente: { bg: 'bg-slate-700/50 border-slate-600', text: 'text-slate-400', label: 'Pendiente' },
        en_proceso: { bg: 'bg-amber-500/15 border-amber-500/30', text: 'text-amber-400', label: 'En Proceso' },
        completo: { bg: 'bg-emerald-500/15 border-emerald-500/30', text: 'text-emerald-400', label: 'Completo' },
    };

    const handleCycleEstatus = async (cafiId: number, campo: string, valorActual: string) => {
        const idx = ESTATUS_CYCLE.indexOf(valorActual as any);
        const siguiente = ESTATUS_CYCLE[(idx + 1) % ESTATUS_CYCLE.length];
        try {
            await api.patch(`/api/materialidad/cafis/${cafiId}/estatus`, { campo, valor: siguiente });
            setCafis(prev => prev.map(c => c.id === cafiId ? { ...c, [`estatus_${campo}`]: siguiente } : c));
        } catch (err: any) {
            setAlert({ type: 'error', message: err.response?.data?.detail || 'Error al actualizar estatus' });
        }
    };


interface DocPorVincular {
    id: number;
    empresa_id: number;
    razon_social: string;
    fecha_subida: string;
    ruta_fisica: string;
}

    const [docsPorVincular, setDocsPorVincular] = useState<DocPorVincular[]>([]);
    const [vincularDocsLoading, setVincularDocsLoading] = useState(false);
    const [activeUnlinkedDoc, setActiveUnlinkedDoc] = useState<DocPorVincular | null>(null);

    const fetchPorVincular = async () => {
        try {
            setVincularDocsLoading(true);
            const res = await api.get('/api/materialidad/documentos/por-vincular');
            setDocsPorVincular(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setVincularDocsLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'vincular') {
            // Limpiar contrato_ids fantasma Y sincronizar PDFs antes de cargar la lista
            Promise.allSettled([
                api.post('/api/materialidad/limpiar-fantasmas'),
                api.post('/api/materialidad/sincronizar-pdfs'),
            ]).finally(() => {
                fetchPorVincular();
            });
            setActiveUnlinkedDoc(null);
            setContratoId('');
            setContratoSearch('');
        }
    }, [activeTab]);

    const handleVincularExistente = async () => {
        if (!activeUnlinkedDoc || !contratoId) return;
        setLoading(true);
        try {
            await api.patch(`/api/materialidad/documentos/${activeUnlinkedDoc.id}/vincular`, { contrato_id: contratoId });
            setAlert({ type: 'success', message: 'Documento vinculado a Seguimiento Legal exitosamente' });
            setActiveUnlinkedDoc(null);
            setContratoId('');
            setContratoSearch('');
            fetchPorVincular();
        } catch (err: any) {
            setAlert({ type: 'error', message: err.response?.data?.detail || 'Error al vincular' });
        } finally {
            setLoading(false);
        }
    };

    const handleCrearYVincular = async () => {
        if (!activeUnlinkedDoc || !contratoSearch) return;
        setLoading(true);
        try {
            // 1. Crear el contrato rápido en Legal
            const resNew = await api.post('/api/legal/contratos/quick', {
                cliente: contratoSearch,
                empresa_id: activeUnlinkedDoc.empresa_id,
                concepto: "CONTRATO CREADO DESDE MATERIALIDAD"
            });
            const newContratoId = resNew.data.id;
            
            // 2. Vincularlo al documento
            await api.patch(`/api/materialidad/documentos/${activeUnlinkedDoc.id}/vincular`, { contrato_id: newContratoId });
            
            setAlert({ type: 'success', message: `Contrato para ${contratoSearch} creado y vinculado exitosamente` });
            setActiveUnlinkedDoc(null);
            setContratoId('');
            setContratoSearch('');
            
            // Actualizar datos
            fetchPorVincular();
            fetchEmpresas(); 
        } catch (err: any) {
            setAlert({ type: 'error', message: err.response?.data?.detail || 'Error al crear y vincular' });
        } finally {
            setLoading(false);
        }
    };

    // Company combobox
    const [empresaSearch, setEmpresaSearch] = useState('');
    const [empresaOpen, setEmpresaOpen] = useState(false);
    const empresaRef = useRef<HTMLDivElement>(null);

    // Contrato Legal Combobox
    const [contratos, setContratos] = useState<ContratoLegal[]>([]);
    const [contratoId, setContratoId] = useState<number | ''>('');
    const [contratoSearch, setContratoSearch] = useState('');
    const [contratoOpen, setContratoOpen] = useState(false);
    const [creandoContrato, setCreandoContrato] = useState(false);
    const contratoRef = useRef<HTMLDivElement>(null);

    // New company modal
    const [showNewCompany, setShowNewCompany] = useState(false);
    const [newCompany, setNewCompany] = useState({ razon_social: '', rfc: '' });
    const [newCompanyLoading, setNewCompanyLoading] = useState(false);
    const [deletingCompany, setDeletingCompany] = useState(false);

    const handleCrearContratoRapido = async () => {
        if (!contratoSearch || !empresaId) return;
        setCreandoContrato(true);
        try {
            const res = await api.post('/api/legal/contratos/quick', {
                cliente: contratoSearch,
                empresa_id: empresaId,
                concepto: "CONTRATO CREADO DESDE UPLOAD MATERIALIDAD"
            });
            const newContrato = res.data;
            setContratos(prev => [newContrato, ...prev]);
            setContratoId(newContrato.id);
            setContratoOpen(false);
            setAlert({ type: 'success', message: `Contrato para ${contratoSearch} creado exitosamente y seleccionado.` });
        } catch (err: any) {
            setAlert({ type: 'error', message: err.response?.data?.detail || 'Error al crear contrato' });
        } finally {
            setCreandoContrato(false);
        }
    };

    // Importación masiva
    const [carpetaPath, setCarpetaPath] = useState('');
    const [loteLoading, setLoteLoading] = useState(false);
    const [loteReporte, setLoteReporte] = useState<any | null>(null);

    // Corrección manual de OPs sin resultado
    const [fixLoading, setFixLoading] = useState(false);
    const [fixReporte, setFixReporte] = useState<any | null>(null);

    const [showFullForm, setShowFullForm] = useState(false);
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

    const handleFullCreateAndLink = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeUnlinkedDoc) return;
        setLoading(true);
        try {
            const res = await api.post('/api/legal/contratos', { ...fullForm, gen_template: false });
            const newId = res.data.id;
            await api.patch(`/api/materialidad/documentos/${activeUnlinkedDoc.id}/vincular`, { contrato_id: newId });
            setAlert({ type: 'success', message: `Expediente para ${fullForm.cliente} creado y vinculado` });
            setActiveUnlinkedDoc(null);
            setShowFullForm(false);
            fetchPorVincular();
        } catch (err: any) {
            setAlert({ type: 'error', message: err.response?.data?.detail || 'Error al crear y vincular' });
        } finally {
            setLoading(false);
        }
    };

    const fetchEmpresas = async () => {
        try {
            const res = await api.get('/api/materialidad/empresas');
            setEmpresas(res.data);
            if (res.data.length > 0 && !empresaId) setEmpresaId(res.data[0].id);
            
            // Cargar contratos de legal
            const resContratos = await api.get('/api/legal/contratos');
            setContratos(resContratos.data);
        } catch (err) {
            console.error('Error cargando datos:', err);
        }
    };

    useEffect(() => { fetchEmpresas(); }, []);

    // Cerrar combobox al hacer click fuera
    useEffect(() => {
        const h = (e: MouseEvent) => { 
            if (empresaRef.current && !empresaRef.current.contains(e.target as Node)) setEmpresaOpen(false); 
            if (contratoRef.current && !contratoRef.current.contains(e.target as Node)) setContratoOpen(false);
            if (cafiClienteRef.current && !cafiClienteRef.current.contains(e.target as Node)) setCafiClienteOpen(false);
        };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    const empresasFiltradas = useMemo(() =>
        empresas.filter(e =>
            e.razon_social.toLowerCase().includes(empresaSearch.toLowerCase()) ||
            e.rfc.toLowerCase().includes(empresaSearch.toLowerCase())
        ), [empresas, empresaSearch]);

    const empresaActual = empresas.find(e => e.id === empresaId);
    const contratosFiltrados = useMemo(() => {
        let filtrados = contratos;
        
        const q = contratoSearch.trim().toLowerCase();
        
        if (q) {
            filtrados = filtrados.filter(c => 
                (c.cliente && c.cliente.toLowerCase().includes(q)) ||
                (c.tipo_contrato && c.tipo_contrato.toLowerCase().includes(q))
            );
        } else {
            // Mostrar solo los de esta empresa por defecto si no hay búsqueda
            if (empresaActual) {
                const nombreEmpresa = empresaActual.razon_social.toLowerCase();
                filtrados = filtrados.filter(c => {
                    // Si ya está vinculado con ID, perfecto
                    if (c.empresa_id === empresaActual.id) return true;
                    // Si no está vinculado por ID, intentamos ver si el nombre corto del contrato
                    // está incluido en el nombre largo de la empresa (ej: "AMARENT" en "ABASTECEDORA... AMARENT")
                    if (c.empresa && nombreEmpresa.includes(c.empresa.toLowerCase())) return true;
                    return false;
                });
            }
        }
        
        // Ordenar para que los de esta empresa salgan primero
        if (empresaActual) {
            const nombreEmpresa = empresaActual.razon_social.toLowerCase();
            filtrados.sort((a, b) => {
                const aMatch = a.empresa_id === empresaActual.id || (a.empresa && nombreEmpresa.includes(a.empresa.toLowerCase()));
                const bMatch = b.empresa_id === empresaActual.id || (b.empresa && nombreEmpresa.includes(b.empresa.toLowerCase()));
                
                if (aMatch && !bMatch) return -1;
                if (!aMatch && bMatch) return 1;
                return 0;
            });
        }
        
        // Limitar a los 50 primeros para no saturar la UI
        return filtrados.slice(0, 50);
    }, [contratos, contratoSearch, empresaActual]);

    const tipoActual = DOC_TYPES.find(t => t.id === tipoDoc);
    const contratoActual = contratos.find(c => c.id === contratoId);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragover(false);
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'application/pdf') {
            setArchivo(file);
        } else {
            setAlert({ type: 'error', message: 'Solo se permiten archivos PDF' });
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) setArchivo(file);
    };

    const handleSubmit = async () => {
        if (!archivo || !empresaId) return;
        setLoading(true);
        setAlert(null);

        const formData = new FormData();
        formData.append('archivo', archivo);
        formData.append('empresa_id', String(empresaId));
        formData.append('tipo_documento', tipoDoc);
        if (tipoDoc === 'CONTRATO_MARCO' && contratoId) {
            formData.append('contrato_id', String(contratoId));
        }

        try {
            const res = await api.post('/api/materialidad/documentos/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setAlert({ type: 'success', message: res.data.message });
            setArchivo(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (err: any) {
            setAlert({ type: 'error', message: err.response?.data?.detail || 'Error al subir el documento' });
        } finally {
            setLoading(false);
        }
    };

    const handleCreateCompany = async () => {
        if (!newCompany.razon_social || !newCompany.rfc) return;
        setNewCompanyLoading(true);
        try {
            const formData = new FormData();
            formData.append('razon_social', newCompany.razon_social);
            formData.append('rfc', newCompany.rfc);
            const res = await api.post('/api/materialidad/empresas', formData);
            setShowNewCompany(false);
            setNewCompany({ razon_social: '', rfc: '' });
            await fetchEmpresas();
            setEmpresaId(res.data.id);
        } catch (err: any) {
            setAlert({ type: 'error', message: err.response?.data?.detail || 'Error al crear empresa' });
        }
        setNewCompanyLoading(false);
    };

    const handleDeleteCompany = async () => {
        if (!empresaId) return;
        
        setDeletingCompany(true);
        try {
            await api.delete(`/api/materialidad/empresas/${empresaId}`);
            setAlert({ type: 'success', message: 'Empresa eliminada exitosamente' });
            setEmpresaId('');
            await fetchEmpresas();
        } catch (err: any) {
            setAlert({ type: 'error', message: err.response?.data?.detail || 'Error al eliminar empresa' });
        } finally {
            setDeletingCompany(false);
        }
    };

    const handleImportarLote = async () => {
        if (!carpetaPath.trim()) return;
        setLoteLoading(true);
        setLoteReporte(null);
        try {
            const res = await api.post('/api/materialidad/importar-lote', { carpeta_path: carpetaPath.trim() });
            setLoteReporte(res.data);
            // Limpiar cache de badges OP para reflejar nuevos datos
            clearOPStatusCache();
        } catch (err: any) {
            setLoteReporte({ error: err.response?.data?.detail || 'Error al importar' });
        } finally {
            setLoteLoading(false);
        }
    };

    const handleCorregirOPs = async () => {
        setFixLoading(true);
        setFixReporte(null);
        try {
            const res = await api.post('/api/materialidad/actualizar-resultados-op');
            setFixReporte(res.data);
            clearOPStatusCache();
        } catch (err: any) {
            setFixReporte({ error: err.response?.data?.detail || 'Error al actualizar' });
        } finally {
            setFixLoading(false);
        }
    };

    return (
        <Layout>
            {/* Header */}
            <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white mb-1 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                            <Upload size={20} className="text-emerald-400" />
                        </div>
                        Módulo de Materialidad
                    </h2>
                    <p className="text-slate-400 text-sm mt-2">Sube un archivo PDF y asócialo a una empresa registrada</p>
                </div>
                
                {/* Tabs */}
                <div className="flex bg-slate-800/80 p-1.5 rounded-xl border border-slate-700/50">
                    <button
                        onClick={() => setActiveTab('upload')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            activeTab === 'upload' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                        }`}
                    >
                        <Upload size={16} />
                        Cargar Documento
                    </button>
                    <Link to="/materialidad/historial"
                        className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg text-sm font-medium transition-colors"
                    >
                        <History size={16} />
                        Ver Historial
                    </Link>
                    <button
                        onClick={() => setActiveTab('lote')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            activeTab === 'lote' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                        }`}
                    >
                        <Layers size={16} />
                        Importación Masiva
                    </button>
                    <button
                        onClick={() => setActiveTab('vincular')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            activeTab === 'vincular' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                        }`}
                    >
                        <FolderOpen size={16} />
                        Por Vincular
                        {docsPorVincular.length > 0 && activeTab !== 'vincular' && (
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse ml-1"></span>
                        )}
                    </button>
                    
                    <button
                        onClick={() => setActiveTab('cafi')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            activeTab === 'cafi' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                        }`}
                    >
                        <FileText size={16} />
                        Contratos CAFI
                    </button>
                </div>

            </div>


            {/* ─── Tab: Por Vincular ─── */}
            {activeTab === 'vincular' && (
                <div className="space-y-6">
                    {alert && (
                        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${alert.type === 'success'
                            ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                            : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
                            {alert.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
                            {alert.message}
                        </div>
                    )}

                    {!activeUnlinkedDoc ? (
                        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                            <div className="p-5 border-b border-slate-700">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <AlertTriangle size={20} className="text-amber-400" /> Contratos sin Vincular
                                </h3>
                                <p className="text-slate-400 text-sm mt-1">Estos contratos PDF fueron cargados en Materialidad pero no están asociados a ningún expediente de Seguimiento Legal.</p>
                            </div>
                            
                            {vincularDocsLoading ? (
                                <div className="p-10 text-center text-slate-400">Cargando...</div>
                            ) : docsPorVincular.length === 0 ? (
                                <div className="p-16 text-center text-emerald-400">
                                    <CheckCircle size={48} className="mx-auto mb-4 opacity-50" />
                                    <p className="text-lg font-semibold">¡Todo al día!</p>
                                    <p className="text-sm opacity-80">No hay contratos pendientes de relacionar.</p>
                                </div>
                            ) : (
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-slate-900/50 text-slate-400 text-xs uppercase tracking-wider text-left border-b border-slate-700">
                                            <th className="p-4 font-semibold">Empresa Emisora</th>
                                            <th className="p-4 font-semibold">Fecha de Carga</th>
                                            <th className="p-4 font-semibold">Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {docsPorVincular.map(doc => (
                                            <tr key={doc.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                                                <td className="p-4">
                                                    <div className="font-semibold text-white">{doc.razon_social}</div>
                                                    <div className="text-xs text-slate-500 font-mono mt-1">ID DOC: #{doc.id}</div>
                                                </td>
                                                <td className="p-4 text-slate-300 text-sm">
                                                    {new Date(doc.fecha_subida).toLocaleDateString()}
                                                </td>
                                                <td className="p-4 flex gap-2">
                                                    <button 
                                                        onClick={() => setCafiPreviewUrl(import.meta.env.VITE_API_URL + '/api/materialidad/documentos/view/' + doc.id + '?token=' + sessionStorage.getItem('token'))}
                                                        className="flex items-center gap-2 px-3 py-2 bg-slate-700/50 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-600 rounded-lg text-sm font-medium transition-colors"
                                                        title="Previsualizar PDF"
                                                    >
                                                        <Eye size={16} /> Ver
                                                    </button>
                                                    <button 
                                                        onClick={() => {
                                                            setActiveUnlinkedDoc(doc);
                                                            setContratoSearch(doc.razon_social);
                                                            setAlert(null);
                                                        }}
                                                        className="px-4 py-2 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-lg text-sm font-medium transition-colors"
                                                    >
                                                        Relacionar
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    ) : (
                        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
                            <button 
                                onClick={() => setActiveUnlinkedDoc(null)}
                                className="text-slate-400 hover:text-white flex items-center gap-1 text-sm font-medium mb-6 transition-colors"
                            >
                                ← Volver a la lista
                            </button>
                            
                            <div className="mb-6 pb-6 border-b border-slate-700">
                                <h3 className="text-xl font-bold text-white mb-2">Relacionar Documento</h3>
                                <div className="bg-slate-900/50 border border-slate-700 p-4 rounded-lg flex items-center gap-3">
                                    <FileText className="text-slate-400" size={24} />
                                    <div className="flex-1">
                                        <p className="text-white font-medium">Contrato cargado en <span className="text-emerald-400">{activeUnlinkedDoc.razon_social}</span></p>
                                        <p className="text-slate-500 text-sm">Subido el {new Date(activeUnlinkedDoc.fecha_subida).toLocaleDateString()}</p>
                                    </div>
                                    <button 
                                        onClick={() => setCafiPreviewUrl(import.meta.env.VITE_API_URL + '/api/materialidad/documentos/view/' + activeUnlinkedDoc.id + '?token=' + sessionStorage.getItem('token'))}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-700/50 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-600 rounded-lg text-xs font-medium transition-colors shrink-0"
                                    >
                                        <Eye size={14} /> Ver PDF Original
                                    </button>
                                </div>
                            </div>
                            
                            <div className="flex gap-2 mb-6 bg-slate-900/50 p-1 rounded-xl border border-slate-700">
                                <button onClick={() => setShowFullForm(false)} className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all ${!showFullForm ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>BUSCAR EXISTENTE</button>
                                <button onClick={() => {
                                    setShowFullForm(true);
                                    setFullForm(prev => ({ ...prev, empresa: activeUnlinkedDoc.razon_social }));
                                }} className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all ${showFullForm ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>NUEVA FICHA COMPLETA</button>
                            </div>

                            {!showFullForm ? (
                                <>
                                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                        <Search size={14} /> Buscar Cliente en Legal
                                    </label>
                                    
                                    <div className="relative flex-1 mb-6" ref={contratoRef}>
                                        {contratoActual ? (
                                            <div className="flex items-center justify-between bg-indigo-500/10 border border-indigo-500/30 text-white rounded-xl px-4 py-3 text-sm">
                                                <span>
                                                    <span className="font-semibold text-indigo-300">Vinculando a: </span>
                                                    <span className="font-bold">{contratoActual.cliente}</span>
                                                    <span className="text-slate-400 ml-2 font-mono text-xs">{contratoActual.tipo_contrato}</span>
                                                </span>
                                                <button type="button" onClick={() => { setContratoId(''); setContratoSearch(''); }} className="text-slate-400 hover:text-red-400" title="Cambiar selección">
                                                    <X size={16}/>
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="relative">
                                                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                                                    <input 
                                                        type="text" 
                                                        value={contratoSearch}
                                                        onChange={e => { setContratoSearch(e.target.value); setContratoOpen(true); }}
                                                        onFocus={() => { setContratoOpen(true); }}
                                                        placeholder="Teclea el nombre del cliente para buscar su expediente..."
                                                        className="w-full bg-slate-900 border border-slate-700 hover:border-slate-500 text-white rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-slate-500 transition-colors"
                                                    />
                                                </div>

                                                {contratoOpen && !contratoActual && (
                                                    <div className="absolute z-30 w-full mt-1 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl overflow-hidden flex flex-col">
                                                        <div className="max-h-52 overflow-y-auto">
                                                            {contratosFiltrados.length === 0 ? (
                                                                <div className="p-4 text-center">
                                                                    <p className="text-slate-500 text-sm mb-3">No se encontraron clientes con "{contratoSearch}"</p>
                                                                </div>
                                                            ) : (
                                                                contratosFiltrados.map(c => (
                                                                    <button key={c.id} type="button"
                                                                        onClick={() => { setContratoId(c.id); setContratoOpen(false); }}
                                                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-700 transition-colors flex items-center justify-between text-slate-300 border-b border-slate-700/50 last:border-0"
                                                                    >
                                                                        <div>
                                                                            <span className="font-medium block">#{c.id} - {c.cliente}</span>
                                                                            <span className="text-slate-500 text-xs">{c.tipo_contrato}</span>
                                                                        </div>
                                                                        {c.empresa_id && c.empresa_id === activeUnlinkedDoc.empresa_id && (
                                                                            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full uppercase font-bold">Sugerido</span>
                                                                        )}
                                                                    </button>
                                                                ))
                                                            )}
                                                        </div>
                                                        
                                                        {/* Opción de creación rápida si hay texto buscado */}
                                                        {contratoSearch.length > 2 && (
                                                            <div className="p-2 bg-slate-900/50 border-t border-slate-700">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => { handleCrearYVincular(); setContratoOpen(false); }}
                                                                    className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all"
                                                                >
                                                                    <Plus size={14} /> CREAR NUEVA LÍNEA RÁPIDA: "{contratoSearch.toUpperCase()}"
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>

                                    <button 
                                        onClick={handleVincularExistente}
                                        disabled={!contratoId || loading}
                                        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl text-sm transition-all shadow-lg"
                                    >
                                        {loading ? "Vinculando..." : "Confirmar Relación"}
                                    </button>
                                </>
                            ) : (
                                <form onSubmit={handleFullCreateAndLink} className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="col-span-2 space-y-1">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Empresa Emisora</label>
                                            <div className="p-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white text-sm font-semibold">{activeUnlinkedDoc.razon_social}</div>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cliente (Razón Social)</label>
                                            <input required type="text" value={fullForm.cliente} onChange={e => setFullForm({...fullForm, cliente: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:border-indigo-500 outline-none" />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tipo de Contrato</label>
                                            <input required type="text" list="tipos-up" value={fullForm.tipo_contrato} onChange={e => setFullForm({...fullForm, tipo_contrato: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:border-indigo-500 outline-none" />
                                            <datalist id="tipos-up"><option value="Prestación de Servicios" /><option value="Arrendamiento" /><option value="NDA" /></datalist>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Responsable Interno</label>
                                            <input required type="text" value={fullForm.responsable_interno} onChange={e => setFullForm({...fullForm, responsable_interno: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:border-indigo-500 outline-none" />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Email Responsable</label>
                                            <input required type="email" value={fullForm.email_responsable} onChange={e => setFullForm({...fullForm, email_responsable: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:border-indigo-500 outline-none" />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fecha Inicio</label>
                                            <input type="date" value={fullForm.fecha_inicio} onChange={e => setFullForm({...fullForm, fecha_inicio: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm" />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fecha Fin</label>
                                            <input type="date" value={fullForm.fecha_fin} onChange={e => setFullForm({...fullForm, fecha_fin: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm" />
                                        </div>
                                    </div>
                                    <button type="submit" disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl text-xs transition-all shadow-lg flex items-center justify-center gap-2">
                                        {loading ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} CREAR EXPEDIENTE Y VINCULAR
                                    </button>
                                </form>
                            )}
                        </div>
                    )}
                </div>
            )}

            
            {/* ─── Tab: CAFI ─── */}
            {activeTab === 'cafi' && (
                <div className="space-y-6">
                    {alert && (
                        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${alert.type === 'success'
                            ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                            : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
                            {alert.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
                            {alert.message}
                        </div>
                    )}

                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center bg-slate-800 p-4 rounded-xl border border-slate-700 gap-4">
                        <div>
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <FileText size={20} className="text-amber-400" /> Directorio de CAFI
                            </h3>
                            <div className="mt-3 flex gap-2">
                                {['Todos', 'EXFIS', 'HOLDINGS', 'NAMUR MONS'].map(f => (
                                    <button 
                                        key={f} 
                                        onClick={() => setCafiFilterEmisora(f as any)}
                                        className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${cafiFilterEmisora === f ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-slate-900 text-slate-400 border border-slate-700 hover:text-white'}`}
                                    >
                                        {f}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex flex-1 max-w-md items-center gap-2">
                            <div className="relative flex-1">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input 
                                    type="text" 
                                    placeholder="Buscar por cliente o emisora..." 
                                    value={cafiListSearch} 
                                    onChange={e => setCafiListSearch(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-amber-500 transition-colors"
                                />
                            </div>
                            <button onClick={() => {
                                setCafiForm({
                                    emisora: cafiFilterEmisora !== 'Todos' ? cafiFilterEmisora : '',
                                    cliente: '',
                                    fecha_creacion: '',
                                    fecha_vencimiento: '',
                                    cafi_id: null,
                                    tipo_archivo: 'contrato'
                                });
                                setShowCafiModal(true);
                            }} className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-lg transition-colors shrink-0">
                                <Plus size={16} /> Subir CAFI
                            </button>
                        </div>
                    </div>

                    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                        {cafiLoading ? (
                            <div className="p-10 text-center text-slate-400"><Loader2 className="animate-spin mx-auto mb-2" size={24}/> Cargando...</div>
                        ) : cafis.length === 0 ? (
                            <div className="p-16 text-center text-slate-500">No hay contratos CAFI registrados.</div>
                        ) : (
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-900/50 text-slate-400 uppercase text-xs">
                                    <tr>
                                        <th className="px-4 py-3 w-10"></th>
                                        <th className="px-4 py-3">Emisora</th>
                                        <th className="px-4 py-3">Cliente</th>
                                        <th className="px-4 py-3 text-center">Resumen de Archivos</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-700/50 text-slate-300">
                                    {groupedCafis.map(group => {
                                        const isExpanded = expandedCafiGroups[group.key];
                                        const countNotificaciones = group.items.filter((i: any) => i.ruta_notificacion).length;
                                        const countContratos = group.items.filter((i: any) => i.ruta_fisica).length;
                                        const countConvenios = group.items.filter((i: any) => i.ruta_convenio).length;
                                        const countMandatos = group.items.filter((i: any) => i.ruta_mandato).length;

                                        return (
                                            <React.Fragment key={group.key}>
                                                <tr className="hover:bg-slate-700/30 cursor-pointer transition-colors" onClick={() => toggleCafiGroup(group.key)}>
                                                    <td className="px-4 py-4 text-slate-500">
                                                        {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                                    </td>
                                                    <td className="px-4 py-4 font-bold text-white">{group.emisora}</td>
                                                    <td className="px-4 py-4 font-bold text-white">{group.cliente}</td>
                                                    <td className="px-4 py-4">
                                                        <div className="flex gap-2 justify-center text-xs font-medium">
                                                            <span className="flex items-center gap-1.5 bg-slate-800 text-slate-300 px-2.5 py-1.5 rounded-lg border border-slate-700">
                                                                <FileText size={14} className="text-emerald-400" /> {countNotificaciones} Notificaci{countNotificaciones === 1 ? 'ón' : 'ones'}
                                                            </span>
                                                            <span className="flex items-center gap-1.5 bg-slate-800 text-slate-300 px-2.5 py-1.5 rounded-lg border border-slate-700">
                                                                <FileText size={14} className="text-emerald-400" /> {countContratos} Contrato{countContratos === 1 ? '' : 's'}
                                                            </span>
                                                            <span className="flex items-center gap-1.5 bg-slate-800 text-slate-300 px-2.5 py-1.5 rounded-lg border border-slate-700">
                                                                <FileText size={14} className="text-emerald-400" /> {countConvenios} Convenio{countConvenios === 1 ? '' : 's'}
                                                            </span>
                                                            <span className="flex items-center gap-1.5 bg-slate-800 text-slate-300 px-2.5 py-1.5 rounded-lg border border-slate-700">
                                                                <FileText size={14} className="text-emerald-400" /> {countMandatos} Mandato{countMandatos === 1 ? '' : 's'}
                                                            </span>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {isExpanded && (
                                                    <tr>
                                                        <td colSpan={5} className="p-0 border-0 bg-slate-900/40">
                                                            <div className="p-4 pl-14 border-l-4 border-amber-500/50 space-y-3">
                                                                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Expedientes Internos CAFI</div>
                                                                <div className="overflow-hidden border border-slate-700/50 rounded-xl">
                                                                    <table className="w-full text-xs">
                                                                        <thead className="bg-slate-800/80 text-slate-400">
                                                                            <tr>
                                                                                <th className="px-4 py-2.5 text-left font-medium">ID / Estatus</th>
                                                                                <th className="px-4 py-2.5 text-center font-medium">Archivos Disponibles</th>
                                                                                <th className="px-4 py-2.5 text-center font-medium">Materialidad</th>
                                                                                <th className="px-4 py-2.5 text-right font-medium">Acciones</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="divide-y divide-slate-700/30">
                                                                            {group.items.map((c: any) => {
                                                                                const finalizado = c.ruta_fisica && c.ruta_notificacion && c.ruta_convenio;
                                                                                return (
                                                                                    <tr key={c.id} className="hover:bg-slate-800/50 transition-colors">
                                                                                        <td className="px-4 py-3">
                                                                                            <div className="font-mono text-slate-400 mb-1.5">ID: #{c.id}</div>
                                                                                            {finalizado ? (
                                                                                                <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center w-max gap-1 shadow-sm"><CheckCircle size={10} /> FINALIZADO</span>
                                                                                            ) : (
                                                                                                <span className="bg-amber-500/20 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center w-max gap-1 shadow-sm"><Clock size={10} /> INCOMPLETO</span>
                                                                                            )}
                                                                                        </td>
                                                                                        <td className="px-4 py-3 text-center">
                                                                                            <div className="flex gap-2 justify-center flex-wrap">
                                                                                                {c.ruta_notificacion ? (
                                                                                                    <button onClick={() => setCafiPreviewUrl(import.meta.env.VITE_API_URL + '/api/materialidad/cafis/' + c.id + '/view?tipo=notificacion&token=' + sessionStorage.getItem('token'))} className="flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-md text-[10px] hover:bg-emerald-500/20 transition shadow-sm" title="Ver Notificación">
                                                                                                        <FileText size={12} /> Notificación
                                                                                                    </button>
                                                                                                ) : (
                                                                                                    <button onClick={() => { setCafiForm({ emisora: c.emisora||'', cliente: c.cliente||'', fecha_creacion: '', fecha_vencimiento: '', cafi_id: c.id, tipo_archivo: 'notificacion' }); setShowCafiModal(true); }} className="flex items-center gap-1 bg-slate-700/50 text-slate-400 border border-slate-600 border-dashed px-2.5 py-1 rounded-md text-[10px] hover:text-white hover:border-slate-400 transition">
                                                                                                        <Upload size={12} /> Notificación
                                                                                                    </button>
                                                                                                )}
                                                                                                {c.ruta_fisica ? (
                                                                                                    <button onClick={() => setCafiPreviewUrl(import.meta.env.VITE_API_URL + '/api/materialidad/cafis/' + c.id + '/view?tipo=contrato&token=' + sessionStorage.getItem('token'))} className="flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-md text-[10px] hover:bg-emerald-500/20 transition shadow-sm" title="Ver Contrato">
                                                                                                        <FileText size={12} /> Contrato
                                                                                                    </button>
                                                                                                ) : (
                                                                                                    <button onClick={() => { setCafiForm({ emisora: c.emisora||'', cliente: c.cliente||'', fecha_creacion: '', fecha_vencimiento: '', cafi_id: c.id, tipo_archivo: 'contrato' }); setShowCafiModal(true); }} className="flex items-center gap-1 bg-slate-700/50 text-slate-400 border border-slate-600 border-dashed px-2.5 py-1 rounded-md text-[10px] hover:text-white hover:border-slate-400 transition">
                                                                                                        <Upload size={12} /> Contrato
                                                                                                    </button>
                                                                                                )}
                                                                                                {c.ruta_convenio ? (
                                                                                                    <button onClick={() => setCafiPreviewUrl(import.meta.env.VITE_API_URL + '/api/materialidad/cafis/' + c.id + '/view?tipo=convenio&token=' + sessionStorage.getItem('token'))} className="flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-md text-[10px] hover:bg-emerald-500/20 transition shadow-sm" title="Ver Convenio">
                                                                                                        <FileText size={12} /> Convenio
                                                                                                    </button>
                                                                                                ) : (
                                                                                                    <button onClick={() => { setCafiForm({ emisora: c.emisora||'', cliente: c.cliente||'', fecha_creacion: '', fecha_vencimiento: '', cafi_id: c.id, tipo_archivo: 'convenio' }); setShowCafiModal(true); }} className="flex items-center gap-1 bg-slate-700/50 text-slate-400 border border-slate-600 border-dashed px-2.5 py-1 rounded-md text-[10px] hover:text-white hover:border-slate-400 transition">
                                                                                                        <Upload size={12} /> Convenio
                                                                                                    </button>
                                                                                                )}
                                                                                                {c.ruta_mandato ? (
                                                                                                    <button onClick={() => setCafiPreviewUrl(import.meta.env.VITE_API_URL + '/api/materialidad/cafis/' + c.id + '/view?tipo=mandato&token=' + sessionStorage.getItem('token'))} className="flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-md text-[10px] hover:bg-emerald-500/20 transition shadow-sm" title="Ver Mandato">
                                                                                                        <FileText size={12} /> Mandato
                                                                                                    </button>
                                                                                                ) : (
                                                                                                    <button onClick={() => { setCafiForm({ emisora: c.emisora||'', cliente: c.cliente||'', fecha_creacion: '', fecha_vencimiento: '', cafi_id: c.id, tipo_archivo: 'mandato' as any }); setShowCafiModal(true); }} className="flex items-center gap-1 bg-slate-700/50 text-slate-400 border border-slate-600 border-dashed px-2.5 py-1 rounded-md text-[10px] hover:text-white hover:border-slate-400 transition">
                                                                                                        <Upload size={12} /> Mandato
                                                                                                    </button>
                                                                                                )}
                                                                                            </div>
                                                                                        </td>
                                                                                        <td className="px-4 py-3 text-center">
                                                                                            <div className="flex gap-1.5 justify-center flex-wrap">
                                                                                                {(['redaccion', 'notaria', 'firma'] as const).map(campo => {
                                                                                                    const val = c[`estatus_${campo}`] || 'pendiente';
                                                                                                    const s = ESTATUS_STYLES[val] || ESTATUS_STYLES.pendiente;
                                                                                                    const labels: Record<string, string> = { redaccion: '✍️ Redacción', notaria: '📜 Notaría', firma: '✒️ Firma' };
                                                                                                    return (
                                                                                                        <button key={campo} onClick={(e) => { e.stopPropagation(); handleCycleEstatus(c.id, campo, val); }}
                                                                                                            className={`flex items-center gap-1 ${s.bg} ${s.text} border px-2 py-1 rounded-md text-[10px] font-bold hover:opacity-80 transition-all cursor-pointer select-none`}
                                                                                                            title={`${labels[campo]}: ${s.label} — Click para cambiar`}
                                                                                                        >
                                                                                                            {labels[campo]}
                                                                                                            <span className="opacity-70 ml-0.5">·</span>
                                                                                                            <span className="font-semibold">{s.label}</span>
                                                                                                        </button>
                                                                                                    );
                                                                                                })}
                                                                                            </div>
                                                                                        </td>
                                                                                        <td className="px-4 py-3 text-right">
                                                                                            <button onClick={() => handleDeleteCafi(c.id)} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" title="Eliminar Expediente">
                                                                                                <Trash2 size={16} />
                                                                                            </button>
                                                                                        </td>
                                                                                    </tr>
                                                                                );
                                                                            })}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* Modal Subir CAFI */}
            {showCafiModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center p-5 border-b border-slate-700">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <Upload size={18} className="text-amber-400" /> Subir Contrato CAFI
                            </h3>
                            <button onClick={() => setShowCafiModal(false)} className="text-slate-400 hover:text-white">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleCafiSubmit} className="p-5 space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tipo de Archivo a Subir</label>
                                <select 
                                    value={cafiForm.tipo_archivo} 
                                    onChange={e => setCafiForm({...cafiForm, tipo_archivo: e.target.value as any})} 
                                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:border-amber-500 outline-none"
                                >
                                    <option value="notificacion">Notificación</option>
                                    <option value="contrato">Contrato CAFI</option>
                                    <option value="convenio">Convenio</option>
                                    <option value="mandato">Mandato (Opcional)</option>
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Emisora (Opcional)</label>
                                <select 
                                    value={cafiForm.emisora} 
                                    onChange={e => setCafiForm({...cafiForm, emisora: e.target.value})} 
                                    disabled={!!cafiForm.cafi_id}
                                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:border-amber-500 outline-none disabled:opacity-50"
                                >
                                    <option value="">-- Selecciona --</option>
                                    <option value="EXFIS">EXFIS</option>
                                    <option value="HOLDINGS">HOLDINGS</option>
                                    <option value="NAMUR MONS">NAMUR MONS</option>
                                </select>
                            </div>
                            
                            <div className="space-y-1 relative" ref={cafiClienteRef}>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cliente (Opcional)</label>
                                <input type="text" value={cafiForm.cliente} 
                                    onChange={e => {
                                        setCafiForm({...cafiForm, cliente: e.target.value});
                                        setCafiClienteOpen(true);
                                    }} 
                                    onFocus={() => {if (!cafiForm.cafi_id) setCafiClienteOpen(true)}}
                                    disabled={!!cafiForm.cafi_id}
                                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:border-amber-500 outline-none disabled:opacity-50" 
                                    placeholder="Escribe o selecciona un cliente..." 
                                />
                                {cafiClienteOpen && (
                                    <div className="absolute z-10 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                                        {clientesUnicos.filter(c => c.toLowerCase().includes(cafiForm.cliente.toLowerCase())).map((c, idx) => (
                                            <button key={idx} type="button" 
                                                onClick={() => { setCafiForm({...cafiForm, cliente: c}); setCafiClienteOpen(false); }}
                                                className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white border-b border-slate-700/50 last:border-0"
                                            >
                                                {c}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fecha Creación (Opcional)</label>
                                    <input type="date" value={cafiForm.fecha_creacion} onChange={e => setCafiForm({...cafiForm, fecha_creacion: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fecha Vencimiento (Opcional)</label>
                                    <input type="date" value={cafiForm.fecha_vencimiento} onChange={e => setCafiForm({...cafiForm, fecha_vencimiento: e.target.value})} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm" />
                                </div>
                            </div>

                            <div className="pt-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Archivo PDF (Requerido)</label>
                                <div 
                                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${cafiFile ? 'border-amber-500/50 bg-amber-500/5' : 'border-slate-600 hover:border-slate-500 bg-slate-900/40'}`}
                                    onClick={() => cafiFileInputRef.current?.click()}
                                >
                                    {cafiFile ? (
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="w-10 h-10 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center"><CheckCircle size={20} /></div>
                                            <div className="text-sm font-medium text-white break-all">{cafiFile.name}</div>
                                            <button type="button" onClick={(e) => { e.stopPropagation(); setCafiFile(null); if(cafiFileInputRef.current) cafiFileInputRef.current.value=''; }} className="text-xs text-red-400 hover:underline">Quitar archivo</button>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="w-10 h-10 bg-slate-800 text-slate-400 rounded-full flex items-center justify-center"><Upload size={20} /></div>
                                            <div className="text-sm font-medium text-slate-300">Click para seleccionar PDF</div>
                                        </div>
                                    )}
                                    <input type="file" ref={cafiFileInputRef} accept="application/pdf" className="hidden" onChange={e => setCafiFile(e.target.files?.[0] || null)} />
                                </div>
                            </div>

                            <div className="pt-4 flex justify-end gap-3">
                                <button type="button" onClick={() => setShowCafiModal(false)} className="px-4 py-2 text-slate-400 hover:text-white font-medium text-sm">Cancelar</button>
                                <button type="submit" disabled={loading || !cafiFile} className="bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-bold shadow-lg transition-colors flex items-center gap-2">
                                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} 
                                    Guardar CAFI
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Previsualización CAFI */}
            {cafiPreviewUrl && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-slate-800 rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center p-4 border-b border-slate-700 bg-slate-800/80">
                            <h3 className="font-bold text-white flex items-center gap-2">
                                <Eye size={18} className="text-amber-400" /> Previsualización de Contrato
                            </h3>
                            <button onClick={() => setCafiPreviewUrl(null)} className="p-1.5 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="flex-1 bg-slate-900 p-2">
                            <iframe src={cafiPreviewUrl} className="w-full h-full rounded-lg border border-slate-700" title="PDF Preview" />
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Tab: Cargar Documento ─── */}
            {activeTab === 'upload' && (
            <div className="space-y-6">

                {/* ── Empresa combobox ── */}
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Building2 size={14} /> Empresa
                    </label>
                    <div className="flex gap-2">
                        <div className="relative flex-1" ref={empresaRef}>
                            <button
                                type="button"
                                onClick={() => { setEmpresaOpen(o => !o); }}
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
                                            <input autoFocus type="text" value={empresaSearch}
                                                onChange={e => setEmpresaSearch(e.target.value)}
                                                placeholder="Buscar empresa o RFC..."
                                                className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-slate-500"
                                            />
                                        </div>
                                    </div>
                                    <div className="max-h-52 overflow-y-auto">
                                        {empresasFiltradas.length === 0
                                            ? <p className="text-slate-500 text-sm text-center py-4">Sin resultados</p>
                                            : empresasFiltradas.map(emp => (
                                                <button key={emp.id} type="button"
                                                    onClick={() => { setEmpresaId(emp.id); setEmpresaOpen(false); setEmpresaSearch(''); }}
                                                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-700 transition-colors flex items-center justify-between ${emp.id === empresaId ? 'bg-slate-700/60 text-white' : 'text-slate-300'}`}
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
                        <div className="flex gap-2">
                            <button onClick={() => setShowNewCompany(true)}
                                className="px-4 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 flex items-center gap-1.5 transition-colors text-sm font-medium shrink-0"
                                title="Agregar empresa"
                            ><Plus size={16} /> Nueva</button>
                            <button 
                                type="button"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteCompany(); }}
                                disabled={!empresaId || deletingCompany}
                                className="px-3 h-12 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                                title="Eliminar empresa seleccionada"
                            >
                                {deletingCompany ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── Tipo de Documento — tarjetas ── */}
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
                        Tipo de Documento
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {DOC_TYPES.map(tipo => {
                            const isSelected = tipoDoc === tipo.id;
                            return (
                                <button key={tipo.id} type="button" onClick={() => setTipoDoc(tipo.id)}
                                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all text-center ${
                                        isSelected
                                            ? `${tipo.bg} ${tipo.border} ring-1 ring-offset-1 ring-offset-slate-800 ring-emerald-500/40`
                                            : 'border-slate-700 bg-slate-900/50 hover:border-slate-600 hover:bg-slate-700/30'
                                    }`}
                                >
                                    <span className="text-2xl leading-none">{tipo.icon}</span>
                                    <span className={`text-xs font-semibold leading-tight ${isSelected ? tipo.color : 'text-slate-400'}`}>
                                        {tipo.shortLabel}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    {tipoActual && (
                        <p className="mt-2 text-xs text-slate-500 flex items-center gap-1.5">
                            <span className={tipoActual.color}>{tipoActual.icon}</span>
                            {tipoActual.description}
                        </p>
                    )}
                </div>

                {/* ── Drop zone + submit ── */}
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest">
                        Archivo PDF
                    </label>
                    <div
                        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                            dragover
                                ? 'border-emerald-500/60 bg-emerald-500/5 scale-[1.01]'
                                : archivo
                                ? 'border-emerald-500/40 bg-emerald-500/5'
                                : 'border-slate-600 hover:border-slate-500 bg-slate-900/40'
                        }`}
                        onDragOver={e => { e.preventDefault(); setDragover(true); }}
                        onDragLeave={() => setDragover(false)}
                        onDrop={handleDrop}
                        onClick={() => !archivo && fileInputRef.current?.click()}
                    >
                        {archivo ? (
                            <div className="flex flex-col items-center gap-2">
                                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                                    <FileText size={28} className="text-emerald-400" />
                                </div>
                                <div>
                                    <p className="text-white font-semibold text-sm truncate max-w-xs">{archivo.name}</p>
                                    <p className="text-emerald-400 text-xs mt-0.5">{(archivo.size / 1024).toFixed(1)} KB · PDF listo</p>
                                </div>
                                <button onClick={e => { e.stopPropagation(); setArchivo(null); }}
                                    className="flex items-center gap-1 text-slate-400 hover:text-red-400 text-xs transition-colors mt-1"
                                ><X size={12} /> Quitar archivo</button>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-2">
                                <div className="w-14 h-14 rounded-2xl bg-slate-700/50 border border-slate-600 flex items-center justify-center">
                                    <Upload size={28} className="text-slate-500" />
                                </div>
                                <p className="text-white font-semibold text-sm">Arrastra tu PDF aquí</p>
                                <p className="text-slate-500 text-xs">o haz clic para seleccionar</p>
                            </div>
                        )}
                        <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileSelect} className="hidden" />
                    </div>

                    {/* Alert */}
                    {alert && (
                        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${alert.type === 'success'
                            ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                            : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
                            {alert.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
                            {alert.message}
                        </div>
                    )}

                {/* ── Contrato de Seguimiento Legal (Solo si es Contrato Marco) ── */}
                {tipoDoc === 'CONTRATO_MARCO' && archivo && (
                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 border-l-4 border-l-indigo-500 shadow-inner">
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <FolderOpen size={14} className="text-indigo-400" /> Vincular a Seguimiento Legal (Opcional)
                        </label>
                        <p className="text-xs text-slate-500 mb-3">¡Paso final! Ingresa el nombre del cliente para buscar en Legal y establecer la relación (Emisora ↔ Cliente).</p>
                        <div className="relative flex-1" ref={contratoRef}>
                            {contratoActual ? (
                                <div className="flex items-center justify-between bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm">
                                    <span>
                                        <span className="font-semibold">{contratoActual.cliente}</span>
                                        <span className="text-slate-400 ml-2 font-mono text-xs">{contratoActual.tipo_contrato}</span>
                                    </span>
                                    <button type="button" onClick={() => { setContratoId(''); setContratoSearch(''); }} className="text-slate-400 hover:text-red-400" title="Quitar vinculación">
                                        <X size={16}/>
                                    </button>
                                </div>
                            ) : (
                                <div className="relative">
                                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input 
                                        type="text" 
                                        value={contratoSearch}
                                        onChange={e => { setContratoSearch(e.target.value); setContratoOpen(true); }}
                                        onFocus={() => { 
                                            setContratoOpen(true); 
                                            
                                        }}
                                        placeholder="Ingresa el nombre del cliente en Seguimiento Legal..."
                                        className="w-full bg-slate-900 border border-slate-700 hover:border-slate-500 text-white rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-slate-500 transition-colors"
                                    />
                                </div>
                            )}

                            {contratoOpen && !contratoActual && (
                                <div className="absolute z-30 w-full mt-1 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl overflow-hidden">
                                    <div className="max-h-52 overflow-y-auto">
                                        {contratosFiltrados.length === 0
                                            ? <p className="text-slate-500 text-sm text-center py-4">No se encontraron contratos con "{contratoSearch}"</p>
                                            : contratosFiltrados.map(c => (
                                                 <button key={c.id} type="button"
                                                    onClick={() => { setContratoId(c.id); setContratoOpen(false); }}
                                                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-700 transition-colors text-slate-300 border-b border-slate-700/50 last:border-0"
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <span className="font-semibold text-white block">#{c.id} — {c.cliente}</span>
                                                            <span className="text-indigo-400 text-xs font-medium">{c.tipo_contrato}</span>
                                                            {c.concepto && (
                                                                <span className="text-slate-400 text-xs block mt-0.5 truncate">{c.concepto}</span>
                                                            )}
                                                            {c.fecha_inicio && (
                                                                <span className="text-slate-500 text-[10px] block">
                                                                    {new Date(c.fecha_inicio).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })}
                                                                    {c.fecha_fin ? ` — ${new Date(c.fecha_fin).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })}` : ''}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {c.empresa_id && c.empresa_id === empresaId && (
                                                            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full uppercase font-bold shrink-0">Sugerido</span>
                                                        )}
                                                    </div>
                                                </button>
                                            ))
                                        }
                                    </div>
                                    
                                    {/* Opción de creación rápida si hay texto buscado */}
                                    {contratoSearch.length > 2 && (
                                        <div className="p-2 bg-slate-900/50 border-t border-slate-700">
                                            <button
                                                type="button"
                                                disabled={creandoContrato}
                                                onClick={(e) => { e.preventDefault(); handleCrearContratoRapido(); }}
                                                className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                                            >
                                                {creandoContrato ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plus size={14} />} 
                                                {creandoContrato ? 'CREANDO...' : `CREAR NUEVA LÍNEA RÁPIDA: "${contratoSearch.toUpperCase()}"`}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}



                    <button onClick={handleSubmit} disabled={!archivo || !empresaId || loading}
                        className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3.5 rounded-xl font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98]"
                    >
                        {loading
                            ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Guardando...</>
                            : <><Upload size={18} /> Guardar Documento{tipoActual ? ` · ${tipoActual.shortLabel}` : ''}</>
                        }
                    </button>
                </div>
            </div>
            )} {/* end tab upload */}



            {/* ─── Tab: Importación Masiva ─── */}
            {activeTab === 'lote' && (
                <div className="space-y-6">
                    <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-5">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <FolderOpen size={20} className="text-emerald-400" />
                            </div>
                            <div>
                                <h3 className="text-white font-semibold text-lg">Importación Masiva desde Carpeta</h3>
                                <p className="text-slate-400 text-sm mt-1">
                                    Ingresa la ruta de la carpeta en el servidor que contiene los PDFs de CSF y OP.
                                    El sistema detectará automáticamente la empresa, el tipo de documento y si la Opinión es{' '}
                                    <span className="text-emerald-400 font-medium">POSITIVA</span> o{' '}
                                    <span className="text-red-400 font-medium">NEGATIVA</span>.
                                </p>
                            </div>
                        </div>

                        <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 space-y-2">
                            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Formato esperado del nombre de archivo:</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
                                <span className="bg-slate-800 text-slate-300 px-3 py-1.5 rounded border border-slate-700">EMPRESA CSF ABRIL 2026.pdf</span>
                                <span className="bg-slate-800 text-slate-300 px-3 py-1.5 rounded border border-slate-700">EMPRESA OP ABRIL 2026.pdf</span>
                                <span className="bg-slate-800 text-emerald-400 px-3 py-1.5 rounded border border-slate-700">EMPRESA OP ABRIL 2026- POSITIVA.pdf</span>
                                <span className="bg-slate-800 text-red-400 px-3 py-1.5 rounded border border-slate-700">EMPRESA OP ABRIL 2026- NEGATIVA.pdf</span>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-300">Ruta de la carpeta en el servidor</label>
                            <input
                                type="text"
                                value={carpetaPath}
                                onChange={e => setCarpetaPath(e.target.value)}
                                placeholder={`\\\\serveri\\Compacw\\Documentos\\PORTAL_ERP\\app\\Bases_de_Datos\\CSF Y OP\\CSF Y OP ABRIL`}
                                className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-3 text-sm font-mono focus:outline-none focus:border-emerald-500 placeholder:text-slate-600"
                            />
                            <p className="text-xs text-slate-500">La ruta debe ser accesible desde el servidor donde corre el backend.</p>
                        </div>

                        <button
                            onClick={handleImportarLote}
                            disabled={!carpetaPath.trim() || loteLoading}
                            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white py-3.5 rounded-xl font-semibold text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
                        >
                            {loteLoading ? (
                                <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Importando archivos...</>
                            ) : (
                                <><Layers size={20} /> Iniciar Importación Masiva</>
                            )}
                        </button>
                    </div>

                    {/* Reporte de resultados */}
                    {loteReporte && !loteReporte.error && (
                        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-700 bg-slate-800/80 flex items-center justify-between flex-wrap gap-3">
                                <h3 className="text-white font-semibold">📋 Reporte de Importación</h3>
                                <div className="flex items-center gap-3 text-sm">
                                    <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                                        <CheckCircle size={15} /> {loteReporte.importados} importados
                                    </span>
                                    {loteReporte.errores > 0 && (
                                        <span className="flex items-center gap-1.5 text-red-400 font-medium">
                                            <XCircle size={15} /> {loteReporte.errores} errores
                                        </span>
                                    )}
                                    {loteReporte.sin_tipo_detectado > 0 && (
                                        <span className="flex items-center gap-1.5 text-yellow-400 font-medium">
                                            <AlertTriangle size={15} /> {loteReporte.sin_tipo_detectado} sin tipo
                                        </span>
                                    )}
                                    <span className="text-slate-400">/ {loteReporte.total_archivos} total</span>
                                </div>
                            </div>
                            <div className="overflow-x-auto max-h-96 overflow-y-auto">
                                <table className="w-full text-xs">
                                    <thead className="sticky top-0 bg-slate-800/95 border-b border-slate-700">
                                        <tr className="text-slate-400 uppercase tracking-wider">
                                            <th className="px-4 py-2.5 text-left">Archivo</th>
                                            <th className="px-4 py-2.5 text-left w-40">Empresa</th>
                                            <th className="px-4 py-2.5 text-center w-20">Tipo</th>
                                            <th className="px-4 py-2.5 text-center w-24">OP</th>
                                            <th className="px-4 py-2.5 text-left w-32">Resultado</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-700/40">
                                        {loteReporte.detalle?.map((item: any, i: number) => (
                                            <tr key={i} className={`hover:bg-slate-700/20 transition-colors ${
                                                item.resultado?.startsWith('✅') ? '' :
                                                item.resultado?.startsWith('⚠️') ? 'bg-yellow-500/5' : 'bg-red-500/5'
                                            }`}>
                                                <td className="px-4 py-2 text-slate-300 font-mono max-w-[200px] truncate" title={item.archivo}>{item.archivo}</td>
                                                <td className="px-4 py-2 text-slate-300 max-w-[140px] truncate" title={item.empresa}>{item.empresa}</td>
                                                <td className="px-4 py-2 text-center">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                                        item.tipo === 'OPINION_CUMPLIMIENTO'
                                                            ? 'bg-slate-600/20 text-slate-300'
                                                            : item.tipo === 'CONSTANCIA_SITUACION'
                                                            ? 'bg-purple-500/20 text-purple-400'
                                                            : 'bg-slate-700 text-slate-400'
                                                    }`}>
                                                        {item.tipo === 'OPINION_CUMPLIMIENTO' ? 'OP' :
                                                         item.tipo === 'CONSTANCIA_SITUACION' ? 'CSF' : item.tipo || '—'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2 text-center">
                                                    {item.op && item.op !== '—' ? (
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                                            item.op === 'POSITIVA'
                                                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                                                : 'bg-red-500/15 text-red-400 border-red-500/30'
                                                        }`}>{item.op}</span>
                                                    ) : <span className="text-slate-600">—</span>}
                                                </td>
                                                <td className="px-4 py-2 text-slate-400">{item.resultado}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {loteReporte?.error && (
                        <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                            <XCircle size={18} /> {loteReporte.error}
                        </div>
                    )}

                    {/* ── Sección: Corregir OPs existentes sin resultado ── */}
                    <div className="border-t border-slate-700/50 pt-5 space-y-3">
                        <div className="flex items-center justify-between flex-wrap gap-3">
                            <div>
                                <p className="text-sm font-medium text-slate-300">¿Ya importaste antes y salen sin resultado?</p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Este botón lee los PDFs ya almacenados y detecta automáticamente si son POSITIVA o NEGATIVA.
                                    No crea duplicados.
                                </p>
                            </div>
                            <button
                                onClick={handleCorregirOPs}
                                disabled={fixLoading}
                                className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 border border-slate-600 whitespace-nowrap"
                            >
                                {fixLoading ? (
                                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Corrigiendo...</>
                                ) : (
                                    <>🔄 Corregir OPs sin resultado</>
                                )}
                            </button>
                        </div>

                        {fixReporte && !fixReporte.error && (
                            <div className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm border ${
                                fixReporte.actualizados > 0
                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                    : 'bg-slate-700/50 border-slate-600 text-slate-400'
                            }`}>
                                <CheckCircle size={16} />
                                <span>
                                    <strong>{fixReporte.actualizados}</strong> registros actualizados
                                    {fixReporte.sin_resultado > 0 && <span className="text-yellow-400 ml-2">· {fixReporte.sin_resultado} sin resultado detectado</span>}
                                    {fixReporte.total_procesados === 0 && <span className="ml-1">— no había registros pendientes</span>}
                                </span>
                            </div>
                        )}
                        {fixReporte?.error && (
                            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                                <XCircle size={16} /> {fixReporte.error}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* New Company Modal */}
            {showNewCompany && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowNewCompany(false)}>
                    <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
                            <h3 className="text-lg font-semibold text-white">🏢 Nueva Empresa</h3>
                            <button onClick={() => setShowNewCompany(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">Razón Social</label>
                                <input
                                    type="text"
                                    value={newCompany.razon_social}
                                    onChange={e => setNewCompany({ ...newCompany, razon_social: e.target.value })}
                                    placeholder="Nombre de la empresa"
                                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-slate-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">RFC</label>
                                <input
                                    type="text"
                                    value={newCompany.rfc}
                                    onChange={e => setNewCompany({ ...newCompany, rfc: e.target.value.toUpperCase() })}
                                    placeholder="ABC010101AAA"
                                    maxLength={13}
                                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-slate-500 uppercase"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-700">
                            <button onClick={() => setShowNewCompany(false)} className="px-4 py-2 border border-slate-600 text-slate-300 rounded-lg text-sm hover:bg-slate-700">Cancelar</button>
                            <button onClick={handleCreateCompany} disabled={newCompanyLoading || !newCompany.razon_social || !newCompany.rfc} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-500 disabled:opacity-50">
                                {newCompanyLoading ? 'Creando...' : 'Crear Empresa'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
};

export default MaterialidadUpload;
