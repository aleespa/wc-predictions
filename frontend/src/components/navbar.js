import { isAuthenticated, fetchAPI } from '../api.js';
import { clerk } from '../auth.js';
import { t, getLanguage, setLanguage } from '../i18n.js';

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

export async function renderNavbar() {
    const nav = document.getElementById('navbar');
    const authed = isAuthenticated();
    const clerkUser = clerk.user;
    const user = authed ? await getCurrentUser() : null;
    const lang = getLanguage();

    nav.innerHTML = `
        <div class="nav-inner">
            <div class="nav-brand" onclick="location.hash='#/'" id="nav-brand">
                <span class="nav-brand-icon">⚽</span>
                <span class="nav-brand-text">WC 2026</span>
            </div>

            <button class="nav-mobile-toggle" id="nav-toggle" aria-label="Toggle navigation">☰</button>

            <div class="nav-links" id="nav-links">
                <button class="nav-link" data-route="/matches" onclick="location.hash='#/matches'">${t('nav_matches')}</button>
                <button class="nav-link" data-route="/bracket" onclick="location.hash='#/bracket'">🏆 ${t('nav_bracket')}</button>
                <button class="nav-link" data-route="/community" onclick="location.hash='#/community'">👥 ${t('nav_community')}</button>
                ${authed ? `
                    ${user?.is_admin ? `<button class="nav-link" data-route="/admin" onclick="location.hash='#/admin'">⚙️ ${t('nav_admin')}</button>` : ''}
                    <button class="nav-link" data-route="/profile" onclick="location.hash='#/profile'">🔮 ${t('nav_my_predictions')}</button>
                    <div class="nav-user-info">
                        <img src="${clerkUser.imageUrl}" class="nav-user-avatar" alt="User avatar">
                        <span class="nav-link nav-user-name" id="nav-username"></span>
                    </div>
                    <button class="nav-link" id="nav-logout">${t('nav_logout')}</button>
                ` : `
                    <button class="nav-link" data-route="/login" onclick="location.hash='#/login'">${t('nav_login')}</button>
                `}
                <div class="nav-lang-toggle" style="display:flex;align-items:center;margin-left:8px;border-left:1px solid var(--border-medium);padding-left:12px">
                    <button class="btn btn-sm ${lang === 'en' ? 'btn-primary' : 'btn-secondary'}" onclick="window.__setLang('en')" style="padding:4px 8px;font-size:0.7rem;border-radius:4px 0 0 4px">EN</button>
                    <button class="btn btn-sm ${lang === 'es' ? 'btn-primary' : 'btn-secondary'}" onclick="window.__setLang('es')" style="padding:4px 8px;font-size:0.7rem;border-radius:0 4px 4px 0">ES</button>
                </div>
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

    window.__setLang = (l) => setLanguage(l);

    // Logout
    if (authed) {
        document.getElementById('nav-logout')?.addEventListener('click', async () => {
            await clerk.signOut();
            clearUserCache();
            renderNavbar();
            location.hash = '#/';
        });

        // Load username/display name
        const el = document.getElementById('nav-username');
        if (el) {
            el.textContent = clerkUser.fullName || clerkUser.username || clerkUser.primaryEmailAddress?.emailAddress;
        }
    }
}
