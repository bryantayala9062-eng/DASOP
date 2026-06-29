/**
 * OPStatusBadge.tsx
 * ─────────────────
 * Badge reutilizable que muestra el estado de la Opinión de Cumplimiento
 * SAT de una empresa. Se auto-carga desde /api/materialidad/op-status.
 *
 * Uso:
 *   <OPStatusBadge companyName="EMPRESA ABC" />
 *   <OPStatusBadge companyName="EMPRESA ABC" size="lg" showPeriodo />
 */

import React, { useEffect, useState, useRef } from 'react';
import { api } from '../../api/axios';
import { ShieldCheck, ShieldX, ShieldAlert } from 'lucide-react';

interface OPStatus {
  status: 'POSITIVA' | 'NEGATIVA' | 'SIN_DOCUMENTO' | 'SIN_RESULTADO';
  fecha: string | null;
  doc_id: number | null;
  periodo: string | null;
}

interface OPStatusBadgeProps {
  companyName: string;
  size?: 'sm' | 'md' | 'lg';
  showPeriodo?: boolean;
  className?: string;
}

// Cache global para evitar re-fetches del mismo nombre en la misma sesión
const opCache = new Map<string, OPStatus>();

export const OPStatusBadge: React.FC<OPStatusBadgeProps> = ({
  companyName,
  size = 'md',
  showPeriodo = false,
  className = '',
}) => {
  const [status, setStatus] = useState<OPStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    setLoading(true);

    const cacheKey = companyName.toLowerCase().trim();

    if (opCache.has(cacheKey)) {
      setStatus(opCache.get(cacheKey)!);
      setLoading(false);
      return;
    }

    api
      .get<OPStatus>(`/api/materialidad/op-status?nombre=${encodeURIComponent(companyName)}`)
      .then((res) => {
        if (isMounted.current) {
          opCache.set(cacheKey, res.data);
          setStatus(res.data);
        }
      })
      .catch(() => {
        if (isMounted.current) {
          setStatus({ status: 'SIN_DOCUMENTO', fecha: null, doc_id: null, periodo: null });
        }
      })
      .finally(() => {
        if (isMounted.current) setLoading(false);
      });

    return () => {
      isMounted.current = false;
    };
  }, [companyName]);

  if (loading) {
    return (
      <span className={`inline-flex items-center gap-1 ${className}`}>
        <span className="w-2 h-2 rounded-full bg-slate-600 animate-pulse" />
        {size !== 'sm' && <span className="text-xs text-slate-500">OP...</span>}
      </span>
    );
  }

  if (!status) return null;

  // ── Config visual por estado ──────────────────────────────────────────────
  const config: Record<string, { icon: React.ReactNode; label: string; classes: string; dot: string }> = {
    POSITIVA: {
      icon: <ShieldCheck size={size === 'lg' ? 16 : 13} />,
      label: 'OP Positiva',
      classes: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
      dot: 'bg-emerald-400',
    },
    NEGATIVA: {
      icon: <ShieldX size={size === 'lg' ? 16 : 13} />,
      label: 'OP Negativa',
      classes: 'bg-red-500/15 text-red-400 border border-red-500/30 animate-[pulse_2s_ease-in-out_infinite]',
      dot: 'bg-red-500',
    },
    SIN_DOCUMENTO: {
      icon: <ShieldAlert size={size === 'lg' ? 16 : 13} />,
      label: 'Sin OP',
      classes: 'bg-slate-700/50 text-slate-400 border border-slate-600/50',
      dot: 'bg-slate-500',
    },
    SIN_RESULTADO: {
      icon: <ShieldAlert size={size === 'lg' ? 16 : 13} />,
      label: 'OP s/resultado',
      classes: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
      dot: 'bg-yellow-500',
    },
  };

  const cfg = config[status.status] ?? config['SIN_DOCUMENTO'];

  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0.5 gap-1',
    md: 'text-xs px-2 py-0.5 gap-1.5',
    lg: 'text-sm px-2.5 py-1 gap-1.5',
  }[size];

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${sizeClasses} ${cfg.classes} ${className}`}
      title={
        status.periodo
          ? `${cfg.label} · ${status.periodo}`
          : cfg.label
      }
    >
      {cfg.icon}
      {size !== 'sm' && <span>{cfg.label}</span>}
      {showPeriodo && status.periodo && (
        <span className="opacity-70 font-normal ml-0.5">· {status.periodo}</span>
      )}
    </span>
  );
};

/**
 * Función utilitaria para limpiar el cache (útil tras importación masiva)
 */
export const clearOPStatusCache = () => opCache.clear();

export default OPStatusBadge;
