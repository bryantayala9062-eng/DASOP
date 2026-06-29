import { useState } from 'react';
import { X, Loader2, FileText, CheckCircle2, AlertTriangle, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../../api/axios';

interface ConceptData {
    descripcion: string;
    monto: number;
    porcentaje: number;
    clave_sat?: string;
}

interface InvoiceData {
    uuid: string;
    folio: string;
    fecha: string;
    cliente: string;
    monto: number;
}

interface ConceptInvoice {
    uuid: string;
    folio: string;
    fecha: string;
    cliente: string;
    rfc_cliente: string;
    descripcion: string;
    cantidad: number;
    precio_unitario: number;
    importe: number;
}

interface DrilldownData {
    top_concepts: ConceptData[];
    top_invoices: InvoiceData[];
}

interface ProductServiceDrilldownModalProps {
    isOpen: boolean;
    onClose: () => void;
    tipo: string;
    data: DrilldownData | null;
    isLoading: boolean;
    formatCurrency: (amount: number) => string;
}

/* ── Expandable row for the concept invoice table ── */
function ExpandableInvoiceRow({
    inv,
    formatCurrency,
}: {
    inv: ConceptInvoice;
    formatCurrency: (amount: number) => string;
}) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <tr
                onClick={() => setOpen(!open)}
                className="hover:bg-slate-800/50 transition-colors cursor-pointer"
            >
                <td className="px-3 py-2 text-white font-medium whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                        {open ? <ChevronUp size={12} className="text-slate-500" /> : <ChevronDown size={12} className="text-slate-500" />}
                        {inv.folio || '—'}
                    </div>
                </td>
                <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{inv.fecha}</td>
                <td className="px-3 py-2 text-white truncate max-w-[150px]" title={inv.cliente}>
                    {inv.cliente}
                </td>
                <td className="px-3 py-2 text-right text-slate-300">{inv.cantidad}</td>
                <td className="px-3 py-2 text-right text-slate-300">{formatCurrency(inv.precio_unitario)}</td>
                <td className="px-3 py-2 text-right font-semibold text-white">{formatCurrency(inv.importe)}</td>
            </tr>
            {open && (
                <tr className="bg-slate-900/60">
                    <td colSpan={6} className="px-4 py-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                            <div>
                                <span className="text-slate-500 block mb-0.5">UUID</span>
                                <span className="text-slate-300 font-mono break-all">{inv.uuid}</span>
                            </div>
                            <div>
                                <span className="text-slate-500 block mb-0.5">RFC Cliente</span>
                                <span className="text-slate-300 font-mono">{inv.rfc_cliente || '—'}</span>
                            </div>
                            <div>
                                <span className="text-slate-500 block mb-0.5">Descripción</span>
                                <span className="text-slate-300">{inv.descripcion}</span>
                            </div>
                            <div>
                                <span className="text-slate-500 block mb-0.5">Folio</span>
                                <span className="text-slate-300 font-medium">{inv.folio || '—'}</span>
                            </div>
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}

/* ── Expandable concept card ── */
function ExpandableConceptCard({
    concept,
    idx,
    tipo,
    formatCurrency,
}: {
    concept: ConceptData;
    idx: number;
    tipo: string;
    formatCurrency: (amount: number) => string;
}) {
    const [expanded, setExpanded] = useState(false);
    const [invoices, setInvoices] = useState<ConceptInvoice[]>([]);
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const handleToggle = async () => {
        if (expanded) {
            setExpanded(false);
            return;
        }
        setExpanded(true);
        if (loaded) return;

        setLoading(true);
        try {
            const res = await api.post('/api/dashboard/analytics/concept-invoices', {
                tipo,
                descripcion: concept.descripcion,
                clave_sat: concept.clave_sat
            });
            setInvoices(res.data.invoices || []);
            setLoaded(true);
        } catch (err) {
            console.error('Error fetching concept invoices', err);
        } finally {
            setLoading(false);
        }
    };

    const colorClass = tipo === 'Servicio' ? 'bg-slate-600' : tipo === 'Producto' ? 'bg-emerald-500' : 'bg-purple-500';
    const borderHover = tipo === 'Servicio' ? 'hover:border-slate-500/40' : tipo === 'Producto' ? 'hover:border-emerald-500/40' : 'hover:border-purple-500/40';

    return (
        <div className={`bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-hidden transition-all ${borderHover} ${expanded ? 'col-span-1 md:col-span-2' : ''}`}>
            <button
                onClick={handleToggle}
                className="w-full p-4 flex gap-4 items-center text-left group cursor-pointer hover:bg-slate-800/80 transition-colors"
            >
                <span className="text-xs font-bold text-slate-500 w-6 flex-shrink-0">#{idx + 1}</span>
                <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 font-medium truncate" title={concept.descripcion}>
                        {concept.descripcion || '(Sin descripción)'}
                    </p>
                    <div className="flex justify-between items-center mt-2">
                        <span className="text-xs font-semibold text-slate-400 bg-slate-900 px-2 py-1 rounded">
                            {concept.porcentaje}%
                        </span>
                        <span className="text-sm font-bold text-white">
                            {formatCurrency(concept.monto)}
                        </span>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-1.5 mt-2">
                        <div
                            className={`h-1.5 rounded-full ${colorClass}`}
                            style={{ width: `${Math.min(100, concept.porcentaje)}%` }}
                        ></div>
                    </div>
                </div>
                <div className="flex-shrink-0 text-slate-400 group-hover:text-white transition-colors">
                    {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
            </button>

            {expanded && (
                <div className="border-t border-slate-700/50 bg-slate-900/40">
                    {loading ? (
                        <div className="flex items-center justify-center py-6 gap-2">
                            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                            <span className="text-sm text-slate-400">Cargando líneas de factura...</span>
                        </div>
                    ) : invoices.length === 0 ? (
                        <div className="text-center py-6 text-slate-500 text-sm">
                            No se encontraron líneas detalladas para este concepto.
                        </div>
                    ) : (
                        <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-slate-900/80 sticky top-0 text-slate-400 border-b border-slate-700">
                                    <tr>
                                        <th className="px-3 py-2 font-medium">Folio</th>
                                        <th className="px-3 py-2 font-medium">Fecha</th>
                                        <th className="px-3 py-2 font-medium">Cliente</th>
                                        <th className="px-3 py-2 font-medium text-right">Cant.</th>
                                        <th className="px-3 py-2 font-medium text-right">P. Unit.</th>
                                        <th className="px-3 py-2 font-medium text-right">Importe</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-700/30">
                                    {invoices.map((inv, i) => (
                                        <ExpandableInvoiceRow key={i} inv={inv} formatCurrency={formatCurrency} />
                                    ))}
                                </tbody>
                            </table>
                            <div className="px-3 py-2 text-xs text-slate-500 bg-slate-900/60 border-t border-slate-700/50">
                                Mostrando {invoices.length} líneas · Clic en una fila para ver UUID y RFC
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/* ── Expandable row for top invoices table ── */
function ExpandableTopInvoiceRow({
    inv,
    formatCurrency,
}: {
    inv: InvoiceData;
    formatCurrency: (amount: number) => string;
}) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <tr
                onClick={() => setOpen(!open)}
                className="hover:bg-slate-700/30 transition-colors cursor-pointer"
            >
                <td className="px-4 py-3 text-white font-medium whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                        {open ? <ChevronUp size={12} className="text-slate-500" /> : <ChevronDown size={12} className="text-slate-500" />}
                        {inv.folio || '—'}
                    </div>
                </td>
                <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{inv.fecha}</td>
                <td className="px-4 py-3 text-white font-medium truncate max-w-[200px]" title={inv.cliente}>
                    {inv.cliente}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-white whitespace-nowrap">
                    {formatCurrency(inv.monto)}
                </td>
            </tr>
            {open && (
                <tr className="bg-slate-900/60">
                    <td colSpan={4} className="px-5 py-3">
                        <div className="grid grid-cols-2 gap-3 text-xs">
                            <div>
                                <span className="text-slate-500 block mb-0.5">UUID</span>
                                <span className="text-slate-300 font-mono break-all">{inv.uuid}</span>
                            </div>
                            <div>
                                <span className="text-slate-500 block mb-0.5">Folio Completo</span>
                                <span className="text-slate-300 font-medium">{inv.folio || '—'}</span>
                            </div>
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}

/* ── Main Modal ── */
export function ProductServiceDrilldownModal({
    isOpen,
    onClose,
    tipo,
    data,
    isLoading,
    formatCurrency
}: ProductServiceDrilldownModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-slate-900 w-full max-w-5xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-700 animate-in fade-in zoom-in duration-200">

                {/* Header */}
                <div className="flex justify-between items-center p-5 border-b border-slate-800 bg-slate-800/50">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${tipo === 'Servicio' ? 'bg-slate-600/20 text-slate-300' : tipo === 'Producto' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-purple-500/20 text-purple-400'}`}>
                            <FileText className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">
                                Desglose de {tipo === 'Mixta' ? 'Facturas Mixtas' : tipo + 's'}
                            </h2>
                            <p className="text-sm text-slate-400">Haz clic en un concepto para ver sus facturas · Clic en fila para expandir</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-900/50">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <Loader2 className="w-10 h-10 animate-spin text-slate-400 mb-4" />
                            <p className="text-slate-400">Analizando conceptos y facturas...</p>
                        </div>
                    ) : !data || (data.top_concepts.length === 0 && data.top_invoices.length === 0) ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <Info className="w-12 h-12 text-slate-500 mb-4 opacity-50" />
                            <h3 className="text-lg font-medium text-slate-300">Sin detalles disponibles</h3>
                            <p className="text-sm text-slate-500 mt-1 max-w-md">No se encontraron conceptos agrupables para esta categoría.</p>
                        </div>
                    ) : (
                        <div className="space-y-8">

                            {/* Top Concepts Section */}
                            <section>
                                <div className="flex items-center gap-2 mb-4">
                                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                    <h3 className="text-lg font-semibold text-white">Top 20 Conceptos Facturados</h3>
                                    <span className="text-xs text-slate-500 ml-2">(clic para expandir)</span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {data.top_concepts.map((concept, idx) => (
                                        <ExpandableConceptCard
                                            key={idx}
                                            concept={concept}
                                            idx={idx}
                                            tipo={tipo}
                                            formatCurrency={formatCurrency}
                                        />
                                    ))}
                                </div>
                            </section>

                            {/* Top Invoices Section */}
                            <section>
                                <div className="flex items-center gap-2 mb-4">
                                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                                    <h3 className="text-lg font-semibold text-white">Top 50 Facturas ({tipo}s)</h3>
                                    <span className="text-xs text-slate-500 ml-2">(clic en fila para ver UUID)</span>
                                </div>

                                <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-slate-900/50 text-slate-400 border-b border-slate-700">
                                                <tr>
                                                    <th className="px-4 py-3 font-medium">Folio</th>
                                                    <th className="px-4 py-3 font-medium">Fecha</th>
                                                    <th className="px-4 py-3 font-medium">Cliente</th>
                                                    <th className="px-4 py-3 font-medium text-right">Monto</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-700/50">
                                                {data.top_invoices.map((inv, idx) => (
                                                    <ExpandableTopInvoiceRow key={idx} inv={inv} formatCurrency={formatCurrency} />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </section>

                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
