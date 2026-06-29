import { useEffect, useState } from 'react';
import { api } from '../../api/axios';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#6C63FF', '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#14B8A6'];

interface MetricsData {
    status_data: { name: string; value: number }[];
    type_data: { name: string; value: number }[];
    lawyer_data: { name: string; value: number }[];
    total_contracts: number;
}

const LegalMetrics = () => {
    const [data, setData] = useState<MetricsData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchMetrics = async () => {
            try {
                const res = await api.get('/api/legal/metrics');
                setData(res.data);
            } catch (err) {
                console.error('Error fetching metrics', err);
            } finally {
                setLoading(false);
            }
        };
        fetchMetrics();
    }, []);

    if (loading) return <div className="text-center py-20 text-slate-400">Cargando estadísticas...</div>;
    if (!data) return <p className="text-slate-400">No hay datos disponibles</p>;

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="flex gap-5">
                <div className="flex-1 bg-gradient-to-br from-slate-700 to-slate-900 rounded-xl p-5 text-center">
                    <h3 className="text-sm text-slate-300 mb-1">Total Contratos</h3>
                    <p className="text-3xl font-bold text-white">{data.total_contracts}</p>
                </div>
                <div className="flex-1 bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-xl p-5 text-center">
                    <h3 className="text-sm text-emerald-200 mb-1">Etapas Activas</h3>
                    <p className="text-3xl font-bold text-white">{data.status_data.length}</p>
                </div>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Status Chart */}
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
                    <h3 className="text-white font-semibold mb-5 text-center">📜 Contratos por Estatus</h3>
                    <div style={{ width: '100%', height: 300 }}>
                        <ResponsiveContainer>
                            <BarChart data={data.status_data} layout="vertical" margin={{ left: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis type="number" stroke="#94a3b8" />
                                <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' }} />
                                <Legend />
                                <Bar dataKey="value" name="Cantidad" fill="#6C63FF" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Type Chart */}
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
                    <h3 className="text-white font-semibold mb-5 text-center">🍰 Tipos de Contrato</h3>
                    <div style={{ width: '100%', height: 300 }}>
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie
                                    data={data.type_data}
                                    cx="50%" cy="50%"
                                    innerRadius={60} outerRadius={80}
                                    fill="#8884d8" paddingAngle={5}
                                    dataKey="value" label
                                >
                                    {data.type_data.map((_entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' }} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Lawyer Chart */}
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 lg:col-span-2">
                    <h3 className="text-white font-semibold mb-5 text-center">⚖️ Carga por Responsable Legal</h3>
                    <div style={{ width: '100%', height: 300 }}>
                        <ResponsiveContainer>
                            <BarChart data={data.lawyer_data}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="name" stroke="#94a3b8" />
                                <YAxis stroke="#94a3b8" />
                                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' }} />
                                <Legend />
                                <Bar dataKey="value" name="Contratos Asignados" fill="#10B981" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LegalMetrics;
