import { isAuthenticated } from './auth.js';
import { t } from './i18n.js';

const routes = {};
let currentCleanup = null;

export function registerRoute(path, handler) {
    routes[path] = handler;
}

export function navigate(path) {
    window.location.hash = `#${path}`;
}

export function getCurrentPath() {
    // Priority 1: The hash (e.g. #/login)
    let hash = window.location.hash.slice(1) || '/';
    
    // If the hash contains a query string (e.g. #/login?foo=bar), strip it for route matching
    let path = decodeURIComponent(hash.split('?')[0]) || '/';
    
    // Remove trailing slash if it's not the root
    if (path.length > 1 && path.endsWith('/')) {
        path = path.slice(0, -1);
    }
    return path;
}

const PUBLIC_ROUTES = ['/', '/login', '/register', '/matches', '/bracket', '/community', '/onboarding'];

export async function handleRoute() {
    const path = getCurrentPath();
    const container = document.getElementById('page-content');
    if (!container) return;

    // Route guard: redirect unauthenticated users away from protected routes
    const isPublic = PUBLIC_ROUTES.includes(path) ||
        path.startsWith('/user/') ||
        path.startsWith('/join/');
    
    if (!isAuthenticated() && !isPublic) {
        navigate('/login');
        return;
    }

    // Onboarding check: redirect onboarded users away from onboarding, 
    // and non-onboarded users to onboarding (unless they are logging in/out)
    if (isAuthenticated()) {
        const { getCurrentUser } = await import('./components/navbar.js');
        let user = null;
        try {
            user = await getCurrentUser();
        } catch (err) {
            console.error('Router: Failed to get current user', err);
        }

        if (!user && !isPublic) {
            // Cloudflare says we are authed, but backend says no or failed.
            // Redirect to login to force a session refresh or show error.
            navigate('/login');
            return;
        }

        if (user) {
            if (!user.is_onboarded && path !== '/onboarding') {
                navigate('/onboarding');
                return;
            }
            if (user.is_onboarded && path === '/onboarding') {
                navigate('/');
                return;
            }
        }
    }

    // Run cleanup from previous page
    if (currentCleanup && typeof currentCleanup === 'function') {
        currentCleanup();
        currentCleanup = null;
    }

    // Find matching route (supports params like /predict/:id)
    let handler = routes[path];
    let params = {};

    console.log(`Router: Handling path "${path}"`);

    if (!handler) {
        for (const [pattern, h] of Object.entries(routes)) {
            if (pattern.includes(':')) {
                const regex = patternToRegex(pattern);
                const match = path.match(regex);
                if (match) {
                    console.log(`Router: Matched pattern "${pattern}"`);
                    handler = h;
                    params = extractParams(pattern, match);
                    break;
                }
            }
        }
    }

    if (handler) {
        container.innerHTML = '<div class="spinner"></div>';
        try {
            const result = await handler(params);
            if (typeof result === 'string') {
                container.innerHTML = result;
            } else if (result && result.html) {
                container.innerHTML = result.html;
                if (result.init) {
                    currentCleanup = result.init();
                }
            }
        } catch (err) {
            console.error('Router: Handler error', err);
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">⚠️</div>
                    <div class="empty-state-text">${t('router_error', { msg: err.message })}</div>
                </div>
            `;
        }
    } else {
        console.warn(`Router: No handler found for path "${path}"`);
        const registeredRoutes = Object.keys(routes).join(', ');
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔍</div>
                <div class="empty-state-text">${t('router_page_not_found')}</div>
                <div style="font-size:0.7rem; color:var(--text-muted); margin-top:var(--space-md); text-align:center; opacity:0.6">
                    Path: "${path}"<br>
                    Routes: ${registeredRoutes}
                </div>
                <button class="btn btn-primary" style="margin-top:var(--space-lg)" onclick="location.hash='#/'">${t('router_go_home')}</button>
            </div>
        `;
    }

    // Update nav active states
    document.querySelectorAll('.nav-link[data-route]').forEach(link => {
        const route = link.getAttribute('data-route');
        link.classList.toggle('active', path === route || path.startsWith(route + '/'));
    });
}

export function initRouter() {
    window.addEventListener('hashchange', handleRoute);
    handleRoute();
}

function patternToRegex(pattern) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const withParams = escaped.replace(/:(\w+)/g, '([^/]+)');
    return new RegExp(`^${withParams}$`, 'i');
}

function extractParams(pattern, match) {
    const params = {};
    const paramNames = [...pattern.matchAll(/:(\w+)/g)].map(m => m[1]);
    paramNames.forEach((name, i) => {
        params[name] = match[i + 1];
    });
    return params;
}
