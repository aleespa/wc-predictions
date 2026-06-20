import { isAuthenticated, signIn } from '../auth.js';
import { t } from '../i18n.js';

export function loginPage() {
    if (isAuthenticated()) {
        setTimeout(() => { window.location.hash = '#/'; }, 0);
        return { html: '<div class="spinner"></div>' };
    }

    // Local development mode: offer two fixed users instead of Google OAuth.
    // Gated by VITE_LOCAL_AUTH so the production Cloudflare build never includes it.
    const localAuth = import.meta.env.VITE_LOCAL_AUTH === '1';

    const authControls = localAuth
        ? `
                <a href="/api/auth/login?user=admin" class="btn-google-signin" style="text-decoration:none;justify-content:center;">
                    🔑 Login as Admin
                </a>
                <a href="/api/auth/login?user=test" class="btn-google-signin" style="text-decoration:none;justify-content:center;margin-top:var(--space-sm);">
                    👤 Login as Test user
                </a>
        `
        : `
                <button id="google-signin-btn" class="btn-google-signin">
                    <svg class="btn-google-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="20" height="20">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                        <path fill="none" d="M0 0h48v48H0z"/>
                    </svg>
                    ${t('login_google_btn')}
                </button>
        `;

    const html = `
        <div class="auth-container fade-in" style="display:flex;justify-content:center;align-items:center;padding:var(--space-xl) 0;">
            <div class="card">
                <div class="login-logo" style="text-align:center; font-size:3rem; margin-bottom:var(--space-md);">⚽</div>
                <h1 class="auth-title">${t('login_title')}</h1>
                <p class="auth-subtitle">${t('login_subtitle')}</p>
                ${authControls}
            </div>
        </div>
    `;

    return {
        html,
        init: () => {
            document.getElementById('google-signin-btn')?.addEventListener('click', signIn);
        },
    };
}

export function registerPage() {
    return loginPage();
}
