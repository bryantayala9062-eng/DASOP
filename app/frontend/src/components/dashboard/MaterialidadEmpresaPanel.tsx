import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../api/axios';
import { ShieldCheck, FileCheck, FileX, Download, ExternalLink, Eye, UploadCloud } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { OPStatusBadge } from './OPStatusBadge';
import { DOC_TYPES, getDocType } from '../../utils/docTypes';

interface DocumentExpediente {
  id: number;
  tipo_documento: string;
  fecha_subida: string;
  resultado_op?: string | null;
  periodo?: string | null;
}

interface EmpresaExpediente {
  empresa_id: number;
  razon_social: string;
  rfc: string;
  documentos: DocumentExpediente[];
}

interface MaterialidadEmpresaPanelProps {
  companyName: string;
  onTotalLoaded: (total: number, completed: number) => void;
  onOpenMaterialidad: (empresaId: number) => void;
}


export const MaterialidadEmpresaPanel: React.FC<MaterialidadEmpresaPanelProps> = ({ companyName, onTotalLoaded, onOpenMaterialidad }) => {
  const [data, setData] = useState<EmpresaExpediente | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedType, setSelectedType] = useState<string>('');

  const fetchExpediente = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/api/materialidad/empresa-expediente?nombre=${encodeURIComponent(companyName)}`);
      setData(res.data);
      
      // Calculate completion
      const uploadedTypes = new Set(res.data.documentos.map((d: any) => d.tipo_documento));
      const completed = DOC_TYPES.filter(t => uploadedTypes.has(t.id)).length;
      onTotalLoaded(DOC_TYPES.length, completed);
      
    } catch (err: any) {
      console.error("Error loading materialidad", err);
      setError("No se pudo cargar el expediente de materialidad.");
      onTotalLoaded(DOC_TYPES.length, 0);
    } finally {
      setLoading(false);
    }
  }, [companyName, onTotalLoaded]);

  useEffect(() => {
    fetchExpediente();
  }, [fetchExpediente]);

  const handleUploadClick = (tipo: string) => {
    setSelectedType(tipo);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedType) return;
    
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';

    setUploadingDoc(selectedType);
    
    const formData = new FormData();
    formData.append('archivo', file);
    formData.append('empresa_nombre', companyName);
    formData.append('tipo_documento', selectedType);

    try {
      await api.post('/api/materialidad/documentos/upload-by-nombre', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      // Recargar despues de subir
      fetchExpediente();
    } catch (err: any) {
      alert(`Error al subir el archivo: ${err.response?.data?.detail || err.message}`);
    } finally {
      setUploadingDoc(null);
      setSelectedType('');
    }
  };

  const handleDownload = async (docId: number, tipoStr: string) => {
    try {
      const response = await api.get(`/api/materialidad/documentos/download/${docId}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Doc_${tipoStr}_${docId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Error al descargar el documento.");
    }
  };

  const handleView = (docId: number) => {
    const backendUrl = api.defaults.baseURL || '';
    const url = `${backendUrl}/api/materialidad/documentos/view/${docId}`;
    window.open(url, '_blank');
  };

  if (loading) return (
    <div className="h-48 flex flex-col items-center justify-center gap-3 text-slate-500">
      <div className="animate-spin h-7 w-7 border-4 border-emerald-500 border-t-transparent rounded-full" />
      <span className="text-sm">Buscando expediente...</span>
    </div>
  );

  if (error) return (
    <div className="h-24 flex items-center justify-center text-red-400 bg-red-500/5 border border-red-500/20 rounded-xl text-sm px-4">
      {error}
    </div>
  );

  if (!data) return null;

  // Organizar documentos por tipo (mostrando solo el más reciente de cada tipo si hubiera varios)
  const docsByType = data.documentos.reduce((acc, doc) => {
    if (!acc[doc.tipo_documento] || new Date(doc.fecha_subida) > new Date(acc[doc.tipo_documento].fecha_subida)) {
      acc[doc.tipo_documento] = doc;
    }
    return acc;
  }, {} as Record<string, DocumentExpediente>);

  const completedCount = DOC_TYPES.filter(t => docsByType[t.id]).length;
  const progressPct = Math.round((completedCount / DOC_TYPES.length) * 100);

  return (
    <div className="space-y-4">
      {/* Input de archivo oculto */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept="application/pdf" 
        style={{ display: 'none' }} 
      />

      <div className="flex flex-wrap items-center justify-between bg-slate-800 border border-slate-700 p-4 rounded-xl gap-4">
        <div>
          <h3 className="text-white font-medium flex items-center gap-2">
            <ShieldCheck className="text-emerald-400" size={18} /> 
            Expediente de Materialidad Integral
          </h3>
          <p className="text-sm text-slate-400 mt-1">
            Archivos soporte para revisión de materialidad de operaciones (Art. 69-B).
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-slate-400 font-medium mb-1">{completedCount} de {DOC_TYPES.length} listos ({progressPct}%)</p>
            <div className="w-32 bg-slate-700 rounded-full h-1.5 overflow-hidden">
              <div 
                className={`h-full ${progressPct === 100 ? 'bg-emerald-500' : progressPct > 50 ? 'bg-amber-500' : 'bg-red-500'} transition-all`} 
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
          <button 
            onClick={() => onOpenMaterialidad(data.empresa_id)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-slate-300 hover:text-white hover:border-emerald-500/50 hover:bg-emerald-500/10 text-xs transition-colors"
          >
            <ExternalLink size={13} /> Ir a Materialidad
          </button>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 text-xs uppercase tracking-wider border-b border-slate-700 bg-slate-800/80">
              <th className="px-4 py-3 text-left">Documento Requerido</th>
              <th className="px-4 py-3 text-center w-24">Estado</th>
              <th className="px-4 py-3 text-center w-32">Fecha Subida</th>
              <th className="px-4 py-3 text-center w-40">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {DOC_TYPES.map((type) => {
              const doc = docsByType[type.id];
              const isUploading = uploadingDoc === type.id;
              return (
                <tr key={type.id} className="hover:bg-slate-700/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg leading-none">{type.icon}</span>
                      {doc ? <FileCheck className="text-emerald-400" size={14} /> : <FileX className="text-slate-600" size={14} />}
                      <span className={doc ? 'text-slate-200 font-medium' : 'text-slate-400'}>{type.label}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {doc ? (
                      type.id === 'OPINION_CUMPLIMIENTO' && doc.resultado_op ? (
                        // Badge especial para Opinión de Cumplimiento con resultado conocido
                        <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
                          doc.resultado_op === 'POSITIVA'
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                            : 'bg-red-500/15 text-red-400 border-red-500/30'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            doc.resultado_op === 'POSITIVA' ? 'bg-emerald-400' : 'bg-red-500 animate-pulse'
                          }`} />
                          {doc.resultado_op}
                          {doc.periodo && <span className="opacity-60 font-normal">· {doc.periodo}</span>}
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">Cargado</span>
                      )
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-400 font-medium">Faltante</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-slate-400 text-xs font-mono">
                    {doc ? doc.fecha_subida.substring(0, 10) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {doc ? (
                      <div className="flex items-center justify-center gap-1">
                        <button 
                          onClick={() => handleView(doc.id)}
                          className="px-2 py-1 bg-slate-700/50 hover:bg-slate-700 rounded text-slate-300 text-xs transition-colors flex items-center gap-1"
                          title="Ver en nueva pestaña"
                        >
                          <Eye size={12} /> Ver
                        </button>
                        <button 
                          onClick={() => handleDownload(doc.id, type.id)}
                          className="px-2 py-1 bg-slate-700/50 hover:bg-slate-700 rounded text-slate-300 transition-colors"
                          title="Descargar"
                        >
                          <Download size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleUploadClick(type.id)}
                        disabled={isUploading}
                        className="px-3 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-xs transition-colors flex items-center gap-1.5 mx-auto disabled:opacity-50"
                      >
                        {isUploading ? (
                          <span className="animate-spin h-3 w-3 border-2 border-emerald-400 border-t-transparent rounded-full" />
                        ) : (
                          <UploadCloud size={13} />
                        )}
                        {isUploading ? 'Subiendo...' : 'Subir'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
