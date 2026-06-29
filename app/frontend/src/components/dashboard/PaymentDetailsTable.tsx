import { api } from "../../api/axios";

import { useEffect, useState } from 'react';
import { CreditCard, FileText } from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface Payment {
    UUID: string;
    FOLIO: string;
    CLIENTE: string;
    "FECHA PAGO": string;
    "MONTO PAGADO": number;
    "FORMA PAGO": string;
}

const PaymentDetailsTable = () => {
    const [data, setData] = useState<Payment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        api.get(`/api/dashboard/analytics/payments`)
            .then(res => res)
            .then(result => {
                // Handle both array and object with data property
                const arr = Array.isArray(result) ? result : (result.data || []);
                setData(arr);
                setLoading(false);
            })
            .catch(err => {
                console.error("Error loading payments:", err);
                setError("No se pudo cargar los complementos de pago.");
                setLoading(false);
            });
    }, []);

    if (loading) {
        return (
            <div className="card animate-pulse h-64 flex items-center justify-center text-slate-500">
                Cargando complementos de pago...
            </div>
        );
    }

    if (error) {
        return (
            <div className="card h-64 flex items-center justify-center text-danger">
                {error}
            </div>
        );
    }

    return (
        <div className="card">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-success/10 rounded-lg">
                    <CreditCard className="text-success" size={20} />
                </div>
                <div>
                    <h3 className="font-bold text-white">Últimos Complementos de Pago</h3>
                    <p className="text-xs text-slate-500">{data.length} registros más recientes</p>
                </div>
            </div>

            <div className="overflow-x-auto max-h-[400px]">
                <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-dark-800">
                        <tr className="border-b border-dark-700 text-slate-400 text-xs uppercase tracking-wider">
                            <th className="text-left py-3 px-2">Folio</th>
                            <th className="text-left py-3 px-2">Cliente</th>
                            <th className="text-left py-3 px-2">Fecha Pago</th>
                            <th className="text-right py-3 px-2">Monto</th>
                            <th className="text-left py-3 px-2">Forma</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row, i) => (
                            <tr
                                key={row.UUID || i}
                                className="border-b border-dark-700/50 hover:bg-dark-700/30 transition-colors"
                            >
                                <td className="py-3 px-2">
                                    <span className="inline-flex items-center gap-1 text-brand-500 font-semibold">
                                        <FileText size={14} />
                                        {row.FOLIO || '-'}
                                    </span>
                                </td>
                                <td className="py-3 px-2 text-slate-200 max-w-[180px] truncate" title={row.CLIENTE}>
                                    {row.CLIENTE}
                                </td>
                                <td className="py-3 px-2 text-slate-400">
                                    {formatDate(row["FECHA PAGO"])}
                                </td>
                                <td className="py-3 px-2 text-right text-success font-semibold">
                                    {formatCurrency(row["MONTO PAGADO"] || 0)}
                                </td>
                                <td className="py-3 px-2 text-slate-400 text-xs">
                                    {row["FORMA PAGO"] || '-'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {data.length === 0 && (
                <div className="text-center py-8 text-slate-500">
                    No hay complementos de pago registrados.
                </div>
            )}
        </div>
    );
};

export default PaymentDetailsTable;
