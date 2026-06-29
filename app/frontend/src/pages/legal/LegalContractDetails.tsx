import { useState, useEffect, useRef } from 'react';
import { api } from '../../api/axios';
import { X, Download, Upload, FileText } from 'lucide-react';

interface ContractData {
    id: number;
    cliente: string;
    tipo_contrato: string;
    responsable_interno: string;
    email_responsable: string;
    email_legal?: string;
    estatus: string;
    fecha_creacion: string;
    fecha_actualizacion: string;
    archivo_path?: string;
}

interface BitacoraItem {
    id: number;
    usuario_id: number | null;
    usuario_nombre: string;
    accion: string;
    detalles: string;
    fecha: string;
}

interface CommentItem {
    id: number;
    usuario_id: number;
    usuario_nombre: string;
    texto: string;
    fecha: string;
}

interface MaterialidadDoc {
    id: number;
    tipo_documento: string;
    fecha_subida: string;
    resultado_op: string | null;
    periodo: string | null;
}

const formatDate = (isoString: string) => {
    if (!isoString) return '-';
    // Si el string no tiene indicador de zona horaria, tratar como UTC
    const s = isoString.endsWith('Z') || isoString.includes('+') ? isoString : isoString + 'Z';
    return new Date(s).toLocaleString('es-MX', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
};

const LegalContractDetails = ({ 
    contract, 
    onClose,
    onDownload,
    onUpload
}: { 
    contract: ContractData; 
    onClose: () => void;
    onDownload?: () => void;
    onUpload?: () => void;
}) => {
    const [activeTab, setActiveTab] = useState<'info' | 'history' | 'comments'>('info');
    const [history, setHistory] = useState<BitacoraItem[]>([]);
    const [comments, setComments] = useState<CommentItem[]>([]);
    const [materialidadDocs, setMaterialidadDocs] = useState<MaterialidadDoc[]>([]);
    const [empresaId, setEmpresaId] = useState<number | null>(null);
    const [newComment, setNewComment] = useState('');
    const [loading, setLoading] = useState(false);
    const [noLegalAccess, setNoLegalAccess] = useState(false);
    const commentsEndRef = useRef<HTMLDivElement>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    useEffect(() => {
        if (activeTab === 'history') fetchHistory();
        if (activeTab === 'comments') fetchComments();
        if (activeTab === 'materialidad') fetchMaterialidad();
    }, [activeTab, contract.id]);

    // Cargar materialidad al montar para tener el PDF disponible en la tab Info
    useEffect(() => {
        fetchMaterialidad();
    }, [contract.id]);

    useEffect(() => {
        if (activeTab === 'comments') commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [comments, activeTab]);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const res = await api.get(`/api/legal/contratos/${contract.id}/bitacora`);
            setHistory(res.data);
            setNoLegalAccess(false);
        } catch (err: any) {
            if (err?.response?.status === 403 || err?.response?.status === 401) {
                setNoLegalAccess(true);
            } else {
                console.error(err);
            }
        }
        setLoading(false);
    };

    const fetchComments = async () => {
        setLoading(true);
        try {
            const res = await api.get(`/api/legal/contratos/${contract.id}/comentarios`);
            setComments(res.data);
            setNoLegalAccess(false);
        } catch (err: any) {
            if (err?.response?.status === 403 || err?.response?.status === 401) {
                setNoLegalAccess(true);
            } else {
                console.error(err);
            }
        }
        setLoading(false);
    };

    const fetchMaterialidad = async () => {
        setLoading(true);
        try {
            const res = await api.get(`/api/legal/contratos/${contract.id}/materialidad`);
            setMaterialidadDocs(res.data.documentos);
            setEmpresaId(res.data.empresa_id);
            setNoLegalAccess(false);
        } catch (err: any) {
            if (err?.response?.status === 403 || err?.response?.status === 401) {
                setNoLegalAccess(true);
            } else {
                console.error(err);
            }
        }
        setLoading(false);
    };

    const handleSendComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim()) return;
        try {
            await api.post(`/api/legal/contratos/${contract.id}/comentarios`, { texto: newComment });
            setNewComment('');
            fetchComments();
        } catch {
            alert('Error enviando comentario');
        }
    };

    const handleDownloadMat = async (docId: number) => {
        try {
            const res = await api.get(`/api/materialidad/documentos/download/${docId}`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Contrato_${contract.cliente.replace(/\s+/g, '_')}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            alert('Error al descargar PDF');
        }
    };

    const handlePreviewMat = async (docId: number) => {
        if (previewUrl) { setPreviewUrl(null); return; }
        setPreviewLoading(true);
        try {
            const res = await api.get(`/api/materialidad/documentos/view/${docId}`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            setPreviewUrl(url);
        } catch {
            alert('Error al cargar vista previa');
        } finally {
            setPreviewLoading(false);
        }
    };

    const handlePreviewLegal = async (contratoId: number) => {
        if (previewUrl) { setPreviewUrl(null); return; }
        setPreviewLoading(true);
        try {
            const res = await api.get(`/api/legal/contratos/${contratoId}/archivo`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            setPreviewUrl(url);
        } catch {
            alert('Error al cargar vista previa');
        } finally {
            setPreviewLoading(false);
        }
    };

    const tabs = [
        { key: 'info' as const, label: 'Información' },
        { key: 'history' as const, label: 'Historial' },
        { key: 'comments' as const, label: 'Comentarios' },
        { key: 'materialidad' as const, label: 'Expediente Materialidad' },
    ];

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-2xl shadow-2xl flex flex-col" style={{ height: '80vh' }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="px-6 pt-5 pb-2 flex items-start justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-white">📄 {contract.cliente}</h3>
                        <span className="text-sm text-slate-400">{contract.tipo_contrato} • #{contract.id}</span>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
                </div>

                {/* Tabs */}
                <div className="flex gap-6 px-6 border-b border-slate-700 mt-2">
                    {tabs.map(t => (
                        <button
                            key={t.key}
                            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === t.key ? 'border-slate-500 text-slate-300' : 'border-transparent text-slate-400 hover:text-white'}`}
                            onClick={() => setActiveTab(t.key)}
                        >{t.label}</button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto bg-slate-800/50">

                    {/* INFO Tab */}
                    {activeTab === 'info' && (
                        <div className="p-6 grid grid-cols-2 gap-5">
                            <div>
                                <label className="block text-xs uppercase text-slate-500 mb-1 tracking-wider">Estatus Actual</label>
                                <p className="text-white font-medium">{contract.estatus.replace(/_/g, ' ')}</p>
                            </div>
                            <div>
                                <label className="block text-xs uppercase text-slate-500 mb-1 tracking-wider">Responsable</label>
                                <p className="text-white font-medium">{contract.responsable_interno}</p>
                                <p className="text-xs text-slate-400 mt-1">Legal: {contract.email_legal || '—'}</p>
                                <p className="text-xs text-slate-400">Cliente: {contract.email_responsable}</p>
                            </div>
                            <div>
                                <label className="block text-xs uppercase text-slate-500 mb-1 tracking-wider">Fecha Creación</label>
                                <p className="text-slate-300 text-sm">{formatDate(contract.fecha_creacion)}</p>
                            </div>
                            <div>
                                <label className="block text-xs uppercase text-slate-500 mb-1 tracking-wider">Última Actualización</label>
                                <p className="text-slate-300 text-sm">{formatDate(contract.fecha_actualizacion)}</p>
                            </div>
                            <div className="col-span-2 mt-2">
                                <label className="block text-xs uppercase text-slate-500 mb-2 tracking-wider">Archivo Adjunto (PDF)</label>
                                {contract.archivo_path ? (
                                    <>
                                    <div className="bg-slate-900 border border-slate-700 p-4 rounded-xl flex items-center justify-between shadow-inner">
                                        <div className="flex items-center gap-3">
                                            <div className="bg-red-500/10 text-red-500 p-2 rounded-lg">
                                                <FileText size={20} />
                                            </div>
                                            <div>
                                                <p className="text-white text-sm font-medium">Documento Adjunto</p>
                                                <p className="text-slate-400 text-xs text-left">Formato PDF</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handlePreviewLegal(contract.id)}
                                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                                                    previewUrl
                                                        ? 'bg-slate-600 border-slate-500 text-slate-300 hover:bg-slate-500'
                                                        : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-700'
                                                }`}
                                            >
                                                {previewLoading
                                                    ? <span className="animate-spin text-xs">⏳</span>
                                                    : <FileText size={14} />}
                                                {previewUrl ? 'Cerrar' : 'Ver'}
                                            </button>
                                            {onDownload && (
                                                <button onClick={onDownload} className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
                                                    <Download size={14} /> Descargar
                                                </button>
                                            )}
                                            {onUpload && (
                                                <button onClick={onUpload} className="flex items-center gap-2 border border-slate-600 hover:border-slate-500 hover:text-slate-200 text-slate-300 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
                                                    <Upload size={14} /> Reemplazar
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {previewUrl && (
                                        <div className="mt-3 rounded-xl overflow-hidden border border-slate-600 shadow-lg">
                                            <iframe
                                                src={previewUrl}
                                                title="Vista previa PDF"
                                                className="w-full"
                                                style={{ height: '420px' }}
                                            />
                                        </div>
                                    )}
                                    </>
                                ) : (() => {
                                    // Buscar contrato PDF en materialidad como fallback
                                    const contratoMat = materialidadDocs.find(d => d.tipo_documento === 'CONTRATO_MARCO');
                                    return contratoMat ? (
                                        <>
                                        <div className="bg-indigo-500/5 border border-indigo-500/30 p-4 rounded-xl flex items-center justify-between shadow-inner">
                                            <div className="flex items-center gap-3">
                                                <div className="bg-indigo-500/10 text-indigo-400 p-2 rounded-lg">
                                                    <FileText size={20} />
                                                </div>
                                                <div>
                                                    <p className="text-white text-sm font-medium">Contrato PDF</p>
                                                    <p className="text-indigo-400 text-xs">📎 Desde Expediente Materialidad</p>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handlePreviewMat(contratoMat.id)}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                                                        previewUrl
                                                            ? 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                                                            : 'bg-indigo-500/10 border-indigo-500/40 text-indigo-400 hover:bg-indigo-500/20'
                                                    }`}
                                                >
                                                    {previewLoading
                                                        ? <span className="animate-spin text-xs">⏳</span>
                                                        : <FileText size={14} />}
                                                    {previewUrl ? 'Cerrar' : 'Ver'}
                                                </button>
                                                <button
                                                    onClick={() => handleDownloadMat(contratoMat.id)}
                                                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                                                >
                                                    <Download size={14} /> Descargar
                                                </button>
                                                {onUpload && (
                                                    <button onClick={onUpload} className="flex items-center gap-2 border border-slate-600 hover:border-slate-500 hover:text-slate-200 text-slate-300 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
                                                        <Upload size={14} /> Subir propio
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        {/* Vista previa embebida */}
                                        {previewUrl && (
                                            <div className="mt-3 rounded-xl overflow-hidden border border-indigo-500/20 shadow-lg">
                                                <iframe
                                                    src={previewUrl}
                                                    title="Vista previa PDF"
                                                    className="w-full"
                                                    style={{ height: '420px' }}
                                                />
                                            </div>
                                        )}
                                        </>
                                    ) : (
                                        <div className="bg-slate-900 border border-dashed border-slate-600 font-medium p-5 rounded-xl flex flex-col items-center justify-center text-center">
                                            <div className="text-slate-400 mb-2"><FileText size={32} /></div>
                                            <p className="text-slate-300 text-sm mb-1">No hay contrato en formato PDF</p>
                                            <p className="text-slate-500 text-xs mb-3">Sube la versión digital aquí</p>
                                            {onUpload && (
                                                <button onClick={onUpload} className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-black/30">
                                                    <Upload size={16} /> Subir PDF
                                                </button>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    )}

                    {/* HISTORY Tab */}
                    {activeTab === 'history' && (
                        <div className="p-6">
                            {noLegalAccess ? (
                                <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-500">
                                    <span className="text-2xl">🔒</span>
                                    <p className="text-sm text-center">Historial disponible solo para usuarios con acceso al módulo Legal.</p>
                                </div>
                            ) : loading ? (
                                <div className="text-center py-10 text-slate-400">Cargando...</div>
                            ) : history.length === 0 ? (
                                <p className="text-center py-10 text-slate-500">Sin actividad registrada</p>
                            ) : (
                                <div className="pl-3">
                                    {history.map((h, i) => (
                                        <div key={h.id} className={`relative pl-6 pb-6 ${i < history.length - 1 ? 'border-l-2 border-slate-700' : ''}`}>
                                            <div className="absolute left-[-5px] top-1 w-3 h-3 rounded-full bg-slate-600 border-2 border-slate-800" />
                                            <p className="text-sm text-white">{h.detalles}</p>
                                            <span className="text-xs text-slate-500">{h.usuario_nombre} • {formatDate(h.fecha)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* COMMENTS Tab */}
                    {activeTab === 'comments' && (
                        noLegalAccess ? (
                            <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-500">
                                <span className="text-2xl">🔒</span>
                                <p className="text-sm text-center">Comentarios disponibles solo para usuarios con acceso al módulo Legal.</p>
                            </div>
                        ) : (
                        <div className="flex flex-col h-full">
                            <div className="flex-1 overflow-y-auto p-5 space-y-3">
                                {loading && comments.length === 0 ? (
                                    <div className="text-center py-10 text-slate-400">Cargando...</div>
                                ) : comments.length === 0 ? (
                                    <div className="text-center py-10">
                                        <span className="text-3xl block mb-2">💬</span>
                                        <p className="text-slate-500">Sé el primero en comentar algo.</p>
                                    </div>
                                ) : (
                                    comments.map(c => (
                                        <div key={c.id} className="bg-slate-700/50 border border-slate-600/50 p-3 rounded-xl max-w-[85%]">
                                            <div className="flex items-center justify-between mb-1 text-xs text-slate-400">
                                                <strong className="text-slate-300">{c.usuario_nombre}</strong>
                                                <span>{formatDate(c.fecha)}</span>
                                            </div>
                                            <p className="text-sm text-slate-200">{c.texto}</p>
                                        </div>
                                    ))
                                )}
                                <div ref={commentsEndRef} />
                            </div>
                            <form onSubmit={handleSendComment} className="flex gap-3 p-4 border-t border-slate-700 bg-slate-800">
                                <input
                                    type="text"
                                    placeholder="Escribe un comentario..."
                                    value={newComment}
                                    onChange={e => setNewComment(e.target.value)}
                                    className="flex-1 bg-slate-900 border border-slate-700 text-white rounded-full px-4 py-2.5 text-sm focus:outline-none focus:border-slate-500"
                                />
                                <button
                                    type="submit"
                                    disabled={!newComment.trim()}
                                    className="px-5 py-2.5 bg-slate-700 text-white rounded-full text-sm font-medium disabled:bg-slate-600 disabled:cursor-not-allowed hover:bg-slate-600 transition-colors"
                                >Enviar</button>
                            </form>
                        </div>
                        )
                    )}

                    {/* MATERIALIDAD Tab */}
                    {activeTab === 'materialidad' && (
                        <div className="p-6">
                            {noLegalAccess ? (
                                <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-500">
                                    <span className="text-2xl">🔒</span>
                                    <p className="text-sm text-center">Sin acceso para ver información de materialidad.</p>
                                </div>
                            ) : loading ? (
                                <div className="text-center py-10 text-slate-400">Cargando expediente...</div>
                            ) : !empresaId ? (
                                <div className="bg-amber-500/10 border border-amber-500/20 p-5 rounded-xl text-center">
                                    <span className="text-3xl mb-2 block">⚠️</span>
                                    <p className="text-amber-400 font-medium mb-1">Empresa no vinculada</p>
                                    <p className="text-slate-400 text-sm">Este contrato no está asociado a ninguna empresa del directorio unificado de Materialidad.</p>
                                </div>
                            ) : materialidadDocs.length === 0 ? (
                                <div className="text-center py-10 text-slate-500">
                                    <span className="text-3xl mb-2 block">📂</span>
                                    <p>La empresa está vinculada, pero aún no tiene documentos en Materialidad.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between mb-4">
                                        <h4 className="text-white font-medium">Expediente Central de la Empresa</h4>
                                        <span className="text-xs bg-slate-700 text-slate-300 px-2.5 py-1 rounded-full">{materialidadDocs.length} documentos</span>
                                    </div>
                                    <div className="grid gap-2">
                                        {materialidadDocs.map(doc => (
                                            <div key={doc.id} className="flex items-center justify-between bg-slate-900 border border-slate-700 p-3 rounded-lg">
                                                <div className="flex items-center gap-3">
                                                    <div className="bg-slate-800 text-slate-400 p-2 rounded flex items-center justify-center">
                                                        <FileText size={16} />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm text-white font-medium">
                                                            {doc.tipo_documento.replace(/_/g, ' ')}
                                                        </p>
                                                        <p className="text-xs text-slate-500">
                                                            Subido el {formatDate(doc.fecha_subida)} {doc.periodo ? `• ${doc.periodo}` : ''}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {doc.resultado_op && (
                                                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${doc.resultado_op === 'POSITIVA' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                                                            {doc.resultado_op}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LegalContractDetails;
