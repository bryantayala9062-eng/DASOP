import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/axios';
import Layout from '../../components/Layout';
import { ArrowLeft, Save, FileText } from 'lucide-react';

const ESTADOS_FLUJO = [
    { value: "hecho", label: "1. Redacción Legal" },
    { value: "jc_carlos", label: "2. Tránsito a Cliente" },
    { value: "cliente", label: "3. En Poder del Cliente" },
    { value: "recolector", label: "4. Recolección Cliente" },
    { value: "firmas", label: "5. Tránsito a Notaría" },
    { value: "notaria", label: "6. En Notaría" },
    { value: "optimal", label: "7. Finalizado" },
];

const STATIC_CONTRACT_TYPES = [
    'Prestación de Servicios', 'Confidencialidad (NDA)', 'Arrendamiento',
    'Compraventa', 'Laboral', 'Licenciamiento', 'Otro',
];

const LegalContractForm = () => {
    const navigate = useNavigate();

    const [formData, setFormData] = useState({
        cliente: '',
        representante_cliente: '',
        empresa: '',
        tipo_contrato: '',
        concepto: '',
        fecha_inicio: new Date().toISOString().split('T')[0],
        periodo: '1',
        clave_periodo: 'A',
        fecha_fin: '',
        estatus: 'hecho',
        responsable_interno: '',
        email_responsable: '',
        email_legal: '',
        declaraciones_cliente: '',
        representante_empresa: '',
    });

    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Auto-calculo de Fecha Fin básica si el usuario no la pone
    useEffect(() => {
        if (formData.fecha_inicio && formData.periodo && formData.clave_periodo && !formData.fecha_fin) {
            try {
                const date = new Date(formData.fecha_inicio);
                const p = parseInt(formData.periodo);
                if (!isNaN(p)) {
                    if (formData.clave_periodo === 'A') date.setFullYear(date.getFullYear() + p);
                    else if (formData.clave_periodo === 'M') date.setMonth(date.getMonth() + p);
                    else if (formData.clave_periodo === 'D') date.setDate(date.getDate() + p);
                    
                    setFormData(prev => ({ ...prev, fecha_fin: date.toISOString().split('T')[0] }));
                }
            } catch (e) {}
        }
    }, [formData.fecha_inicio, formData.periodo, formData.clave_periodo]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        setSubmitting(true);
        setError(null);
        try {
            const payload = { ...formData, gen_template: false };
            if (!payload.fecha_fin) delete (payload as any).fecha_fin;

            const res = await api.post('/api/legal/contratos', payload);
            const newContractId = res.data.id;

            if (selectedFile) {
                const fileData = new FormData();
                fileData.append('file', selectedFile);
                await api.post(`/api/legal/contratos/${newContractId}/archivo`, fileData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
            }

            setSuccess(true);
            setTimeout(() => navigate('/legal'), 1200);
        } catch (err: any) {
            setError('Error al registrar: ' + (err.response?.data?.detail || err.message));
            setSubmitting(false);
        }
    };

    return (
        <Layout>
            <div className="max-w-5xl mx-auto">
                <form onSubmit={handleSubmit} className="bg-slate-800 border border-slate-700 rounded-xl p-8 shadow-xl">
                    
                    {/* ENCABEZADO Y METADATOS SISTEMA */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-700 pb-6 mb-8 gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-slate-600/15 flex items-center justify-center">
                                <FileText className="text-slate-300" size={24} />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-white mb-1">Registro de Contrato</h2>
                                <p className="text-sm text-slate-400">Ingreso de nueva ficha en base de datos</p>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <div className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2">
                                <span className="block text-xs font-semibold text-slate-500">ID SISTEMA</span>
                                <span className="text-slate-300 font-mono">Auto-generado</span>
                            </div>
                            <div className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2">
                                <span className="block text-xs font-semibold text-slate-500">ÚLTIMA MODIFICACIÓN</span>
                                <span className="text-slate-300 font-mono">Automático</span>
                            </div>
                        </div>
                    </div>

                    {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-lg mb-6 flex items-center gap-2"><span>❌</span> {error}</div>}
                    {success && <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-3 rounded-lg mb-6 flex items-center gap-2"><span>✅</span> Registrado con éxito. Redirigiendo...</div>}

                    {/* SECCIÓN 1: DATOS PRINCIPALES */}
                    <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4 border-b border-slate-700/50 pb-2">Información de las Partes</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Cliente (Razón Social)</label>
                            <input type="text" name="cliente" value={formData.cliente} onChange={handleChange} required className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-2.5 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-400" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Representante Legal (Cliente)</label>
                            <input type="text" name="representante_cliente" value={formData.representante_cliente} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-2.5 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-400" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Empresa Emisora</label>
                            <input type="text" name="empresa" value={formData.empresa} onChange={handleChange} required placeholder="Ej. Comercializadora X" className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-2.5 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-400" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Tipo de Contrato</label>
                            <input type="text" name="tipo_contrato" list="lista-tipos" value={formData.tipo_contrato} onChange={handleChange} required placeholder="Ej. Prestación de Servicios" className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-2.5 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-400" />
                            <datalist id="lista-tipos">
                                {STATIC_CONTRACT_TYPES.map(t => <option key={t} value={t} />)}
                            </datalist>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-slate-300 mb-1">Concepto de Facturación / Contrato</label>
                            <input type="text" name="concepto" value={formData.concepto} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-2.5 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-400" />
                        </div>
                    </div>

                    {/* SECCIÓN 2: VIGENCIAS Y ESTADO */}
                    <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4 border-b border-slate-700/50 pb-2">Plazos y Estatus</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-8">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Fecha Inicio</label>
                            <input type="date" name="fecha_inicio" value={formData.fecha_inicio} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-2.5 text-sm focus:border-slate-500" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Periodo (No.)</label>
                            <input type="number" name="periodo" value={formData.periodo} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-2.5 text-sm focus:border-slate-500" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Clave Periodo</label>
                            <select name="clave_periodo" value={formData.clave_periodo} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-2.5 text-sm focus:border-slate-500">
                                <option value="A">Años (A)</option>
                                <option value="M">Meses (M)</option>
                                <option value="D">Días (D)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Fecha Fin (Vencimiento)</label>
                            <input type="date" name="fecha_fin" value={formData.fecha_fin} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-2.5 text-sm focus:border-slate-500" />
                        </div>
                        <div className="col-span-2 md:col-span-4 mt-2">
                            <label className="block text-sm font-medium text-slate-300 mb-1">Estado de Flujo Inicial</label>
                            <select name="estatus" value={formData.estatus} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-300 focus:border-slate-500 outline-none">
                                {ESTADOS_FLUJO.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* SECCIÓN 3: CONTROL INTERNO */}
                    <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4 border-b border-slate-700/50 pb-2">Asignación Interna</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Responsable Interno</label>
                            <input type="text" name="responsable_interno" value={formData.responsable_interno} onChange={handleChange} required className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-2.5 text-sm" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Email Responsable</label>
                            <input type="email" name="email_responsable" value={formData.email_responsable} onChange={handleChange} required className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-2.5 text-sm" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Email Legal (Opcional)</label>
                            <input type="email" name="email_legal" value={formData.email_legal} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-2.5 text-sm" />
                        </div>
                    </div>

                    {/* SECCIÓN 4: DOCUMENTO (OPCIONAL) */}
                    <div className="bg-slate-900 rounded-lg border border-slate-700 p-6 flex flex-col gap-5 mb-8">
                        <div className="flex items-center gap-4 border-b border-slate-800 pb-4">
                            <h3 className="text-sm font-bold text-white">Documento Adjunto <span className="text-slate-500 font-normal">(Opcional)</span></h3>
                        </div>

                        <div>
                            <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-white px-4 py-3 rounded-lg text-sm transition-colors border border-slate-600 flex items-center justify-center gap-2 border-dashed border-2">
                                <FileText size={18} className="text-slate-400" /> 
                                {selectedFile ? <span className="text-emerald-400 font-bold">{selectedFile.name}</span> : <span className="text-slate-300 font-semibold">SUBIR DOCUMENTO</span>}
                                <input type="file" className="hidden" accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => { setSelectedFile(e.target.files?.[0] || null); setError(null); }} />
                            </label>
                        </div>
                    </div>

                    {/* BOTONES */}
                    <div className="flex justify-between pt-8 border-t border-slate-700">
                        <button type="button" onClick={() => navigate('/legal')} className="flex items-center gap-2 px-5 py-2.5 border border-slate-600 text-slate-300 rounded-lg text-sm hover:bg-slate-700 transition-colors">
                            <ArrowLeft size={16} /> Regresar al Tablero
                        </button>
                        <button type="submit" disabled={submitting || success} className="flex items-center gap-2 px-8 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-bold transition-colors shadow-lg shadow-black/30 disabled:opacity-50 disabled:cursor-not-allowed">
                            <Save size={18} /> {submitting ? 'Guardando Registro...' : 'Guardar Expediente'}
                        </button>
                    </div>
                </form>
            </div>
        </Layout>
    );
};

export default LegalContractForm;
