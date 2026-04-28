import { fetchAPI, setToken } from '../api.js';
import { showToast } from '../components/toast.js';
import { renderNavbar, clearUserCache } from '../components/navbar.js';

export function loginPage() {
    const html = `
        <div class="auth-container fade-in">
            <div class="card">
                <h2 class="auth-title">Welcome Back</h2>
                <p class="auth-subtitle">Log in to manage your predictions</p>
                <form id="login-form">
                    <div class="form-group">
                        <label class="form-label" for="login-username">Username</label>
                        <input class="form-input" type="text" id="login-username" placeholder="Enter your username" required autocomplete="username" />
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="login-password">Password</label>
                        <input class="form-input" type="password" id="login-password" placeholder="Enter your password" required autocomplete="current-password" />
                    </div>
                    <div id="login-error" class="form-error" style="margin-bottom:var(--space-md)"></div>
                    <button class="btn btn-primary" type="submit" style="width:100%" id="login-submit">Log In</button>
                </form>
                <div class="auth-switch">
                    Don't have an account? <a onclick="location.hash='#/register'">Sign up</a>
                </div>
            </div>
        </div>
    `;

    return {
        html,
        init: () => {
            const form = document.getElementById('login-form');
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const errorEl = document.getElementById('login-error');
                const submitBtn = document.getElementById('login-submit');
                errorEl.textContent = '';
                submitBtn.disabled = true;
                submitBtn.textContent = 'Logging in...';

                try {
                    const data = await fetchAPI('/login', {
                        method: 'POST',
                        body: JSON.stringify({
                            username: document.getElementById('login-username').value,
                            password: document.getElementById('login-password').value,
                        }),
                    });
                    setToken(data.access_token);
                    clearUserCache();
                    renderNavbar();
                    showToast('Welcome back! 🎉');
                    location.hash = '#/matches';
                } catch (err) {
                    errorEl.textContent = err.message;
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Log In';
                }
            });
        },
    };
}

export function registerPage() {
    const html = `
        <div class="auth-container fade-in">
            <div class="card">
                <h2 class="auth-title">Create Account</h2>
                <p class="auth-subtitle">Join the World Cup predictions league</p>
                <form id="register-form">
                    <div class="form-group">
                        <label class="form-label" for="reg-username">Username</label>
                        <input class="form-input" type="text" id="reg-username" placeholder="Choose a username" required minlength="3" maxlength="50" autocomplete="username" />
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="reg-display">Display Name</label>
                        <input class="form-input" type="text" id="reg-display" placeholder="How others see you (optional)" autocomplete="name" />
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="reg-password">Password</label>
                        <input class="form-input" type="password" id="reg-password" placeholder="At least 4 characters" required minlength="4" autocomplete="new-password" />
                    </div>
                    <div id="register-error" class="form-error" style="margin-bottom:var(--space-md)"></div>
                    <button class="btn btn-primary" type="submit" style="width:100%" id="register-submit">Create Account</button>
                </form>
                <div class="auth-switch">
                    Already have an account? <a onclick="location.hash='#/login'">Log in</a>
                </div>
            </div>
        </div>
    `;

    return {
        html,
        init: () => {
            const form = document.getElementById('register-form');
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const errorEl = document.getElementById('register-error');
                const submitBtn = document.getElementById('register-submit');
                errorEl.textContent = '';
                submitBtn.disabled = true;
                submitBtn.textContent = 'Creating account...';

                try {
                    const data = await fetchAPI('/register', {
                        method: 'POST',
                        body: JSON.stringify({
                            username: document.getElementById('reg-username').value,
                            password: document.getElementById('reg-password').value,
                            display_name: document.getElementById('reg-display').value || null,
                        }),
                    });
                    setToken(data.access_token);
                    clearUserCache();
                    renderNavbar();
                    showToast('Account created! Welcome! 🎉');
                    location.hash = '#/matches';
                } catch (err) {
                    errorEl.textContent = err.message;
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Create Account';
                }
            });
        },
    };
}
