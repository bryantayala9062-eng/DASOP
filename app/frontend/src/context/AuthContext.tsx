import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/axios';

interface User {
    id: number;
    username: string;
    nombre: string;
    es_admin: boolean;
    mod_legal: boolean;
    mod_materialidad: boolean;
    mod_dashboard: boolean;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (token: string, userData: User) => void;
    logout: () => void;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(sessionStorage.getItem('token'));
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const init = async () => {
            const storedToken = sessionStorage.getItem('token');
            if (storedToken) {
                // Ya hay token guardado, solo validar
                try {
                    const res = await api.get('/api/auth/me');
                    setUser(res.data);
                    setLoading(false);
                    return;
                } catch {
                    sessionStorage.removeItem('token');
                    setToken(null);
                }
            }
            // Sin token válido
            setLoading(false);
        };
        init();
    }, []);

    const login = (newToken: string, userData: User) => {
        sessionStorage.setItem('token', newToken);
        setToken(newToken);
        setUser(userData);
    };

    const logout = () => {
        sessionStorage.removeItem('token');
        setToken(null);
        setUser(null);
    };

    // Inactivity logout timer (10 minutes)
    useEffect(() => {
        if (!token) return;

        let timeoutId: number;

        const resetTimer = () => {
            window.clearTimeout(timeoutId);
            // 10 minutos = 600,000 ms
            timeoutId = window.setTimeout(() => {
                logout();
                // Optionally redirect to login or show alert (in React context we just logout, which redirects if protected)
            }, 600000);
        };

        const events = ['mousemove', 'keydown', 'mousedown', 'scroll', 'touchstart'];
        
        // Start timer initially
        resetTimer();

        // Add event listeners
        events.forEach(event => window.addEventListener(event, resetTimer));

        // Cleanup
        return () => {
            window.clearTimeout(timeoutId);
            events.forEach(event => window.removeEventListener(event, resetTimer));
        };
    }, [token]);

    // Heartbeat timer (every 2 minutes)
    useEffect(() => {
        if (!token) return;

        const sendHeartbeat = async () => {
            try {
                await api.post('/api/auth/heartbeat');
            } catch (err) {
                console.error("Heartbeat failed", err);
            }
        };

        // Enviar el primero poco después del login
        sendHeartbeat();
        const intervalId = window.setInterval(sendHeartbeat, 120000); // 2 minutos

        return () => {
            window.clearInterval(intervalId);
        };
    }, [token]);

    return (
        <AuthContext.Provider value={{ user, token, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth debe usarse dentro de un AuthProvider');
    }
    return context;
};
