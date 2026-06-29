import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/axios';
import { Lock, User, ArrowRight, Loader2 } from 'lucide-react';

const Login: React.FC = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError]       = useState('');
    const [loading, setLoading]   = useState(false);
    const { login } = useAuth();
    const navigate  = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const formData = new URLSearchParams();
            formData.append('username', username);
            formData.append('password', password);
            const res = await api.post('/api/auth/login', formData, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            login(res.data.access_token, res.data.user);
            navigate('/');
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Error de conexión');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 relative overflow-hidden">

            {/* Background glow blobs */}
            <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full bg-slate-600/10 blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-5%] w-[400px] h-[400px] rounded-full bg-slate-500/8 blur-[100px] pointer-events-none" />

            {/* Card */}
            <div
                className="relative w-full max-w-sm mx-4 rounded-2xl border border-white/8 bg-slate-900/80 backdrop-blur-xl shadow-2xl shadow-black/50 p-8"
                style={{ animation: 'fadeSlideUp 0.4s cubic-bezier(0.16,1,0.3,1) both' }}
            >
                {/* Botón Volver */}
                <button 
                    onClick={() => navigate('/')}
                    className="absolute top-4 left-4 text-slate-500 hover:text-slate-300 transition-colors flex items-center text-xs font-medium"
                >
                    ← Volver
                </button>

                {/* Logo / Brand */}
                <div className="text-center mb-8 mt-4">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-lg shadow-indigo-500/30 mb-4 border border-indigo-400">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="3" width="20" height="14" rx="2"/>
                            <path d="M8 21h8M12 17v4"/>
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">DashOP</h1>
                    <p className="text-xs text-indigo-400 font-medium mt-1 uppercase tracking-wider">ERP Operativo</p>
                </div>

                {/* Error */}
                {error && (
                    <div className="mb-5 flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 px-3 py-2.5 rounded-lg text-sm">
                        <span className="shrink-0">⚠</span>
                        <span>{error}</span>
                    </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Username */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
                            Usuario
                        </label>
                        <div className="relative">
                            <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                type="text"
                                autoComplete="username"
                                className="w-full bg-slate-800/80 border border-slate-700 text-white rounded-xl pl-9 pr-4 py-2.5 text-sm
                                    placeholder-slate-600 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400/30
                                    transition-all duration-150"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                placeholder="tu_usuario"
                                required
                                disabled={loading}
                            />
                        </div>
                    </div>

                    {/* Password */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
                            Contraseña
                        </label>
                        <div className="relative">
                            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                type="password"
                                autoComplete="current-password"
                                className="w-full bg-slate-800/80 border border-slate-700 text-white rounded-xl pl-9 pr-4 py-2.5 text-sm
                                    placeholder-slate-600 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400/30
                                    transition-all duration-150"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                disabled={loading}
                            />
                        </div>
                    </div>

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full mt-2 flex items-center justify-center gap-2
                            bg-gradient-to-r from-slate-700 to-slate-800
                            hover:from-slate-600 hover:to-slate-700
                            disabled:opacity-60 disabled:cursor-not-allowed
                            text-white font-semibold py-2.5 rounded-xl
                            shadow-lg shadow-black/40 border border-slate-600
                            transition-all duration-150 active:scale-[0.98]"
                    >
                        {loading
                            ? <><Loader2 size={16} className="animate-spin" /> Ingresando...</>
                            : <><span>Ingresar</span><ArrowRight size={16} /></>
                        }
                    </button>
                </form>
            </div>

            {/* Fade-slide animation */}
            <style>{`
                @keyframes fadeSlideUp {
                    from { opacity: 0; transform: translateY(16px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
};

export default Login;
