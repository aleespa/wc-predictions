import './styles/index.css';
import { registerRoute, initRouter } from './router.js';
import { renderNavbar } from './components/navbar.js';
import { homePage } from './pages/home.js';
import { loginPage, registerPage } from './pages/login.js';
import { matchesPage } from './pages/matches.js';
import { predictPage } from './pages/predict.js';
import { leaderboardPage } from './pages/leaderboard.js';
import { profilePage } from './pages/profile.js';
import { adminPage } from './pages/admin.js';

// Register all routes
registerRoute('/', homePage);
registerRoute('/login', loginPage);
registerRoute('/register', registerPage);
registerRoute('/matches', matchesPage);
registerRoute('/predict/:id', predictPage);
registerRoute('/leaderboard', leaderboardPage);
registerRoute('/profile', profilePage);
registerRoute('/admin', adminPage);

// Initialize
renderNavbar();
initRouter();

// Re-render navbar on hash change (auth state might change)
window.addEventListener('hashchange', () => {
    renderNavbar();
});
