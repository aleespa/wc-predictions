import { fetchAPI } from '../api.js';
import { t } from '../i18n.js';
import { clearUserCache } from '../components/navbar.js';
import { navigate } from '../router.js';

export async function onboardingPage() {
    return {
        html: `
            <div class="login-container">
                <div class="login-card onboarding-card animate-fade-in">
                    <div class="login-header">
                        <div class="login-logo">👋</div>
                        <h1 class="login-title">${t('onboarding_title')}</h1>
                        <p class="login-subtitle">${t('onboarding_subtitle')}</p>
                    </div>

                    <form id="onboarding-form" class="login-form">
                        <div class="form-group">
                            <label for="username" class="form-label">${t('onboarding_username_label')}</label>
                            <input 
                                type="text" 
                                id="username" 
                                class="form-input" 
                                placeholder="${t('onboarding_username_placeholder')}"
                                required 
                                minlength="3" 
                                maxlength="30"
                                pattern="^[a-zA-Z0-9_]+$"
                                title="Only letters, numbers, and underscores allowed"
                            >
                            <p class="form-help">${t('onboarding_username_help')}</p>
                        </div>

                        <div id="onboarding-error" class="login-error" style="display:none"></div>

                        <button type="submit" class="btn btn-primary btn-block" id="onboarding-submit">
                            ${t('onboarding_submit_btn')}
                        </button>
                    </form>
                </div>
            </div>
        `,
        init: () => {
            const form = document.getElementById('onboarding-form');
            const errorEl = document.getElementById('onboarding-error');
            const submitBtn = document.getElementById('onboarding-submit');
            const usernameInput = document.getElementById('username');

            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const username = usernameInput.value.trim();
                if (!username) return;

                errorEl.style.display = 'none';
                submitBtn.disabled = true;
                submitBtn.textContent = t('onboarding_submitting');

                try {
                    await fetchAPI('/me/onboard', {
                        method: 'POST',
                        body: JSON.stringify({ username })
                    });

                    // Clear cache so navbar and other components see the new username
                    clearUserCache();
                    
                    // Redirect to home
                    navigate('/');
                } catch (err) {
                    errorEl.textContent = err.message || 'Failed to save username. Try a different one.';
                    errorEl.style.display = 'block';
                    submitBtn.disabled = false;
                    submitBtn.textContent = t('onboarding_submit_btn');
                }
            });

            return () => {};
        }
    };
}
