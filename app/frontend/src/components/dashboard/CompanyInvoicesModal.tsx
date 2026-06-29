import React, { useState, useEffect, useCallback } from 'react';
import { X, Building2, Download, ExternalLink, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import InvoicesTable from './InvoicesTable';
import { api } from '../../api/axios';
import LegalContractDetails from '../../pages/legal/LegalContractDetails';
import { MaterialidadEmpresaPanel } from './MaterialidadEmpresaPanel';
import { OPStatusBadge } from './OPStatusBadge';
import type { DashboardFilters } from '../../types/filters';

// ─── Types ──────────────────────────────────────────────────────────────────
interface CompanyInvoicesModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyName: string;
  category: 'emisor' | 'receptor' | 'ambos';
  activeLens?: string;
  initialTab?: 'invoices' | 'contracts' | 'materialidad';
  baseFilters?: DashboardFilters;
}

interface ContractRow {
  id: number;
  cliente: string;
  empresa: string | null;
  tipo_contrato: string;
  responsable_interno: string;
  estatus: string;
  fecha_creacion: string;
  fecha_actualizacion: string;
  dias_en_estatus: number;
  archivo_path: string | null;
}

interface ContractsResponse {
  total: number;
  page: number;
  limit: number;
  items: ContractRow[];
}

interface ContractsTableProps {
  companyName: string;
  onOpenLegal: (id: number) => void;
  onTotalLoaded: (total: number) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ESTATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  '1_REDACCION_LEGAL':    { label: 'Redacción Legal',       dot: 'bg-red-400',    badge: 'bg-red-500/15 text-red-400 border-red-500/30' },
  '2_TRANSITO_A_CLIENTE': { label: 'En Tránsito → Cliente', dot: 'bg-orange-400', badge: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  '3_EN_PODER_CLIENTE':   { label: 'En Poder del Cliente',  dot: 'bg-yellow-400', badge: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30' },
  '4_RECOLECCION_CLIENTE':{ label: 'Recolección Pendiente', dot: 'bg-amber-400',  badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  '5_TRANSITO_A_NOTARIA': { label: 'En Tránsito → Notaría', dot: 'bg-slate-300',  badge: 'bg-slate-600/15 text-slate-300 border-slate-500/30' },
  '6_EN_NOTARIA':         { label: 'En Notaría',            dot: 'bg-slate-400', badge: 'bg-slate-600/15 text-slate-400 border-slate-600/30' },
  '7_RETORNO_A_OFICINA':  { label: 'Retorno a Oficina',     dot: 'bg-violet-400', badge: 'bg-violet-500/15 text-violet-400 border-violet-500/30' },
  '8_FINALIZADO':         { label: 'Finalizado',            dot: 'bg-emerald-400',badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
};

const getEstatusConfig = (estatus: string) =>
  ESTATUS_CONFIG[estatus] ?? { label: estatus, dot: 'bg-slate-400', badge: 'bg-slate-500/15 text-slate-400 border-slate-500/30' };

const PAGE_SIZE = 20;

// ─── ContractsTable ──────────────────────────────────────────────────────────
// Componente a nivel de módulo — evita que React lo desmonte/monte en cada
// re-render del padre (anti-patrón si se define dentro del cuerpo del render).
const ContractsTable: React.FC<ContractsTableProps> = ({ companyName, onOpenLegal, onTotalLoaded }) => {
  const [data, setData] = useState<ContractRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedContract, setSelectedContract] = useState<ContractRow | null>(null);

  const fetchContracts = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      // Búsqueda en AMBOS campos (empresa OR cliente) con un solo parámetro
      const params = new URLSearchParams({ nombre: companyName, page: String(p), limit: String(PAGE_SIZE) });
      const res = await api.get<ContractsResponse>(`/api/dashboard/contratos?${params}`);
      const payload = res.data;
      setData(Array.isArray(payload.items) ? payload.items : []);
      setTotal(payload.total ?? 0);
      onTotalLoaded(payload.total ?? 0);
    } catch (err: any) {
      console.error('Error loading contracts', err);
      setError(err?.response?.data?.detail || 'No se pudieron cargar los contratos.');
      onTotalLoaded(0);
    } finally {
      setLoading(false);
    }
  }, [companyName, onTotalLoaded]);

  useEffect(() => {
    setPage(1);
    fetchContracts(1);
  }, [companyName, fetchContracts]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchContracts(newPage);
  };

  const handleDownload = async (id: number, cliente: string) => {
    try {
      const response = await api.get(`/api/dashboard/contratos/${id}/archivo`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Contrato_${(cliente || '').replace(/\s+/g, '_')}_${id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Error al descargar el archivo del contrato.');
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (loading) return (
    <div className="h-48 flex flex-col items-center justify-center gap-3 text-slate-500">
      <div className="animate-spin h-7 w-7 border-4 border-slate-500 border-t-transparent rounded-full" />
      <span className="text-sm">Cargando contratos...</span>
    </div>
  );

  if (error) return (
    <div className="h-24 flex items-center justify-center text-red-400 bg-red-500/5 border border-red-500/20 rounded-xl text-sm px-4">
      {error}
    </div>
  );

  if (data.length === 0) return (
    <div className="h-40 flex flex-col items-center justify-center gap-2 text-slate-500 border border-dashed border-slate-700 rounded-xl">
      <FileText size={32} className="opacity-30" />
      <p className="text-sm">No se encontraron contratos asociados a esta empresa.</p>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 text-xs uppercase tracking-wider border-b border-slate-700 bg-slate-800/80">
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">Empresa</th>
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-left">Tipo</th>
                <th className="px-4 py-3 text-left">Estatus</th>
                <th className="px-4 py-3 text-center">Días</th>
                <th className="px-4 py-3 text-center">Responsable</th>
                <th className="px-4 py-3 text-center">Doc</th>
                <th className="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {data.map((row) => {
                const cfg = getEstatusConfig(row.estatus);
                const isPending = row.estatus !== '8_FINALIZADO';
                return (
                  <tr
                    key={row.id}
                    className={`transition-colors ${isPending ? 'hover:bg-slate-700/30' : 'hover:bg-slate-700/10 opacity-80'}`}
                  >
                    <td className="px-4 py-2.5 text-slate-300 font-semibold whitespace-nowrap">#{row.id}</td>
                    <td className="px-4 py-2.5 text-slate-300 max-w-[140px] truncate" title={row.empresa ?? ''}>{row.empresa || '—'}</td>
                    <td className="px-4 py-2.5 text-white font-medium max-w-[180px] truncate" title={row.cliente}>{row.cliente}</td>
                    <td className="px-4 py-2.5 text-slate-300 whitespace-nowrap">{row.tipo_contrato}</td>
                    <td className="px-4 py-2.5">
                      {/* Semáforo de colores por estatus */}
                      <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium whitespace-nowrap ${cfg.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} flex-shrink-0`} />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded font-mono ${row.dias_en_estatus > 5 ? 'bg-red-500/10 text-red-400' : 'bg-slate-700 text-slate-300'}`}>
                        {row.dias_en_estatus}d
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center text-slate-400 text-xs max-w-[110px] truncate" title={row.responsable_interno}>
                      {row.responsable_interno || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {row.archivo_path ? (
                        <button
                          onClick={() => handleDownload(row.id, row.cliente)}
                          className="text-slate-300 hover:text-slate-300 transition-colors p-1 rounded hover:bg-slate-600/10"
                          title="Descargar documento"
                        >
                          <Download size={14} />
                        </button>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setSelectedContract(row)}
                          className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-slate-300 text-xs hover:bg-slate-700 transition-colors"
                        >
                          Ver
                        </button>
                        <button
                          onClick={() => onOpenLegal(row.id)}
                          className="p-1 rounded bg-slate-900 border border-slate-700 text-slate-400 hover:text-slate-300 hover:border-slate-500/40 transition-colors"
                          title="Abrir en módulo Legal"
                        >
                          <ExternalLink size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
          <span>{total} contratos · Página {page} de {totalPages}</span>
          <div className="flex gap-1">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 1}
              className="p-1.5 rounded border border-slate-700 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages}
              className="p-1.5 rounded border border-slate-700 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Detalle overlay */}
      {selectedContract && (
        <LegalContractDetails
          contract={selectedContract}
          onClose={() => setSelectedContract(null)}
          onDownload={() => handleDownload(selectedContract.id, selectedContract.cliente)}
        />
      )}
    </div>
  );
};

// ─── Modal Principal ─────────────────────────────────────────────────────────
export const CompanyInvoicesModal: React.FC<CompanyInvoicesModalProps> = ({
  isOpen,
  onClose,
  companyName,
  category,
  activeLens,
  initialTab,
  baseFilters,
}) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'invoices' | 'contracts' | 'materialidad'>(initialTab ?? 'invoices');
  const [contractCount, setContractCount] = useState<number | null>(null);
  const [materialidadPct, setMaterialidadPct] = useState<string | null>(null);

  // Sincronizar tab cuando se abre desde otro nodo
  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
    setContractCount(null); // reset badge mientras carga
    setMaterialidadPct(null);
  }, [initialTab, companyName]);

  if (!isOpen) return null;

  // Filtros para InvoicesTable
  const modalFilters: DashboardFilters = { ...(baseFilters || {}) };
  if (category === 'emisor' || category === 'ambos') modalFilters.empresa = companyName;
  if (category === 'receptor') modalFilters.cliente = companyName;
  if (activeLens && activeLens !== 'total') modalFilters.lens = activeLens;

  const handleOpenLegal = (contractId: number) => {
    onClose();
    navigate(`/legal?contrato=${contractId}`);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 rounded-t-2xl sm:rounded-xl border border-slate-700 w-full sm:max-w-7xl max-h-[95vh] flex flex-col shadow-2xl">

        {/* ── Header ── */}
        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800 rounded-t-xl shrink-0 flex-wrap gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`p-2 rounded-lg flex-shrink-0 ${category === 'emisor' ? 'bg-slate-600/10' : 'bg-amber-500/10'}`}>
              <Building2 className={category === 'emisor' ? 'text-slate-300' : 'text-amber-400'} size={22} />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-white truncate flex items-center gap-2 flex-wrap" title={companyName}>
                {activeTab === 'invoices' ? 'Facturas' : activeTab === 'contracts' ? 'Contratos' : 'Materialidad'}: <span className="text-slate-300">{companyName}</span>
                {/* Badge OP: solo para emisores que son el foco de la vista */}
                {(category === 'emisor' || category === 'ambos') && (
                  <OPStatusBadge companyName={companyName} size="md" showPeriodo />
                )}
              </h2>
              <p className="text-xs text-slate-400 flex items-center gap-2 flex-wrap">
                Rol:
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  category === 'emisor'
                    ? 'bg-slate-600/20 text-slate-300 border border-slate-500/30'
                    : 'bg-amber-500/20 text-amber-500 border border-amber-500/30'
                }`}>
                  {category.toUpperCase()}
                </span>
                {activeLens && activeLens !== 'total' && (
                  <span className="text-slate-500">· Lens: {activeLens}</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Tab switcher con badge de contratos */}
            <div className="flex bg-slate-900/50 rounded-lg p-1 border border-slate-700">
              <button
                onClick={() => setActiveTab('invoices')}
                className={`px-3 py-1.5 text-sm rounded transition-colors ${activeTab === 'invoices' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              >
                Facturas
              </button>
              <button
                onClick={() => setActiveTab('contracts')}
                className={`px-3 py-1.5 text-sm rounded transition-colors flex items-center gap-1.5 ${activeTab === 'contracts' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              >
                Contratos
                {/* Badge con conteo — aparece cuando se cargan los datos */}
                {contractCount !== null && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                    activeTab === 'contracts'
                      ? 'bg-white/20 text-white'
                      : contractCount > 0
                        ? 'bg-slate-600/20 text-slate-300'
                        : 'bg-slate-700 text-slate-500'
                  }`}>
                    {contractCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('materialidad')}
                className={`px-3 py-1.5 text-sm rounded transition-colors flex items-center gap-1.5 ${activeTab === 'materialidad' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              >
                Materialidad
                {materialidadPct !== null && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                    activeTab === 'materialidad'
                      ? 'bg-white/20 text-white'
                      : 'bg-emerald-500/20 text-emerald-400'
                  }`}>
                    {materialidadPct}
                  </span>
                )}
              </button>
            </div>

            {/* Botón Ir al módulo Legal (solo visible en tab contratos) */}
            {activeTab === 'contracts' && (
              <button
                onClick={() => { onClose(); navigate('/legal'); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500/40 hover:bg-slate-600/10 text-xs transition-colors"
                title="Abrir módulo Legal completo"
              >
                <ExternalLink size={13} /> Módulo Legal
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-900">
          {activeTab === 'invoices' && (
            <div className="[&>div]:border-none [&>div]:bg-transparent [&>div]:p-0">
              <InvoicesTable filters={modalFilters} />
            </div>
          )}
          {activeTab === 'contracts' && (
            <ContractsTable
              companyName={companyName}
              onOpenLegal={handleOpenLegal}
              onTotalLoaded={setContractCount}
            />
          )}
          {activeTab === 'materialidad' && (
            <MaterialidadEmpresaPanel
              companyName={companyName}
              onTotalLoaded={(total, completed) => setMaterialidadPct(`${completed}/${total}`)}
              onOpenMaterialidad={(id) => { onClose(); navigate('/materialidad'); }}
            />
          )}
        </div>
      </div>
    </div>
  );
};
