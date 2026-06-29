import { api } from "../../api/axios";

import { useEffect, useState } from 'react';
import { ShieldAlert, AlertOctagon, Clock, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { InvoiceDetailModal } from './InvoiceDetailModal';

interface AuditRecord {
    UUID: string;
    FOLIO: string;
    FECHA: string;
    EMPRESA: string;
    CLIENTE: string;
    "TOTAL NETO": number;
    "SALDO PENDIENTE"?: number;
    "ESTATUS PROOVEDORES"?: string;
}

interface AuditData {
    count: number;
    total_amount: number;
    pending_amount?: number;
    records: AuditRecord[];
}

const AuditRiskPanel = () => {
    const [efosData, setEfosData] = useState<AuditData | null>(null);
    const [ppdData, setPpdData] = useState<AuditData | null>(null);
    const [loading, setLoading] = useState(true);
    const [expandedSection, setExpandedSection] = useState<string | null>(null);

    // Invoice Detail Modal State
    const [selectedFolio, setSelectedFolio] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleOpenInvoice = (folioOrUuid: string) => {
        if (!folioOrUuid) return;
        setSelectedFolio(folioOrUuid);
        setIsModalOpen(true);
    };

    useEffect(() => {

        Promise.all([
            api.get(`/api/dashboard/audit/efos-risks`).then(r => r.data),
            api.get(`/api/dashboard/audit/ppd-discrepancies`).then(r => r.data),
        ])
            .then(([efos, ppd]) => {
                setEfosData(efos);
                setPpdData(ppd);
                setLoading(false);
            })
            .catch(err => {
                console.error("Error loading audit data:", err);
                setLoading(false);
            });
    }, []);

    const formatRiskCurrency = (amount: number) => formatCurrency(amount, { minimumFractionDigits: 0 });

    const toggleSection = (section: string) => {
        setExpandedSection(expandedSection === section ? null : section);
    };

    if (loading) {
        return (
            <div className="card animate-pulse h-32 flex items-center justify-center text-slate-500">
                Analizando riesgos fiscales...
            </div>
        );
    }

    const sections = [

        {
            id: 'efos',
            title: 'Alertas EFOS (Lista Negra SAT)',
            icon: AlertOctagon,
            color: 'warning',
            bgColor: 'bg-warning/10',
            data: efosData,
            description: 'Clientes/Proveedores en listas de riesgo fiscal'
        },
        {
            id: 'ppd',
            title: 'PPD sin Complemento de Pago',
            icon: Clock,
            color: 'brand',
            bgColor: 'bg-brand-500/10',
            data: ppdData,
            description: 'Facturas PPD vencidas (>17 del mes siguiente sin REP)'
        }
    ];

    const totalRisks = (efosData?.count || 0) + (ppdData?.count || 0);

    return (
        <div className="card">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-danger/10 rounded-lg">
                    <ShieldAlert className="text-danger" size={24} />
                </div>
                <div className="flex-1">
                    <h3 className="font-bold text-white text-lg">Auditoría y Riesgo Fiscal</h3>
                    <p className="text-xs text-slate-500">
                        {totalRisks > 0
                            ? `${totalRisks} alertas detectadas`
                            : 'Sin alertas críticas'}
                    </p>
                </div>
                {totalRisks > 0 && (
                    <span className="px-3 py-1 bg-danger/20 text-danger text-sm font-bold rounded-full animate-pulse">
                        {totalRisks} Alertas
                    </span>
                )}
            </div>

            {/* Risk Sections */}
            <div className="space-y-4">
                {sections.map(section => {
                    const Icon = section.icon;
                    const isExpanded = expandedSection === section.id;
                    const count = section.data?.count || 0;
                    const amount = section.data?.total_amount || 0;

                    return (
                        <div key={section.id} className="border border-dark-700 rounded-lg overflow-hidden">
                            {/* Section Header */}
                            <div
                                className={`flex items-center gap-3 p-4 cursor-pointer select-none hover:bg-dark-700/30 transition-colors ${count > 0 ? section.bgColor : 'bg-dark-800/30'
                                    }`}
                                onClick={() => count > 0 && toggleSection(section.id)}
                            >
                                <div className={`p-2 rounded-lg ${section.bgColor}`}>
                                    <Icon className={`text-${section.color}`} size={18} />
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-semibold text-white text-sm">{section.title}</h4>
                                    <p className="text-xs text-slate-500">{section.description}</p>
                                </div>
                                <div className="text-right">
                                    {count > 0 ? (
                                        <>
                                            <p className={`text-lg font-bold text-${section.color}`}>{count}</p>
                                            <p className="text-xs text-slate-500">{formatRiskCurrency(amount)}</p>
                                        </>
                                    ) : (
                                        <span className="text-success text-sm font-medium">✓ Sin alertas</span>
                                    )}
                                </div>
                                {count > 0 && (
                                    <button className="p-1">
                                        {isExpanded ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                                    </button>
                                )}
                            </div>

                            {/* Expanded Table */}
                            {isExpanded && section.data && section.data.records.length > 0 && (
                                <div className="border-t border-dark-700 bg-dark-900/50 max-h-[300px] overflow-auto">
                                    <table className="w-full text-xs">
                                        <thead className="sticky top-0 bg-dark-800">
                                            <tr className="border-b border-dark-700 text-slate-400 uppercase tracking-wider">
                                                <th className="text-left py-2 px-3">Folio</th>
                                                <th className="text-left py-2 px-3">Fecha</th>
                                                <th className="text-left py-2 px-3">Empresa</th>
                                                <th className="text-left py-2 px-3">Cliente</th>
                                                <th className="text-right py-2 px-3">Monto</th>
                                                {section.id === 'efos' && <th className="text-left py-2 px-3">Estatus</th>}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {section.data.records.map((record, i) => (
                                                <tr key={i} className="border-b border-dark-700/50 hover:bg-dark-700/30">
                                                    <td className="py-2 px-3">
                                                        <button
                                                            onClick={() => handleOpenInvoice(record.UUID || record.FOLIO)}
                                                            className="flex items-center gap-1 text-brand-500 font-semibold hover:text-brand-400 hover:underline transition-colors"
                                                            title="Ver detalle de factura"
                                                        >
                                                            {record.FOLIO}
                                                            <ExternalLink size={10} />
                                                        </button>
                                                    </td>
                                                    <td className="py-2 px-3 text-slate-400">{formatDate(record.FECHA)}</td>
                                                    <td className="py-2 px-3 text-slate-200 max-w-[120px] truncate" title={record.EMPRESA}>{record.EMPRESA}</td>
                                                    <td className="py-2 px-3 text-slate-200 max-w-[120px] truncate" title={record.CLIENTE}>{record.CLIENTE}</td>
                                                    <td className="py-2 px-3 text-right text-danger font-semibold">{formatRiskCurrency(record["TOTAL NETO"])}
                                                    </td>
                                                    {section.id === 'efos' && (
                                                        <td className="py-2 px-3">
                                                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${record["ESTATUS PROOVEDORES"]?.toUpperCase().includes('DEFINITIVO')
                                                                    ? 'bg-danger/20 text-danger'
                                                                    : 'bg-warning/20 text-warning'
                                                                }`}>
                                                                {record["ESTATUS PROOVEDORES"] || 'Sin estatus'}
                                                            </span>
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <InvoiceDetailModal
                identifier={selectedFolio}
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
            />
        </div>
    );
};


export default AuditRiskPanel;
