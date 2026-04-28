import { isAuthenticated, clearToken, fetchAPI } from '../api.js';

let cachedUser = null;

export async function getCurrentUser() {
    if (!isAuthenticated()) return null;
    if (cachedUser) return cachedUser;
    try {
        cachedUser = await fetchAPI('/me');
        return cachedUser;
    } catch {
        return null;
    }
}

export function clearUserCache() {
    cachedUser = null;
}

export function renderNavbar() {
    const nav = document.getElementById('navbar');
    const authed = isAuthenticated();

    nav.innerHTML = `
        <div class="nav-inner">
            <div class="nav-brand" onclick="location.hash='#/'" id="nav-brand">
                <span class="nav-brand-icon">⚽</span>
                <span class="nav-brand-text">WC 2026</span>
            </div>

            <button class="nav-mobile-toggle" id="nav-toggle" aria-label="Toggle navigation">☰</button>

            <div class="nav-links" id="nav-links">
                <button class="nav-link" data-route="/matches" onclick="location.hash='#/matches'">Matches</button>
                <button class="nav-link" data-route="/leaderboard" onclick="location.hash='#/leaderboard'">Leaderboard</button>
                ${authed ? `
                    <button class="nav-link" data-route="/profile" onclick="location.hash='#/profile'">My Predictions</button>
                    <span class="nav-link nav-user-name" id="nav-username"></span>
                    <button class="nav-link" id="nav-logout">Logout</button>
                ` : `
                    <button class="nav-link" data-route="/login" onclick="location.hash='#/login'">Login</button>
                    <button class="nav-link btn-primary" onclick="location.hash='#/register'">Sign Up</button>
                `}
            </div>
        </div>
    `;

    // Mobile toggle
    const toggle = document.getElementById('nav-toggle');
    const links = document.getElementById('nav-links');
    toggle?.addEventListener('click', () => {
        links.classList.toggle('open');
    });

    // Close mobile nav on link click
    links?.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => links.classList.remove('open'));
    });

    // Logout
    if (authed) {
        document.getElementById('nav-logout')?.addEventListener('click', () => {
            clearToken();
            clearUserCache();
            renderNavbar();
            location.hash = '#/';
        });

        // Load username
        getCurrentUser().then(user => {
            const el = document.getElementById('nav-username');
            if (el && user) {
                el.textContent = user.display_name || user.username;
            }
        });
    }
}
