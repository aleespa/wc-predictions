import { clerk } from './auth.js';

const API_BASE = `${import.meta.env.VITE_API_URL}/api`;

export function isAuthenticated() {
    return !!clerk.user;
}

export async function fetchAPI(endpoint, options = {}) {
    const token = await clerk.session?.getToken();
    console.log(`API Call to ${endpoint}. Token present: ${!!token}`);

    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
    });

    if (response.status === 401) {
        window.location.hash = '#/login';
        throw new Error('Session expired. Please log in again.');
    }

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.detail || 'Something went wrong');
    }

    return data;
}