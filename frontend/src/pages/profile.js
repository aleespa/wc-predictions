import { fetchAPI, isAuthenticated } from '../api.js';
import { getCurrentUser, clearUserCache } from '../components/navbar.js';
import { renderMatchCard } from '../components/matchCard.js';
import { renderRound } from './bracket.js';
import { getFlagURL } from '../components/flags.js';
import { showToast } from '../components/toast.js';
import { t } from '../i18n.js';

export async function profilePage() {
    if (!isAuthenticated()) {
        location.hash = '#/login';
        return '';
    }

    const FILTERS = [
        { label: t('matches_filter_all'), type: 'all', val: 'All' },
        { label: t('matches_filter_thirds'), type: 'thirds', val: 'thirds' },
        ...['A','B','C','D','E','F','G','H','I','J','K','L'].map(g => ({ label: t('matches_filter_grp', { group: g }), type: 'group', val: g })),
        { label: t('matches_filter_r32'), type: 'stage', val: 'Round of 32' },
        { label: t('matches_filter_r16'), type: 'stage', val: 'Round of 16' },
        { label: t('matches_filter_qf'), type: 'stage', val: 'Quarter-finals' },
        { label: t('matches_filter_sf'), type: 'stage', val: 'Semi-finals' },
        { label: t('matches_filter_final'), type: 'stage', val: 'Final' },
        { label: t('bracket_title') || 'Bracket', type: 'bracket', val: 'bracket' }
    ];
    
    const PREDICTION_FILTERS = [
        { label: t('matches_pred_filter_all') || 'All', val: 'all' },
        { label: t('matches_pred_filter_with') || 'With Prediction', val: 'with' },
        { label: t('matches_pred_filter_without') || 'Without Prediction', val: 'without' }
    ];

    let user, matches, bracket;
    try {
        user = await getCurrentUser();
        // Use the public profile stats too
        const [m, b, p] = await Promise.all([
            fetchAPI(`/matches?username=${encodeURIComponent(user.username)}`),
            fetchAPI(`/knockout/bracket?username=${encodeURIComponent(user.username)}`),
            fetchAPI(`/users/${encodeURIComponent(user.username)}`)
        ]);
        matches = m;
        bracket = b;
        // Merge public stats into user object
        user = { ...user, ...p };
    } catch (e) {
        return `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">${e.message}</div></div>`;
    }

    const initial = (user.display_name || user.username).charAt(0).toUpperCase();

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
                    <h1 class="user-profile-name">${user.display_name || user.username}</h1>
                    <p class="user-profile-username">@${user.username} · ${t('profile_joined', { date: new Date(user.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) })}</p>
                </div>
                <button class="btn btn-secondary btn-sm" id="edit-profile-btn" style="margin-left:auto">${t('profile_edit_btn')}</button>
            </div>

            <div id="edit-profile-form-container" style="display:${user.username.startsWith('user_') ? 'block' : 'none'}; margin-bottom:var(--space-xl); padding:var(--space-lg); background:var(--bg-glass); border-radius:var(--radius-lg); border:1px solid var(--border-light); animation: slideDown 0.3s ease-out">
                <h3 style="margin-bottom:var(--space-md)">${user.username.startsWith('user_') ? t('profile_setup_title') || 'Set Your Username' : t('profile_update_title')}</h3>
                <form id="edit-profile-form" style="display:grid; gap:var(--space-md)">
                    <div style="display:${user.username.startsWith('user_') ? 'none' : 'block'}">
                        <label class="form-label">${t('profile_label_display')}</label>
                        <input type="text" id="edit-display-name" class="form-input" value="${user.display_name || ''}" placeholder="${t('profile_placeholder_display')}">
                    </div>
                    <div>
                        <label class="form-label">${t('profile_label_username')}</label>
                        <input type="text" id="edit-username" class="form-input" value="${user.username.startsWith('user_') ? '' : user.username}" placeholder="${t('profile_placeholder_username')}" required>
                    </div>
                    <div style="display:flex; gap:var(--space-md); margin-top:var(--space-sm)">
                        <button type="submit" class="btn btn-primary btn-sm" id="save-profile-btn">${user.username.startsWith('user_') ? t('profile_btn_complete') || 'Complete Setup' : t('profile_btn_save')}</button>
                        <button type="button" class="btn btn-secondary btn-sm" id="cancel-edit-btn" ${user.username.startsWith('user_') ? 'disabled style="display:none"' : ''}>${t('profile_btn_cancel')}</button>
                    </div>
                </form>
            </div>

            <!-- Stats cards -->
            <div class="profile-stats user-profile-stats">
                <div class="profile-stat-card">
                    <div class="profile-stat-value">${user.total_points || 0}</div>
                    <div class="profile-stat-label">${t('profile_stat_points')}</div>
                </div>
                <div class="profile-stat-card">
                    <div class="profile-stat-value">${user.predictions_count || 0}</div>
                    <div class="profile-stat-label">${t('profile_stat_preds')}</div>
                </div>
                <div class="profile-stat-card">
                    <div class="profile-stat-value">${user.exact_scores || 0}</div>
                    <div class="profile-stat-label">${t('profile_stat_exact')}</div>
                </div>
                <div class="profile-stat-card">
                    <div class="profile-stat-value">${user.accuracy || 0}%</div>
                    <div class="profile-stat-label">${t('profile_stat_accuracy')}</div>
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
                <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:var(--space-md)">
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
            
            // Profile edit listeners
            const editBtn = document.getElementById('edit-profile-btn');
            const editContainer = document.getElementById('edit-profile-form-container');
            const cancelEditBtn = document.getElementById('cancel-edit-btn');
            const editForm = document.getElementById('edit-profile-form');
            const deleteBtn = document.getElementById('btn-delete-account');

            editBtn?.addEventListener('click', () => editContainer.style.display = 'block');
            cancelEditBtn?.addEventListener('click', () => editContainer.style.display = 'none');
            
            editForm?.addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = document.getElementById('save-profile-btn');
                const prevText = btn.textContent;
                btn.textContent = t('btn_saving');
                btn.disabled = true;

                const displayName = document.getElementById('edit-display-name').value;
                const username = document.getElementById('edit-username').value;

                try {
                    await fetchAPI('/me', {
                        method: 'PUT',
                        body: JSON.stringify({ display_name: displayName, username: username })
                    });
                    showToast(t('toast_prof_updated'), 'success');
                    clearUserCache();
                    location.reload();
                } catch (err) {
                    showToast(err.message, 'error');
                } finally {
                    btn.textContent = prevText;
                    btn.disabled = false;
                }
            });

            deleteBtn?.addEventListener('click', async () => {
                if (confirm(t('profile_delete_confirm'))) {
                    try {
                        await fetchAPI('/me', { method: 'DELETE' });
                        alert(t('profile_delete_success'));
                        window.location.href = '/'; 
                    } catch (err) {
                        alert(err.message);
                    }
                }
            });

            let currentFilterType = 'all';
            let currentFilterVal = 'All';
            let currentPredFilter = 'all';

            const renderMatches = async () => {
                const standingsContainer = document.getElementById('user-standings-container');
                standingsContainer.innerHTML = '';

                if (currentFilterType === 'bracket') {
                    grid.innerHTML = '';
                    const predictedCount = [
                        ...(bracket.round_of_32 || []),
                        ...(bracket.round_of_16 || []),
                        ...(bracket.quarter_finals || []),
                        ...(bracket.semi_finals || []),
                        ...(bracket.third_place ? [bracket.third_place] : []),
                        ...(bracket.final ? [bracket.final] : []),
                    ].filter(m => m.user_prediction).length;

                    grid.innerHTML = `
                        <div class="card" style="grid-column: 1/-1; padding: var(--space-xl);">
                            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: var(--space-lg)">
                                <h3 style="margin:0">${t('bracket_title')}</h3>
                                <div style="font-size:0.85rem; color:var(--text-muted)">
                                    ${t('matches_standings_legend_user_predicted', { name: user.display_name || user.username })}: <strong>${predictedCount}</strong>
                                </div>
                            </div>
                            <div class="bracket-container">
                                ${renderRound(t('stage_roundof32'), bracket.round_of_32, { profileName: user.display_name || user.username })}
                                ${renderRound(t('stage_roundof16'), bracket.round_of_16, { profileName: user.display_name || user.username })}
                                ${renderRound(t('stage_quarterfinals'), bracket.quarter_finals, { profileName: user.display_name || user.username })}
                                ${renderRound(t('stage_semifinals'), bracket.semi_finals, { profileName: user.display_name || user.username })}
                                ${bracket.third_place ? renderRound(t('stage_thirdplace'), [bracket.third_place], { profileName: user.display_name || user.username }) : ''}
                                ${bracket.final ? renderRound(t('stage_final'), [bracket.final], { profileName: user.display_name || user.username }) : ''}
                            </div>
                        </div>
                    `;
                    return;
                }

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
                                            <th>P</th>
                                            <th>W</th>
                                            <th>D</th>
                                            <th>L</th>
                                            <th>GD</th>
                                            <th>Pts</th>
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
                                <div style="padding:10px; font-size:0.7rem; color:var(--text-muted); border-top:1px solid var(--border-subtle)">
                                    ℹ️ ${t('matches_standings_legend_user_predicted', { name: user.display_name || user.username })}
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

