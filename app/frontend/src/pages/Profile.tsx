import React, { useState } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/axios';

const Profile: React.FC = () => {
    const { user, logout } = useAuth();
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);
        setError(null);

        if (!oldPassword || !newPassword || !confirmPassword) {
            setError('Completa todos los campos');
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('La confirmación no coincide con la nueva contraseña');
            return;
        }

        if (newPassword.length < 8) {
            setError('La nueva contraseña debe tener al menos 8 caracteres');
            return;
        }

        try {
            setLoading(true);
            await api.post('/api/auth/change-password', {
                old_password: oldPassword,
                new_password: newPassword,
            });
            setMessage('Contraseña actualizada correctamente. Vuelve a iniciar sesión.');
            setOldPassword('');
            setNewPassword('');
            setConfirmPassword('');
            // Opcional: cerrar sesión para forzar re-login con la nueva contraseña
            logout();
        } catch (err: any) {
            const detail = err?.response?.data?.detail;
            setError(typeof detail === 'string' ? detail : 'No se pudo actualizar la contraseña');
        } finally {
            setLoading(false);
        }
    };

    const [username, setUsername] = useState(user?.username || '');
    const [nombre, setNombre] = useState(user?.nombre || '');
    const [email, setEmail] = useState(user?.email || '');
    const [profileLoading, setProfileLoading] = useState(false);
    const [profileMessage, setProfileMessage] = useState<string | null>(null);
    const [profileError, setProfileError] = useState<string | null>(null);

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setProfileMessage(null);
        setProfileError(null);
        if (!user) return;

        try {
            setProfileLoading(true);
            await api.put(`/api/auth/users/${user.id}`, {
                username,
                nombre,
                email
            });
            setProfileMessage('Datos de perfil actualizados correctamente. Por favor, reinicia sesión si cambiaste de usuario.');
        } catch (err: any) {
            const detail = err?.response?.data?.detail;
            setProfileError(typeof detail === 'string' ? detail : 'No se pudo actualizar el perfil');
        } finally {
            setProfileLoading(false);
        }
    };

    return (
        <Layout>
            <div className="max-w-xl mx-auto space-y-6">
                <h1 className="text-2xl font-semibold text-white mb-2">Mi perfil</h1>

                {/* Main Profile Info */}
                <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-6">
                    <h2 className="text-lg font-medium text-white mb-4">Información Personal</h2>
                    
                    {profileError && <div className="mb-3 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{profileError}</div>}
                    {profileMessage && <div className="mb-3 rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{profileMessage}</div>}

                    <form onSubmit={handleUpdateProfile} className="space-y-4">
                        <div>
                            <label className="block text-sm text-slate-300 mb-1">Nombre Completo</label>
                            <input
                                type="text"
                                className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:ring-2 focus:ring-slate-400"
                                value={nombre}
                                onChange={e => setNombre(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-slate-300 mb-1">Nombre de Usuario</label>
                            <input
                                type="text"
                                className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:ring-2 focus:ring-slate-400"
                                value={username}
                                onChange={e => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-slate-300 mb-1">Correo Electrónico</label>
                            <input
                                type="email"
                                className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:ring-2 focus:ring-slate-400"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={profileLoading}
                            className="inline-flex items-center justify-center rounded bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600 disabled:opacity-60"
                        >
                            {profileLoading ? 'Guardando...' : 'Actualizar Información'}
                        </button>
                    </form>
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-6">
                    <h2 className="text-lg font-medium text-white mb-4">Cambiar contraseña</h2>

                    {error && (
                        <div className="mb-3 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                            {error}
                        </div>
                    )}
                    {message && (
                        <div className="mb-3 rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                            {message}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm text-slate-300 mb-1">Contraseña actual</label>
                            <input
                                type="password"
                                className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"
                                value={oldPassword}
                                onChange={e => setOldPassword(e.target.value)}
                                autoComplete="current-password"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-slate-300 mb-1">Nueva contraseña</label>
                            <input
                                type="password"
                                className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                autoComplete="new-password"
                            />
                            <p className="mt-1 text-xs text-slate-400">Mínimo 8 caracteres. Evita usar tu nombre de usuario.</p>
                        </div>

                        <div>
                            <label className="block text-sm text-slate-300 mb-1">Confirmar nueva contraseña</label>
                            <input
                                type="password"
                                className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                autoComplete="new-password"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="inline-flex items-center justify-center rounded bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Guardando...' : 'Actualizar contraseña'}
                        </button>
                    </form>
                </div>
            </div>
        </Layout>
    );
};

export default Profile;
