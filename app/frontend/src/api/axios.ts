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

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (
            error.response?.status === 401 &&
            !error.config.url?.includes('/login')
        ) {
            sessionStorage.removeItem('token');
            // Redirigir al usuario al login para que renueve su sesión
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);
