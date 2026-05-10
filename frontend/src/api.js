import { isAuthenticated } from './auth.js';

// We always use relative paths for API calls to ensure they hit the 
// Cloudflare Pages Functions proxy on the same origin.
// This is required for session cookies to be sent and for the 
// proxy to inject the trusted X-User-Sub header for the backend.
const API_BASE = '/api';

export { isAuthenticated };

export async function fetchAPI(endpoint, options = {}) {
    console.log(`API Call to ${endpoint}`);

    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    const startTime = performance.now();
    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
        credentials: 'include', // send session cookie on every request
    });
    const duration = performance.now() - startTime;
    const serverTime = response.headers.get('X-Process-Time');
    const serverTimeStr = serverTime ? ` (Server: ${parseFloat(serverTime).toFixed(4)}s)` : '';
    console.log(`API Call to ${endpoint} took ${duration.toFixed(2)}ms${serverTimeStr}`);

    if (response.status === 401) {
        window.location.hash = '#/login';
        throw new Error('Session expired. Please log in again.');
    }

    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
        data = await response.json();
    } else {
        const text = await response.text();
        console.error('Expected JSON but received:', text.substring(0, 100));
        throw new Error(`Server returned non-JSON response (${response.status}). This usually indicates a routing error or server crash.`);
    }

    if (!response.ok) {
        throw new Error(data.detail || 'Something went wrong');
    }

    return data;
}