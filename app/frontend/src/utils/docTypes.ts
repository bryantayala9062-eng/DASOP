// ⚠️ FUENTE ÚNICA DE VERDAD — IDs deben coincidir con el backend y MaterialidadEmpresaPanel.tsx
export interface DocTypeMeta {
  id: string;
  label: string;
  shortLabel: string;
  icon: string;        // emoji icon
  color: string;       // tailwind text color class
  bg: string;          // tailwind bg class
  border: string;      // tailwind border class
  description: string;
}

export const DOC_TYPES: DocTypeMeta[] = [
  {
    id: 'CONTRATO_MARCO',
    label: 'Contrato',
    shortLabel: 'Contrato',
    icon: '📄',
    color: 'text-emerald-300',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/25',
    description: 'Contrato vigente con la empresa',
  },
  {
    id: 'ACTA_CONSTITUTIVA',
    label: 'Acta Constitutiva',
    shortLabel: 'Acta',
    icon: '🏛️',
    color: 'text-amber-300',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/25',
    description: 'Acta de constitución de la sociedad',
  },
  {
    id: 'OPINION_CUMPLIMIENTO',
    label: 'Opinión de Cumplimiento SAT',
    shortLabel: 'OP SAT',
    icon: '✅',
    color: 'text-green-300',
    bg: 'bg-green-500/10',
    border: 'border-green-500/25',
    description: 'Opinión positiva/negativa del SAT',
  },
  {
    id: 'CONSTANCIA_SITUACION',
    label: 'Constancia de Situación Fiscal',
    shortLabel: 'CSF',
    icon: '📋',
    color: 'text-purple-300',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/25',
    description: 'Constancia fiscal vigente del SAT',
  },
  {
    id: 'PODER_NOTARIAL',
    label: 'Poder Notarial del Representante',
    shortLabel: 'Poder Notarial',
    icon: '⚖️',
    color: 'text-slate-300',
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/25',
    description: 'Poder del representante legal',
  },
  {
    id: 'ESTADO_CUENTA',
    label: 'Estado de Cuenta Bancario',
    shortLabel: 'Estado de Cuenta',
    icon: '🏦',
    color: 'text-cyan-300',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/25',
    description: 'Estado de cuenta bancario reciente',
  },
  {
    id: 'DECLARACION_ANUAL',
    label: 'Declaración Anual ISR',
    shortLabel: 'Declaración',
    icon: '📊',
    color: 'text-orange-300',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/25',
    description: 'Declaración anual de impuestos',
  },
  {
    id: 'OTRO',
    label: 'Otro Documento',
    shortLabel: 'Otro',
    icon: '📎',
    color: 'text-slate-400',
    bg: 'bg-slate-600/10',
    border: 'border-slate-600/25',
    description: 'Cualquier otro documento soporte',
  },
];

export const getDocType = (id: string): DocTypeMeta =>
  DOC_TYPES.find(d => d.id === id) ?? {
    id,
    label: id,
    shortLabel: id,
    icon: '📎',
    color: 'text-slate-400',
    bg: 'bg-slate-600/10',
    border: 'border-slate-600/25',
    description: '',
  };
