import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Scale, FileText, PieChart, Home, User, Users, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const location = useLocation();
    const { user, logout } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Cerrar sidebar al cambiar de ruta en mobile
    useEffect(() => {
        setSidebarOpen(false);
    }, [location.pathname]);

    // Cerrar sidebar con tecla Escape
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setSidebarOpen(false);
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, []);

    const navItems = [
        { path: '/',             label: 'Inicio',           icon: <Home size={20} className="text-slate-400" /> },
        { path: '/legal',        label: 'Seguimiento Legal', icon: <Scale size={20} className="text-slate-300" /> },
        { path: '/materialidad', label: 'Materialidad',      icon: <FileText size={20} className="text-emerald-400" /> },
        { path: '/dashboard',    label: 'Análisis XML',      icon: <PieChart size={20} className="text-purple-400" /> },
        ...(user?.es_admin
            ? [{ path: '/usuarios', label: 'Usuarios', icon: <Users size={20} className="text-amber-400" /> }]
            : []),
    ];

    const isActive = (path: string) => {
        if (path === '/') return location.pathname === '/';
        return location.pathname.startsWith(path);
    };

    const SidebarContent = () => (
        <>
            {/* Logo / Header */}
            <div className="h-16 flex items-center justify-between px-5 border-b border-slate-700 flex-shrink-0">
                <h1 className="text-lg font-bold text-white tracking-wide">Portal Optimal</h1>
                {/* Botón cerrar solo visible en mobile */}
                <button
                    onClick={() => setSidebarOpen(false)}
                    className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                    aria-label="Cerrar menú"
                >
                    <X size={20} />
                </button>
            </div>

            {/* Navigation links */}
            <div className="flex-1 overflow-y-auto py-4">
                <nav className="space-y-1 px-3">
                    {navItems.map(item => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                                isActive(item.path)
                                    ? 'bg-slate-700/50 text-slate-100 border border-slate-600/40'
                                    : 'text-slate-300 hover:text-white hover:bg-slate-700 border border-transparent'
                            }`}
                        >
                            {item.icon}
                            <span className="font-medium text-sm">{item.label}</span>
                        </Link>
                    ))}
                </nav>
            </div>

            {/* Footer: perfil + logout */}
            <div className="border-t border-slate-700 p-4 space-y-2 flex-shrink-0 pb-safe">
                {user && (
                    <Link
                        to="/perfil"
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-lg transition-colors text-sm ${
                            isActive('/perfil')
                                ? 'bg-slate-700 text-slate-100'
                                : 'text-slate-300 hover:text-white hover:bg-slate-700'
                        }`}
                    >
                        <User size={16} className="text-slate-400 flex-shrink-0" />
                        <span className="truncate">{user.nombre || user.username}</span>
                    </Link>
                )}
                <button
                    type="button"
                    onClick={logout}
                    className="flex items-center gap-2 w-full text-left text-slate-400 hover:text-red-400 hover:bg-red-500/10 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium"
                >
                    <LogOut size={16} />
                    Cerrar sesión
                </button>
            </div>
        </>
    );

    return (
        <div className="flex h-screen bg-slate-900 text-slate-200 overflow-hidden font-sans">

            {/* ── SIDEBAR DESKTOP (siempre visible en md+) ── */}
            <aside className="hidden md:flex w-64 bg-slate-800 border-r border-slate-700 flex-col z-20 flex-shrink-0">
                <SidebarContent />
            </aside>

            {/* ── SIDEBAR MOBILE (drawer desde la izquierda) ── */}
            {sidebarOpen && (
                <>
                    {/* Overlay oscuro */}
                    <div
                        className="mobile-nav-overlay md:hidden"
                        onClick={() => setSidebarOpen(false)}
                        aria-hidden="true"
                    />
                    {/* Drawer */}
                    <aside className="sidebar-mobile-open fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-slate-800 border-r border-slate-700 flex flex-col z-50 md:hidden">
                        <SidebarContent />
                    </aside>
                </>
            )}

            {/* ── CONTENIDO PRINCIPAL ── */}
            <main className="flex-1 overflow-hidden bg-slate-900 flex flex-col min-w-0">

                {/* Top bar solo en mobile (hamburger) */}
                <div className="md:hidden flex items-center gap-3 px-4 h-14 border-b border-slate-700 bg-slate-800 flex-shrink-0 pt-safe">
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                        aria-label="Abrir menú"
                    >
                        <Menu size={22} />
                    </button>
                    <span className="text-white font-semibold text-sm">Portal Optimal</span>
                    {/* Indicador de página activa */}
                    <span className="ml-auto text-xs text-slate-500">
                        {navItems.find(n => isActive(n.path))?.label ?? ''}
                    </span>
                </div>

                {/* Zona de scroll del contenido */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8 relative">
                    {children}
                </div>
            </main>
        </div>
    );
};

export default Layout;
