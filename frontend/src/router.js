import { isAuthenticated } from './api.js';
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
    return window.location.hash.slice(1) || '/';
}

export async function handleRoute() {
    const path = getCurrentPath();
    const container = document.getElementById('page-content');
    if (!container) return;

    if (path !== '/profile' && isAuthenticated()) {
        const { getCurrentUser } = await import('./components/navbar.js');
        const user = await getCurrentUser();
        if (user && user.username && user.username.startsWith('user_')) {
            const { showToast } = await import('./components/toast.js');
            showToast('Please update your username to continue', 'warning');
            navigate('/profile');
            return;
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

    if (!handler) {
        for (const [pattern, h] of Object.entries(routes)) {
            const regex = patternToRegex(pattern);
            const match = path.match(regex);
            if (match) {
                handler = h;
                params = extractParams(pattern, match);
                break;
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
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">⚠️</div>
                    <div class="empty-state-text">${t('router_error', { msg: err.message })}</div>
                </div>
            `;
        }
    } else {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔍</div>
                <div class="empty-state-text">${t('router_page_not_found')}</div>
                <button class="btn btn-primary" onclick="location.hash='#/'">${t('router_go_home')}</button>
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
    return new RegExp(`^${withParams}$`);
}

function extractParams(pattern, match) {
    const params = {};
    const paramNames = [...pattern.matchAll(/:(\w+)/g)].map(m => m[1]);
    paramNames.forEach((name, i) => {
        params[name] = match[i + 1];
    });
    return params;
}
