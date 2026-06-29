export type PaymentStatusFilter = 'ALL' | 'PAGADO' | 'PENDIENTE' | 'PARCIAL';

export interface DashboardFilters {
  startDate?: string;
  endDate?: string;
  folio?: string;
  cliente?: string;
  empresa?: string;
  status?: PaymentStatusFilter;
  lens?: string;
  years?: string[];
}
