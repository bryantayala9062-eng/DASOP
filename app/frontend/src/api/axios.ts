import axios from 'axios';

// Detectar dinámicamente si usar proxy local o ser relativo al host actual
const API_URL = '';

export const api = axios.create({
    baseURL: API_URL,
});

api.interceptors.request.use((config) => {
    const token = sessionStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Si el token expiró (401), renovarlo automáticamente via autologin y reintentar
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        if (
            error.response?.status === 401 &&
            !originalRequest._retry &&
            !originalRequest.url?.includes('/autologin')
        ) {
            originalRequest._retry = true;
            try {
                const res = await axios.get(`${API_URL}/api/auth/autologin`);
                const newToken = res.data.access_token;
                sessionStorage.setItem('token', newToken);
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
                return api(originalRequest);
            } catch {
                // Si autologin falla, continuar con el error original
            }
        }
        return Promise.reject(error);
    }
);
