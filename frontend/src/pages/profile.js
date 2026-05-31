import { fetchAPI, isAuthenticated } from '../api.js';
import { getCurrentUser } from '../components/navbar.js';
import { renderMatchCard } from '../components/matchCard.js';
import { getFlagURL } from '../components/flags.js';
import { t } from '../i18n.js';

export async function profilePage() {
    if (!isAuthenticated()) {
        location.hash = '#/login';
        return '';
    }

    const FILTERS = [
        { label: t('matches_filter_all'), type: 'all', val: 'All' },
        ...['A','B','C','D','E','F','G','H','I','J','K','L'].map(g => ({ label: t('matches_filter_grp', { group: g }), type: 'group', val: g })),
        { label: t('matches_filter_thirds'), type: 'thirds', val: 'thirds' },
        { label: t('matches_filter_r32'), type: 'stage', val: 'Round of 32' },
        { label: t('matches_filter_r16'), type: 'stage', val: 'Round of 16' },
        { label: t('matches_filter_qf'), type: 'stage', val: 'Quarter-finals' },
        { label: t('matches_filter_sf'), type: 'stage', val: 'Semi-finals' },
        { label: t('matches_filter_thirdplace'), type: 'stage', val: 'Third-place' },
        { label: t('matches_filter_final'), type: 'stage', val: 'Final' },
    ];
    
    const PREDICTION_FILTERS = [
        { label: t('matches_pred_filter_all') || 'All', val: 'all' },
        { label: t('matches_pred_filter_with') || 'With Prediction', val: 'with' },
        { label: t('matches_pred_filter_without') || 'Without Prediction', val: 'without' }
    ];

    let user, matches;
    try {
        user = await getCurrentUser();
        if (!user) throw new Error('User data not found');

        // Use the public profile stats too
        const [m, p] = await Promise.all([
            fetchAPI(`/matches?username=${encodeURIComponent(user.username)}`),
            fetchAPI(`/users/${encodeURIComponent(user.username)}`)
        ]);
        matches = m;
        // Merge public stats into user object
        user = { ...user, ...p };
    } catch (e) {
        return `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">${t(e.message)}</div></div>`;
    }

    const initial = user.username.charAt(0).toUpperCase();

    const tabs = FILTERS.map((f, i) =>
        `<button class="group-tab ${i === 0 ? 'active' : ''}" data-type="${f.type}" data-val="${f.val}">${f.label}</button>`
    ).join('');
    
    const predTabs = PREDICTION_FILTERS.map((f, i) =>
        `<button class="group-tab pred-tab ${i === 0 ? 'active' : ''}" data-val="${f.val}">${f.label}</button>`
    ).join('');

    const html = `
        <div class="fade-in" id="profile-page-container">
            <div class="user-profile-header">
                <div class="user-profile-avatar">${initial}</div>
                <div class="user-profile-info">
                    <h1 class="user-profile-name">${user.username}</h1>
                    <p class="user-profile-username">@${user.username} · ${t('profile_joined', { date: new Date(user.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) })}</p>
                </div>
            </div>

            <!-- Stats bar -->
            <div class="profile-stats user-profile-stats">
                <div class="profile-stat-card">
                    <div class="profile-stat-value"><span class="stat-number">${user.total_points || 0}</span></div>
                    <div class="profile-stat-label">${t('leaderboard_th_points')}</div>
                </div>
                <div class="profile-stat-card">
                    <div class="profile-stat-value">🎯 <span class="stat-number">${user.exact_scores || 0}</span></div>
                    <div class="profile-stat-label">${t('leaderboard_th_exact')}</div>
                </div>
                <div class="profile-stat-card">
                    <div class="profile-stat-value">✓ <span class="stat-number">${user.correct_outcomes || 0}</span></div>
                    <div class="profile-stat-label">${t('leaderboard_th_correct')}</div>
                </div>
                <div class="profile-stat-card">
                    <div class="profile-stat-value">🔮 <span class="stat-number">${user.predictions_count || 0}</span></div>
                    <div class="profile-stat-label">${t('leaderboard_th_preds')}</div>
                </div>
            </div>

            <h2 style="margin-bottom: var(--space-md); margin-top: var(--space-xl)">
                <span style="background:linear-gradient(135deg, var(--accent-purple), var(--accent-cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">
                    🔮 ${t('profile_preds_title')}
                </span>
            </h2>

            <div class="group-tabs" id="user-group-tabs" style="margin-bottom: var(--space-sm)">
                ${tabs}
            </div>
            
            <div class="group-tabs" id="user-pred-tabs" style="margin-bottom: var(--space-lg); padding: 4px; background: rgba(0,0,0,0.05); border-radius: var(--radius-lg); display: inline-flex;">
                ${predTabs}
            </div>

            <div id="user-standings-container"></div>

            <div class="matches-grid" id="user-matches-grid"></div>

            <div class="card danger-zone" style="margin-top:var(--space-2xl); margin-bottom:var(--space-2xl); border: 1px solid rgba(239, 68, 68, 0.2); background:rgba(239, 68, 68, 0.05); padding:var(--space-lg); border-radius:var(--radius-lg)">
                <h3 style="color:var(--accent-red); margin-top:0">${t('profile_delete_title')}</h3>
                <p style="font-size:1.1rem; color:var(--text-secondary); margin-bottom:var(--space-md)">
                    ${t('profile_delete_desc')}
                </p>
                <button id="btn-delete-account" class="btn" style="background:var(--accent-red); color:white; border:none; padding:8px 16px; border-radius:var(--radius-md); font-weight:600; cursor:pointer">
                    ${t('profile_delete_btn')}
                </button>
            </div>
        </div>
    `;

    return {
        html,
        init: () => {
            const grid = document.getElementById('user-matches-grid');
            const tabsContainer = document.getElementById('user-group-tabs');
            const predTabsContainer = document.getElementById('user-pred-tabs');
            
            const deleteBtn = document.getElementById('btn-delete-account');

            deleteBtn?.addEventListener('click', async () => {
                if (confirm(t('profile_delete_confirm'))) {
                    try {
                        await fetchAPI('/me', { method: 'DELETE' });
                        alert(t('profile_delete_success'));
                        window.location.href = '/'; 
                    } catch (err) {
                        alert(t(err.message));
                    }
                }
            });

            let currentFilterType = 'all';
            let currentFilterVal = 'All';
            let currentPredFilter = 'all';

            const renderMatches = async () => {
                const standingsContainer = document.getElementById('user-standings-container');
                standingsContainer.innerHTML = '';

                let filtered = matches;
                if (currentFilterType === 'group') {
                    filtered = matches.filter(m => m.group_letter === currentFilterVal);
                    try {
                        const stds = await fetchAPI(`/standings/${currentFilterVal}?username=${encodeURIComponent(user.username)}`);
                        standingsContainer.innerHTML = `
                            <div class="card" style="margin-bottom:var(--space-lg); overflow-x:auto">
                                <table class="standings-table" style="width:100%">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>${t('standings_th_team')}</th>
                                            <th>${t('standings_th_mp')}</th>
                                            <th>${t('standings_th_w')}</th>
                                            <th>${t('standings_th_d')}</th>
                                            <th>${t('standings_th_l')}</th>
                                            <th>${t('standings_th_gd')}</th>
                                            <th>${t('standings_th_pts')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${stds.map((s, i) => `
                                            <tr>
                                                <td>${i + 1}</td>
                                                <td>
                                                    <div style="display:flex;align-items:center;gap:8px">
                                                        <img src="${getFlagURL(s.team.code)}" style="width:20px;height:14px;border-radius:2px">
                                                        ${s.team.name}
                                                    </div>
                                                </td>
                                                <td>${s.played}</td>
                                                <td>${s.won}</td>
                                                <td>${s.drawn}</td>
                                                <td>${s.lost}</td>
                                                <td>${s.goal_difference}</td>
                                                <td><strong>${s.points}</strong></td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                                <div style="padding:10px; font-size:0.95rem; color:var(--text-muted); border-top:1px solid var(--border-subtle)">
                                    ℹ️ ${t('matches_standings_legend_user_predicted', { name: user.username })}
                                </div>
                            </div>
                        `;
                    } catch (err) { console.error(err); }
                } else if (currentFilterType === 'stage') {
                    filtered = matches.filter(m => m.stage === currentFilterVal);
                } else if (currentFilterType === 'thirds') {
                    filtered = matches.filter(m => m.stage === 'Group Stage' && m.group_letter === null);
                }

                if (currentPredFilter === 'with') {
                    filtered = filtered.filter(m => m.user_prediction != null);
                } else if (currentPredFilter === 'without') {
                    filtered = filtered.filter(m => m.user_prediction == null);
                }
                
                // Sort: Move predicted matches to the top (first), ordered by date ascending
                filtered.sort((a, b) => {
                    const aHasPred = a.user_prediction != null;
                    const bHasPred = b.user_prediction != null;
                    if (aHasPred && !bHasPred) return -1;
                    if (!aHasPred && bHasPred) return 1;
                    return new Date(a.match_date) - new Date(b.match_date); 
                });

                if (filtered.length === 0) {
                    grid.innerHTML = `
                        <div class="empty-state" style="grid-column:1/-1">
                            <div class="empty-state-icon">📭</div>
                            <div class="empty-state-text">${t('matches_no_matches')}</div>
                        </div>
                    `;
                } else {
                    grid.innerHTML = filtered.map(m => renderMatchCard(m)).join('');
                }
            };

            tabsContainer?.addEventListener('click', (e) => {
                const tab = e.target.closest('.group-tab');
                if (!tab) return;
                tabsContainer.querySelectorAll('.group-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                currentFilterType = tab.dataset.type;
                currentFilterVal = tab.dataset.val;
                renderMatches();
            });

            predTabsContainer?.addEventListener('click', (e) => {
                const tab = e.target.closest('.pred-tab');
                if (!tab) return;
                predTabsContainer.querySelectorAll('.pred-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                currentPredFilter = tab.dataset.val;
                renderMatches();
            });

            renderMatches();
        }
    };
}

