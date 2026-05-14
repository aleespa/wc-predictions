import './styles/index.css';
import { initAuth } from './auth.js';
import { registerRoute, initRouter } from './router.js';
import { renderNavbar } from './components/navbar.js';
import { homePage } from './pages/home.js';
import { loginPage, registerPage } from './pages/login.js';
import { matchesPage } from './pages/matches.js';
import { predictPage } from './pages/predict.js';
import { profilePage } from './pages/profile.js';
import { adminPage } from './pages/admin.js';
import { bracketPage } from './pages/bracket.js';
import { communityPage, joinCommunityPage } from './pages/community.js';
import { userProfilePage } from './pages/userProfile.js';
import { onboardingPage } from './pages/onboarding.js';

// Register all routes
registerRoute('/', homePage);
registerRoute('/login', loginPage);
registerRoute('/register', registerPage);
registerRoute('/matches', matchesPage);
registerRoute('/predict/:id', predictPage);
registerRoute('/profile', profilePage);
registerRoute('/admin', adminPage);
registerRoute('/bracket', bracketPage);
registerRoute('/community', communityPage);
registerRoute('/join/:code', joinCommunityPage);
registerRoute('/user/:username', userProfilePage);
registerRoute('/onboarding', onboardingPage);

// Initialize
async function start() {
    // CRITICAL: Wait for auth to resolve before starting the router
    // to prevent infinite redirect loops caused by the route guard.
    await initAuth();

    renderNavbar();
    initRouter();
}

// Start the app
start();

// Re-render navbar on hash change
window.addEventListener('hashchange', () => {
    renderNavbar();
});

