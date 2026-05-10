import { clerk } from '../auth.js';
import { renderNavbar, clearUserCache } from '../components/navbar.js';

export function loginPage() {
    if (clerk.user) {
        setTimeout(() => { window.location.hash = '#/'; }, 0);
        return { html: '<div class="spinner"></div>' };
    }
    const html = `
        <div class="auth-container fade-in" style="display: flex; justify-content: center; align-items: center; min-height: 80vh;">
            <div id="sign-in-container"></div>
        </div>
    `;

    return {
        html,
        init: () => {
            const container = document.getElementById('sign-in-container');
            if (container) {
                clerk.mountSignIn(container, {
                    forceRedirectUrl: '/'
                });
            }
            
            return () => {
                const currentContainer = document.getElementById('sign-in-container');
                if (currentContainer) {
                    try { clerk.unmountSignIn(currentContainer); } catch (e) {}
                }
            };
        },
    };
}

export function registerPage() {
    return loginPage();
}
