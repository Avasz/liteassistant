import axios from 'axios';

const api = axios.create({
    baseURL: '/api', // Proxy will handle this in dev, relative path in prod
});

api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401) {
            // Only clear token and redirect if the request actually had a token
            // This prevents logout when making unauthenticated requests on page load
            const hadToken = error.config?.headers?.Authorization;
            if (hadToken) {
                localStorage.removeItem('token');
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export default api;
