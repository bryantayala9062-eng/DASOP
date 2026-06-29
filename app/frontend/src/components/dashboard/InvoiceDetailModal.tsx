import { api } from "../../api/axios";

import React, { useEffect, useState } from 'react';
import { X, FileText, ShoppingCart, CreditCard, AlertCircle, AlertTriangle } from 'lucide-react';
import { ExportButton } from './ExportButton';
import { formatCurrency } from '../../utils/formatters';

interface InvoiceDetailModalProps {
  identifier: string | null;   // UUID (preferred) or FOLIO
  folioLabel?: string | null;  // Display label for the header
  isOpen: boolean;
  onClose: () => void;
}

export const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({ identifier, folioLabel, isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'concepts' | 'payments'>('info');

  useEffect(() => {
    if (isOpen && identifier) {
      fetchDetail(identifier);
    } else {
      setData(null);
      setError(null);
    }
  }, [isOpen, identifier]);

  const fetchDetail = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/api/dashboard/invoices/${encodeURIComponent(id)}`);
      setData(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || "No se pudo cargar la factura");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Derive display folio from data or prop
  const displayFolio = data?.invoice?.['FOLIO'] || folioLabel || identifier;

  // Use recalculated values from backend when available
  const saldoPendiente = data?.invoice?.['_SALDO_CALCULADO'] ?? data?.invoice?.['SALDO PENDIENTE'] ?? 0;
  const totalPagadoReal = data?.invoice?.['_TOTAL_PAGADO_REAL'] ?? data?.invoice?.['TOTAL PAGADO'] ?? 0;
  const saldoExcel = data?.invoice?.['SALDO PENDIENTE'] ?? 0;
  const hasMismatch = data && Math.abs(saldoPendiente - saldoExcel) > 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-800 rounded-xl border border-dark-700 w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="p-4 border-b border-dark-700 flex justify-between items-center bg-dark-900/50 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-500/10 rounded-lg">
              <FileText className="text-brand-400" size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Factura {displayFolio}</h2>
              <p className="text-sm text-slate-400">Detalle completo y trazabilidad</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-dark-700 rounded-full text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="text-red-500 mb-2" size={48} />
              <p className="text-red-400 text-lg">{error}</p>
            </div>
          ) : data ? (
            <>
              {/* Status Banner */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="p-4 bg-dark-900 rounded-lg border border-dark-700">
                  <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Total Factura</p>
                  <p className="text-2xl font-bold text-white">{formatCurrency(data.invoice['TOTAL NETO'])}</p>
                </div>
                <div className="p-4 bg-dark-900 rounded-lg border border-dark-700">
                  <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Total Pagado</p>
                  <p className={`text-2xl font-bold ${totalPagadoReal > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {formatCurrency(totalPagadoReal)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">{data.payments.length} pago(s) registrado(s)</p>
                </div>
                <div className="p-4 bg-dark-900 rounded-lg border border-dark-700">
                  <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Saldo Pendiente</p>
                  <p className={`text-2xl font-bold ${saldoPendiente > 1 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {formatCurrency(saldoPendiente)}
                  </p>
                  {hasMismatch && (
                    <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
                      <AlertTriangle size={10} /> Excel: {formatCurrency(saldoExcel)}
                    </p>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-dark-700 mb-6">
                <button
                  onClick={() => setActiveTab('info')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'info' ? 'border-brand-500 text-brand-400' : 'border-transparent text-slate-400 hover:text-white'}`}
                >
                  <FileText size={16} /> Informacion General
                </button>
                <button
                  onClick={() => setActiveTab('concepts')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'concepts' ? 'border-brand-500 text-brand-400' : 'border-transparent text-slate-400 hover:text-white'}`}
                >
                  <ShoppingCart size={16} /> Conceptos ({data.concepts.length})
                </button>
                <button
                  onClick={() => setActiveTab('payments')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'payments' ? 'border-brand-500 text-brand-400' : 'border-transparent text-slate-400 hover:text-white'}`}
                >
                  <CreditCard size={16} /> Pagos Recibidos ({data.payments.length})
                </button>
              </div>

              {/* Tab Content */}
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                {activeTab === 'info' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8 text-sm">
                    <DetailRow label="UUID" value={data.invoice['UUID']} copyable />
                    <DetailRow label="Fecha Emision" value={data.invoice['FECHA']} />
                    <DetailRow label="Empresa Emisora" value={data.invoice['EMPRESA']} />
                    <DetailRow label="Cliente Receptor" value={data.invoice['CLIENTE']} />
                    <DetailRow label="RFC Emisor" value={data.invoice['RFC_EMISOR']} />
                    <DetailRow label="RFC Receptor" value={data.invoice['RFC_RECEPTOR'] || data.invoice['RFC RECEPTOR'] || data.invoice['RFC']} />
                    <DetailRow label="Metodo de Pago" value={`${data.invoice['METODO PAGO']} - ${data.invoice['FORMA PAGO']}`} />
                    <DetailRow label="Tipo Comprobante" value={data.invoice['TIPO'] || data.invoice['TIPO DE COMPROBANTE']} />
                    <DetailRow label="Moneda" value={data.invoice['MONEDA']} />
                    <DetailRow label="Estatus de Cobro" value={data.invoice['ESTATUS DE COBRO']} />
                    <div className="col-span-1 md:col-span-2 mt-4 pt-4 border-t border-dark-700">
                      <h4 className="font-semibold text-white mb-2">Desglose Fiscal</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <DetailRow label="Total Antes de IVA" value={formatCurrency(data.invoice['TOTAL ANTES DE IVA'])} />
                        <DetailRow label="Total Neto" value={formatCurrency(data.invoice['TOTAL NETO'])} highlight />
                        <DetailRow label="Total Pagado" value={formatCurrency(totalPagadoReal)} />
                        <DetailRow label="Saldo Pendiente" value={formatCurrency(saldoPendiente)} />
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'concepts' && (
                  <div>
                    <div className="flex justify-end mb-3">
                      <ExportButton data={data.concepts} filename={`Conceptos_${displayFolio}`} label="Exportar Conceptos" className="text-xs" />
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-dark-700">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-dark-900 text-slate-400 font-medium">
                          <tr>
                            <th className="px-4 py-3">Cantidad</th>
                            <th className="px-4 py-3">Clave Prod/Serv</th>
                            <th className="px-4 py-3">Descripcion</th>
                            <th className="px-4 py-3 text-right">Valor Unitario</th>
                            <th className="px-4 py-3 text-right">Importe</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-dark-700">
                          {data.concepts.map((c: any, i: number) => (
                            <tr key={i} className="hover:bg-dark-700/50">
                              <td className="px-4 py-3 text-slate-300">{c['CANTIDAD']}</td>
                              <td className="px-4 py-3 text-brand-400 font-mono text-xs">{c['CLAVE PROD/SERV']}</td>
                              <td className="px-4 py-3 text-slate-300 max-w-md truncate" title={c['DESCRIPCION']}>{c['DESCRIPCION']}</td>
                              <td className="px-4 py-3 text-slate-300 text-right">{formatCurrency(c['VALOR UNITARIO'])}</td>
                              <td className="px-4 py-3 text-white font-medium text-right">{formatCurrency(c['IMPORTE'])}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeTab === 'payments' && (
                  <div>
                    <div className="flex justify-end mb-3">
                      <ExportButton data={data.payments} filename={`Pagos_${displayFolio}`} label="Exportar Pagos" className="text-xs" />
                    </div>
                    {data.payments.length === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-slate-500">No se encontraron complementos de pago asociados.</p>
                        {data.invoice['METODO PAGO'] === 'PUE' && (
                          <p className="text-xs text-slate-600 mt-2">Metodo PUE: pago en una sola exhibicion (no genera complementos).</p>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="overflow-x-auto rounded-lg border border-dark-700">
                          <table className="w-full text-sm text-left">
                            <thead className="bg-dark-900 text-slate-400 font-medium">
                              <tr>
                                <th className="px-4 py-3">Fecha Pago</th>
                                <th className="px-4 py-3">Folio REP</th>
                                <th className="px-4 py-3 text-center">Parcialidad</th>
                                <th className="px-4 py-3 text-right">Monto Pagado</th>
                                <th className="px-4 py-3 text-right">Saldo Insoluto</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-dark-700">
                              {data.payments.map((p: any, i: number) => (
                                <tr key={i} className="hover:bg-dark-700/50">
                                  <td className="px-4 py-3 text-slate-300">{p['FECHA PAGO']?.substring(0, 10)}</td>
                                  <td className="px-4 py-3 text-slate-300">{p['FOLIO PAGO (REP)']}</td>
                                  <td className="px-4 py-3 text-center text-slate-400">{p['NUM PARCIALIDAD']}</td>
                                  <td className="px-4 py-3 text-emerald-400 font-medium text-right">{formatCurrency(p['IMPORTE PAGADO'])}</td>
                                  <td className="px-4 py-3 text-slate-300 text-right">{formatCurrency(p['SALDO INSOLUTO'])}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {/* Payment summary */}
                        <div className="mt-3 flex justify-end gap-6 text-sm border-t border-dark-700 pt-3">
                          <div className="text-right">
                            <span className="text-slate-500">Total Pagado: </span>
                            <span className="text-emerald-400 font-bold">{formatCurrency(totalPagadoReal)}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-slate-500">Saldo Restante: </span>
                            <span className={`font-bold ${saldoPendiente > 1 ? 'text-red-400' : 'text-emerald-400'}`}>{formatCurrency(saldoPendiente)}</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-dark-700 bg-dark-900/50 flex justify-end gap-3 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors">
            Cerrar
          </button>
          {data && (
            <ExportButton
              data={[data.invoice]}
              filename={`Factura_${displayFolio}_Full`}
              label="Exportar Todo"
            />
          )}
        </div>
      </div>
    </div>
  );
};

const DetailRow = ({ label, value, highlight, copyable }: { label: string, value: any, highlight?: boolean, copyable?: boolean }) => (
  <div>
    <p className="text-xs text-slate-500 mb-0.5">{label}</p>
    <p
      className={`font-medium truncate ${highlight ? 'text-brand-400 text-lg' : 'text-slate-200'} ${copyable ? 'cursor-pointer hover:text-white' : ''}`}
      onClick={() => copyable && value && navigator.clipboard.writeText(str(value))}
      title={copyable ? "Click para copiar" : undefined}
    >
      {value || '-'}
    </p>
  </div>
);

const str = (v: any) => (v === null || v === undefined) ? '' : String(v);
