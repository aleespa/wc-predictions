import './styles/index.css';
import { initAuth, clerk } from './auth.js';
import { registerRoute, initRouter, handleRoute } from './router.js';
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

// Initialize
async function start() {
    await initAuth();
    renderNavbar();
    initRouter();

    // Re-render everything only if the user actually changes (login/logout)
    let lastUserId = clerk.user?.id;
    clerk.addListener(({ user }) => {
        if (user?.id !== lastUserId) {
            lastUserId = user?.id;
            console.log("Auth state changed, re-rendering...");
            renderNavbar();
            handleRoute(); 
        }
    });
}

start();

// Re-render navbar on hash change
window.addEventListener('hashchange', () => {
    renderNavbar();
});

// Re-render when language changes
window.addEventListener('languagechange', () => {
    renderNavbar();
    handleRoute();
});
