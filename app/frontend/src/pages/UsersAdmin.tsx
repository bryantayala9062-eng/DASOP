import React, { useEffect, useState, useMemo } from 'react';
import Layout from '../components/Layout';
import { api } from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { 
    Search, Plus, Edit2, Shield, UserX, KeyRound, Trash2,
    Check, X, FileText, BarChart3, Database, Frame, Mail, Loader2, AlertCircle, Save,
    UserCheck, User, Lock
} from 'lucide-react';

interface UserRow {
    id: number;
    username: string;
    nombre: string;
    email: string;
    es_admin: boolean;
    mod_legal: boolean;
    mod_materialidad: boolean;
    mod_dashboard: boolean;
    activo: boolean;
    departamento?: string;
    empresa_filtro?: string;
    ultima_conexion?: string;
    ultimo_heartbeat?: string;
}

// Helpers para conexión
const isOnline = (heartbeat?: string) => {
    if (!heartbeat) return false;
    const hbStr = heartbeat.endsWith('Z') ? heartbeat : heartbeat + 'Z';
    const hbDate = new Date(hbStr);
    const now = new Date();
    // 5 minutos de tolerancia
    return (now.getTime() - hbDate.getTime()) < 300000;
};

const formatConnection = (dateString?: string) => {
    if (!dateString) return "Nunca";
    const dStr = dateString.endsWith('Z') ? dateString : dateString + 'Z';
    const d = new Date(dStr);
    return d.toLocaleString('es-MX', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function UsersAdmin() {
    const { user } = useAuth();
    const [users, setUsers] = useState<UserRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [resetModalOpen, setResetModalOpen] = useState(false);

    const [form, setForm] = useState<Partial<UserRow>>({});
    const [isNew, setIsNew] = useState(false);
    const [initialPassword, setInitialPassword] = useState('');
    const [resetPassword, setResetPassword] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Delete confirmation
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [userToDelete, setUserToDelete] = useState<UserRow | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const loadUsers = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get<UserRow[]>('/api/auth/users');
            setUsers(res.data);
        } catch (err: any) {
            const detail = err?.response?.data?.detail;
            setError(typeof detail === 'string' ? detail : 'No se pudo cargar la lista de usuarios');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user?.es_admin) loadUsers();
    }, [user]);

    const showTemporarySuccess = (msg: string) => {
        setSuccessMsg(msg);
        setTimeout(() => setSuccessMsg(null), 3000);
    };

    const openNewUserModal = () => {
        setIsNew(true);
        setSelectedUser(null);
        setForm({
            username: '', nombre: '', email: '',
            es_admin: false, mod_legal: false, mod_materialidad: false, mod_dashboard: false, activo: true,
            departamento: '', empresa_filtro: ''
        });
        setInitialPassword('');
        setModalOpen(true);
        setError(null);
    };

    const openEditUserModal = (u: UserRow) => {
        setIsNew(false);
        setSelectedUser(u);
        setForm({ ...u });
        setModalOpen(true);
        setError(null);
    };

    const openResetPasswordModal = (u: UserRow) => {
        setSelectedUser(u);
        setResetPassword('');
        setResetModalOpen(true);
        setError(null);
    };

    const openDeleteModal = (u: UserRow) => {
        setUserToDelete(u);
        setDeleteModalOpen(true);
    };

    const handleDelete = async () => {
        if (!userToDelete) return;
        setIsDeleting(true);
        try {
            await api.delete(`/api/auth/users/${userToDelete.id}`);
            setDeleteModalOpen(false);
            setUserToDelete(null);
            showTemporarySuccess(`Usuario "${userToDelete.nombre}" eliminado correctamente`);
            await loadUsers();
        } catch (err: any) {
            const detail = err?.response?.data?.detail;
            setError(typeof detail === 'string' ? detail : 'No se pudo eliminar el usuario');
            setDeleteModalOpen(false);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        
        if (isNew) {
            if (!form.username || !initialPassword || !form.nombre) {
                setError('Completa los campos obligatorios (usuario, nombre, contraseña)');
                return;
            }
            try {
                setIsSaving(true);
                await api.post('/api/auth/users', {
                    username: form.username,
                    password: initialPassword,
                    nombre: form.nombre,
                    email: form.email,
                    es_admin: !!form.es_admin,
                    mod_legal: !!form.mod_legal,
                    mod_materialidad: !!form.mod_materialidad,
                    mod_dashboard: !!form.mod_dashboard,
                    departamento: form.departamento || null,
                    empresa_filtro: form.empresa_filtro || null,
                    activo: true,
                });
                setModalOpen(false);
                showTemporarySuccess('Usuario creado exitosamente');
                await loadUsers();
            } catch (err: any) {
                const detail = err?.response?.data?.detail;
                if (typeof detail === 'string') {
                    setError(detail);
                } else if (Array.isArray(detail)) {
                    setError('Validación: ' + detail.map((e: any) => e.msg).join(', '));
                } else {
                    setError('Error al crear el usuario: ' + JSON.stringify(err?.response?.data ?? err?.message));
                }
            } finally {
                setIsSaving(false);
            }
        } else if (selectedUser) {
            try {
                setIsSaving(true);
                const updatePayload: any = {
                    nombre: form.nombre,
                    email: form.email,
                    es_admin: form.es_admin,
                    mod_legal: form.mod_legal,
                    mod_materialidad: form.mod_materialidad,
                    mod_dashboard: form.mod_dashboard,
                    departamento: form.departamento || null,
                    empresa_filtro: form.empresa_filtro || null,
                    activo: form.activo,
                    username: form.username,
                };
                if (initialPassword) {
                    updatePayload.password = initialPassword;
                }

                await api.put(`/api/auth/users/${selectedUser.id}`, updatePayload);
                setModalOpen(false);
                showTemporarySuccess('Usuario actualizado exitosamente');
                await loadUsers();
            } catch (err: any) {
                const detail = err?.response?.data?.detail;
                setError(typeof detail === 'string' ? detail : 'Error al actualizar el usuario');
            } finally {
                setIsSaving(false);
            }
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedUser || !resetPassword) {
            setError('Escribe una nueva contraseña');
            return;
        }
        try {
            setIsSaving(true);
            setError(null);
            await api.post(`/api/auth/users/${selectedUser.id}/reset-password`, {
                new_password: resetPassword,
            });
            setResetModalOpen(false);
            showTemporarySuccess('Contraseña reseteada exitosamente');
        } catch (err: any) {
            const detail = err?.response?.data?.detail;
            setError(typeof detail === 'string' ? detail : 'Error al resetear la contraseña');
        } finally {
            setIsSaving(false);
        }
    };

    const filteredUsers = useMemo(() => {
        const query = searchTerm.toLowerCase();
        return users.filter(u => 
            u.nombre.toLowerCase().includes(query) || 
            u.username.toLowerCase().includes(query) || 
            u.email.toLowerCase().includes(query)
        );
    }, [users, searchTerm]);

    if (!user?.es_admin) {
        return (
            <Layout>
                <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-400">
                    <Shield className="w-16 h-16 mb-4 text-slate-500 opacity-50" />
                    <h2 className="text-xl font-medium text-slate-300">Acceso Denegado</h2>
                    <p className="mt-2 text-sm text-center">No tienes los privilegios necesarios para ver esta página.</p>
                </div>
            </Layout>
        );
    }

    return (
        <Layout>
            {/* Header Section */}
            <div className="relative mb-8 pt-4">
                <div className="absolute inset-0 bg-gradient-to-r from-slate-500/10 to-slate-700/10 blur-3xl -z-10 rounded-full" />
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent mb-2">
                            Gestión de Usuarios
                        </h1>
                        <p className="text-slate-400 text-sm flex items-center gap-2">
                            <Shield className="w-4 h-4 text-emerald-400" />
                            Administración avanzada de accesos, roles y módulos del sistema.
                        </p>
                    </div>
                    
                    <button
                        onClick={openNewUserModal}
                        className="group relative inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white transition-all duration-200 bg-gradient-to-br from-slate-700 to-slate-800 rounded-xl hover:from-slate-600 hover:to-slate-700 hover:shadow-lg hover:shadow-black/30 active:scale-95"
                    >
                        <Plus className="w-4 h-4 transition-transform group-hover:rotate-90" />
                        Nuevo Usuario
                    </button>
                </div>
            </div>

            {/* Notifications */}
            {error && !modalOpen && !resetModalOpen && (
                <div className="mb-6 flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 shadow-inner animate-in fade-in slide-in-from-top-2">
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                    <p className="text-sm font-medium">{error}</p>
                    <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-white"><X className="w-4 h-4" /></button>
                </div>
            )}

            {successMsg && (
                <div className="mb-6 flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 shadow-inner animate-in fade-in slide-in-from-top-2">
                    <Check className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    <p className="text-sm font-medium">{successMsg}</p>
                </div>
            )}

            {/* Toolbar */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
                <div className="relative w-full md:w-96">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <Search className="w-4 h-4 text-slate-400" />
                    </div>
                    <input
                        type="text"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-900/50 border border-slate-700/60 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/50 focus:border-slate-500/50 transition-all backdrop-blur-sm"
                        placeholder="Buscar por nombre, usuario o email..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-400">
                    <span className="flex items-center gap-1"><UsersCount users={users} loading={loading} /></span>
                </div>
            </div>

            {/* Users Table */}
            <div className="bg-slate-900/40 backdrop-blur-md border border-slate-700/50 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-400 uppercase bg-slate-900/60 border-b border-slate-700/50">
                            <tr>
                                <th className="px-6 py-4 font-medium">Usuario / Email</th>
                                <th className="px-6 py-4 font-medium">Estado</th>
                                <th className="px-6 py-4 font-medium text-center">Rol Global</th>
                                <th className="px-6 py-4 font-medium text-center">Permisos de Módulos</th>
                                <th className="px-6 py-4 font-medium text-center">Aislamiento</th>
                                <th className="px-6 py-4 font-medium text-center">Última Conexión</th>
                                <th className="px-6 py-4 font-medium text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                            {loading && users.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center">
                                        <Loader2 className="w-6 h-6 animate-spin text-slate-600 mx-auto mb-2" />
                                        <p className="text-slate-400">Cargando usuarios...</p>
                                    </td>
                                </tr>
                            ) : filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                                        <div className="flex flex-col items-center justify-center">
                                            <Search className="w-10 h-10 mb-3 text-slate-600" />
                                            <p className="text-base font-medium">No se encontraron usuarios</p>
                                            {searchTerm && <p className="text-xs mt-1">Prueba con otros términos de búsqueda.</p>}
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredUsers.map((u) => (
                                    <tr 
                                        key={u.id} 
                                        className={`group transition-colors hover:bg-slate-800/40 ${!u.activo ? 'opacity-60 saturate-50' : ''}`}
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-600/20 to-purple-500/20 border border-slate-600/30 flex items-center justify-center text-slate-300 font-bold uppercase shrink-0">
                                                    {u.nombre.charAt(0)}{u.nombre.split(' ').length > 1 ? u.nombre.split(' ')[1].charAt(0) : ''}
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-slate-200 group-hover:text-white transition-colors">{u.nombre}</p>
                                                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs text-slate-400 mt-0.5">
                                                        <span className="flex items-center gap-1"><User className="w-3 h-3" /> {u.username}</span>
                                                        <span className="hidden sm:inline">•</span>
                                                        <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {u.email}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                                                u.activo 
                                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                                : 'bg-slate-800 text-slate-400 border-slate-700'
                                            }`}>
                                                {u.activo ? <><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Activo</> : <><UserX className="w-3 h-3" /> Inactivo</>}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {u.es_admin ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg text-xs font-medium">
                                                    <Shield className="w-3.5 h-3.5" /> Administrador
                                                </span>
                                            ) : (
                                                <span className="text-slate-500 text-xs">Estándar</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-wrap items-center justify-center gap-1.5">
                                                {u.mod_dashboard && (
                                                    <span className="inline-flex items-center px-2 py-1 rounded bg-slate-600/10 border border-slate-500/20 text-slate-300 text-[10px] uppercase font-bold" title="Dashboard">
                                                        <BarChart3 className="w-3 h-3 mr-1" /> Dash
                                                    </span>
                                                )}
                                                {u.mod_legal && (
                                                    <span className="inline-flex items-center px-2 py-1 rounded bg-slate-600/10 border border-slate-600/20 text-slate-400 text-[10px] uppercase font-bold" title="Legal">
                                                        <FileText className="w-3 h-3 mr-1" /> Legal
                                                    </span>
                                                )}
                                                {u.mod_materialidad && (
                                                    <span className="inline-flex items-center px-2 py-1 rounded bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] uppercase font-bold" title="Materialidad">
                                                        <Database className="w-3 h-3 mr-1" /> Mat
                                                    </span>
                                                )}
                                                {!u.mod_dashboard && !u.mod_legal && !u.mod_materialidad && (
                                                    <span className="text-slate-500 text-xs">-</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {u.empresa_filtro ? (
                                                <span className="inline-flex items-center px-2 py-1 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] uppercase font-bold" title="Filtro de Empresa Activo">
                                                    {u.empresa_filtro}
                                                </span>
                                            ) : (
                                                <span className="text-slate-500 text-xs">-</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col items-center justify-center">
                                                {isOnline(u.ultimo_heartbeat) ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-[11px] font-bold shadow-[0_0_10px_rgba(16,185,129,0.15)] uppercase tracking-wide">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> En línea
                                                    </span>
                                                ) : (
                                                    <span className="text-[11px] text-slate-500 font-medium whitespace-nowrap">
                                                        {formatConnection(u.ultima_conexion)}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    onClick={() => openResetPasswordModal(u)}
                                                    className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-400/10 rounded-lg transition-colors"
                                                    title="Resetear Contraseña"
                                                >
                                                    <KeyRound className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => openEditUserModal(u)}
                                                    className="p-1.5 text-slate-400 hover:text-slate-300 hover:bg-slate-400/10 rounded-lg transition-colors"
                                                    title="Editar Usuario"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                {u.id !== user?.id && (
                                                    <button
                                                        onClick={() => openDeleteModal(u)}
                                                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                                        title="Eliminar Usuario"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Edit/Create Modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => !isSaving && setModalOpen(false)} />
                    <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
                            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                                {isNew ? <><Plus className="w-5 h-5 text-slate-300" /> Nuevo Usuario</> : <><Edit2 className="w-5 h-5 text-slate-300" /> Editar {selectedUser?.nombre}</>}
                            </h2>
                            <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-white transition-colors" disabled={isSaving}>
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <form onSubmit={handleSave} className="p-6">
                            {error && (
                                <div className="mb-6 flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                                    <AlertCircle className="w-4 h-4" /> {error}
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-400 mb-1.5">Nombre Completo <span className="text-red-400">*</span></label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><User className="w-4 h-4 text-slate-500" /></div>
                                            <input type="text" required value={form.nombre || ''} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:border-slate-500 focus:ring-1 focus:ring-slate-400 transition-all" placeholder="Juan Pérez" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-400 mb-1.5">Correo Electrónico</label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Mail className="w-4 h-4 text-slate-500" /></div>
                                            <input type="email" value={form.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:border-slate-500 focus:ring-1 focus:ring-slate-400 transition-all" placeholder="(Opcional) juan@ejemplo.com" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-400 mb-1.5">Nombre de Usuario <span className="text-red-400">*</span></label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Frame className="w-4 h-4 text-slate-500" /></div>
                                            <input type="text" required value={form.username || ''} onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') }))} className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:border-slate-500 focus:ring-1 focus:ring-slate-400 transition-all" placeholder="jperez" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-400 mb-1.5">{isNew ? 'Contraseña Inicial' : 'Nueva Contraseña (Opcional)'} {isNew && <span className="text-red-400">*</span>}</label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Lock className="w-4 h-4 text-slate-500" /></div>
                                            <input type="password" required={isNew} value={initialPassword} onChange={e => setInitialPassword(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:border-slate-500 focus:ring-1 focus:ring-slate-400 transition-all" placeholder={isNew ? "••••••••" : "Dejar en blanco para no cambiar"} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-400 mb-1.5">Departamento (Opcional)</label>
                                        <div className="relative">
                                            <input type="text" value={form.departamento || ''} onChange={e => setForm(f => ({ ...f, departamento: e.target.value }))} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:border-slate-500 focus:ring-1 focus:ring-slate-400 transition-all" placeholder="Ej. Legal, Contabilidad" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-400 mb-1.5">Filtro de Empresa (Aislamiento de Datos)</label>
                                        <div className="relative">
                                            <input type="text" value={form.empresa_filtro || ''} onChange={e => setForm(f => ({ ...f, empresa_filtro: e.target.value.toUpperCase() }))} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all" placeholder="Ej. EXFIS (Dejar vacío para ver todas)" />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50">
                                        <h3 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2 border-b border-slate-800 pb-2">
                                            <Shield className="w-4 h-4 text-amber-400" /> Roles y Permisos
                                        </h3>
                                        <div className="space-y-3">
                                            <label className="flex items-center gap-3 cursor-pointer group">
                                                <div className="relative flex items-center">
                                                    <input type="checkbox" className="sr-only" checked={!!form.es_admin} onChange={e => setForm(f => ({ ...f, es_admin: e.target.checked }))} />
                                                    <div className={`w-10 h-5 rounded-full transition-colors ${form.es_admin ? 'bg-amber-500' : 'bg-slate-700'}`}></div>
                                                    <div className={`absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form.es_admin ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors">Administrador</span>
                                                    <span className="text-[10px] text-slate-500">Acceso total al sistema y configuraciones</span>
                                                </div>
                                            </label>

                                            <div className="pt-2">
                                                <p className="text-xs text-slate-400 mb-2">Acceso a módulos:</p>
                                                <div className="grid grid-cols-1 gap-2">
                                                    <PermissionToggle label="Dashboard" icon={<BarChart3 className="w-3.5 h-3.5 text-slate-300" />} checked={!!form.mod_dashboard} onChange={v => setForm(f => ({ ...f, mod_dashboard: v }))} activeColor="bg-slate-600" />
                                                    <PermissionToggle label="Legal" icon={<FileText className="w-3.5 h-3.5 text-slate-400" />} checked={!!form.mod_legal} onChange={v => setForm(f => ({ ...f, mod_legal: v }))} activeColor="bg-slate-600" />
                                                    <PermissionToggle label="Materialidad" icon={<Database className="w-3.5 h-3.5 text-purple-400" />} checked={!!form.mod_materialidad} onChange={v => setForm(f => ({ ...f, mod_materialidad: v }))} activeColor="bg-purple-500" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {!isNew && (
                                        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50">
                                            <label className="flex items-center justify-between cursor-pointer group">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium text-slate-200">Estado de la cuenta</span>
                                                    <span className="text-[10px] text-slate-500">{form.activo ? 'El usuario puede iniciar sesión en el portal' : 'Ingreso bloqueado para este usuario'}</span>
                                                </div>
                                                <div className="relative flex items-center shrink-0">
                                                    <input type="checkbox" className="sr-only" checked={form.activo ?? true} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} />
                                                    <div className={`w-10 h-5 rounded-full transition-colors ${form.activo !== false ? 'bg-emerald-500' : 'bg-slate-700'}`}></div>
                                                    <div className={`absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form.activo !== false ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                                </div>
                                            </label>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-5 border-t border-slate-800">
                                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors" disabled={isSaving}>Cancelar</button>
                                <button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-600 hover:to-slate-700 text-white text-sm font-semibold rounded-lg shadow-lg shadow-black/30 transition-all active:scale-95 disabled:opacity-70 disabled:pointer-events-none">
                                    {isSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : <><Save className="w-4 h-4" /> Guardar Usuario</>}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Reset Password Modal */}
            {resetModalOpen && selectedUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => !isSaving && setResetModalOpen(false)} />
                    <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-6">
                            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-500/10 mb-4 mx-auto border border-amber-500/20">
                                <KeyRound className="w-6 h-6 text-amber-400" />
                            </div>
                            <h2 className="text-xl font-bold text-center text-white mb-2">Restablecer Contraseña</h2>
                            <p className="text-center text-slate-400 text-sm mb-6">Ingresa una nueva contraseña para el usuario <span className="font-semibold text-slate-200">{selectedUser.nombre}</span>.</p>
                            
                            <form onSubmit={handleResetPassword}>
                                {error && (
                                    <div className="mb-4 flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                                        <AlertCircle className="w-4 h-4" /> {error}
                                    </div>
                                )}
                                <div className="mb-6">
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Nueva Contraseña <span className="text-red-400">*</span></label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Lock className="w-4 h-4 text-slate-500" /></div>
                                        <input type="password" required value={resetPassword} onChange={e => setResetPassword(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all" placeholder="••••••••" />
                                    </div>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <button type="button" onClick={() => setResetModalOpen(false)} className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700" disabled={isSaving}>Cancelar</button>
                                    <button type="submit" disabled={isSaving || !resetPassword} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-sm font-semibold rounded-lg shadow-lg shadow-amber-500/25 transition-all active:scale-95 disabled:opacity-70 disabled:pointer-events-none">
                                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteModalOpen && userToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => !isDeleting && setDeleteModalOpen(false)} />
                    <div className="relative w-full max-w-sm bg-slate-900 border border-red-500/20 rounded-2xl shadow-2xl overflow-hidden">
                        <div className="p-6">
                            {/* Icon */}
                            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 mb-4 mx-auto">
                                <Trash2 className="w-7 h-7 text-red-400" />
                            </div>
                            <h2 className="text-xl font-bold text-center text-white mb-1">Eliminar Usuario</h2>
                            <p className="text-center text-slate-400 text-sm mb-1">
                                ¿Estás seguro de que quieres eliminar a
                            </p>
                            <p className="text-center font-semibold text-white mb-4">
                                {userToDelete.nombre}
                                <span className="text-slate-500 font-normal text-xs ml-1">(@{userToDelete.username})</span>
                            </p>
                            <div className="bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2 mb-6">
                                <p className="text-xs text-red-300 text-center">Esta acción es permanente y no se puede deshacer.</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setDeleteModalOpen(false)}
                                    disabled={isDeleting}
                                    className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700 disabled:opacity-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleDelete}
                                    disabled={isDeleting}
                                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-lg transition-all active:scale-95 disabled:opacity-70 disabled:pointer-events-none"
                                >
                                    {isDeleting
                                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Eliminando...</>
                                        : <><Trash2 className="w-4 h-4" /> Sí, eliminar</>
                                    }
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
}

function PermissionToggle({ label, icon, checked, onChange, activeColor }: { label: string, icon: React.ReactNode, checked: boolean, onChange: (val: boolean) => void, activeColor: string }) {
    return (
        <label className={`flex items-center gap-3 p-2 rounded-lg border transition-colors cursor-pointer ${checked ? 'border-slate-700 bg-slate-800/50' : 'border-transparent hover:bg-slate-800/30'}`}>
            <div className="relative flex items-center shrink-0">
                <input type="checkbox" className="sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
                <div className={`w-8 h-4 rounded-full transition-colors ${checked ? activeColor : 'bg-slate-700'}`}></div>
                <div className={`absolute left-0.5 top-[2px] w-3 h-3 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`}></div>
            </div>
            <div className="flex items-center gap-2">
                {icon}
                <span className="text-xs font-medium text-slate-300">{label}</span>
            </div>
        </label>
    );
}

function UsersCount({ users, loading }: { users: UserRow[], loading: boolean }) {
    if (loading) return null;
    const active = users.filter(u => u.activo).length;
    return (
        <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5"><UserCheck className="w-4 h-4 text-emerald-400" /> {active} activos</span>
            <span className="flex items-center gap-1.5"><Database className="w-4 h-4 text-slate-500" /> {users.length} total</span>
        </div>
    );
}
