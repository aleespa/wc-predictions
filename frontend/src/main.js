import './styles/index.css';
import { initAuth, clerk } from './auth.js';
import { registerRoute, initRouter, handleRoute } from './router.js';
import { renderNavbar } from './components/navbar.js';
import { homePage } from './pages/home.js';
import { loginPage, registerPage } from './pages/login.js';
import { matchesPage } from './pages/matches.js';
import { predictPage } from './pages/predict.js';
import { leaderboardPage } from './pages/leaderboard.js';
import { profilePage } from './pages/profile.js';
import { adminPage } from './pages/admin.js';
import { bracketPage } from './pages/bracket.js';
import { communityPage } from './pages/community.js';

// Register all routes
registerRoute('/', homePage);
registerRoute('/login', loginPage);
registerRoute('/register', registerPage);
registerRoute('/matches', matchesPage);
registerRoute('/predict/:id', predictPage);
registerRoute('/leaderboard', leaderboardPage);
registerRoute('/profile', profilePage);
registerRoute('/admin', adminPage);
registerRoute('/bracket', bracketPage);
registerRoute('/community', communityPage);

// Initialize
async function start() {
    await initAuth();
    renderNavbar();
    initRouter();

    // Re-render everything if the user auth state changes (e.g. login/logout)
    clerk.addListener(({ user }) => {
        renderNavbar();
        handleRoute(); 
    });
}

start();

// Re-render navbar on hash change
window.addEventListener('hashchange', () => {
    renderNavbar();
});
