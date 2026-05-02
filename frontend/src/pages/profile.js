import { fetchAPI, isAuthenticated } from '../api.js';
import { getCurrentUser, clearUserCache } from '../components/navbar.js';
import { getFlagURL } from '../components/flags.js';
import { showToast } from '../components/toast.js';
import { t } from '../i18n.js';

export async function profilePage() {
    if (!isAuthenticated()) {
        location.hash = '#/login';
        return '';
    }

    let user, predictions;
    try {
        user = await getCurrentUser();
        predictions = await fetchAPI('/predictions/me');
    } catch (e) {
        return `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">${e.message}</div></div>`;
    }

    // Calculate stats
    const totalPoints = predictions.reduce((sum, p) => sum + (p.points_awarded || 0), 0);
    const exactScores = predictions.filter(p => p.points_awarded === 5).length;
    const correctOutcomes = predictions.filter(p => p.points_awarded >= 1).length;
    const finishedPredictions = predictions.filter(p => p.match.is_finished);
    const accuracy = finishedPredictions.length > 0
        ? Math.round((correctOutcomes / finishedPredictions.length) * 100)
        : 0;

    const initial = (user.display_name || user.username).charAt(0).toUpperCase();

    const predictionRows = predictions.map(pred => {
        const match = pred.match;
        const isFinished = match.is_finished;
        const matchDate = new Date(match.match_date);
        const dateStr = matchDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        let pointsBadge = '';
        if (isFinished && pred.points_awarded != null) {
            const pts = pred.points_awarded;
            let badgeClass = 'wrong';
            if (pts === 5) badgeClass = 'exact';
            else if (pts >= 1) badgeClass = 'correct';
            pointsBadge = `<span class="match-prediction-badge ${badgeClass}">${pts} ${t('common_pts')}</span>`;
        } else {
            pointsBadge = `<span class="match-prediction-badge" style="background:var(--bg-glass);color:var(--text-muted)">${t('profile_badge_pending')}</span>`;
        }

        const homeLabel = match.home_team ? match.home_team.code : (match.home_slot || 'TBD');
        const awayLabel = match.away_team ? match.away_team.code : (match.away_slot || 'TBD');
        const homeFlag = match.home_team ? `<img src="${getFlagURL(match.home_team.code)}" class="match-team-flag-svg" style="width:20px; height:14px; margin-right:4px">` : '';
        const awayFlag = match.away_team ? `<img src="${getFlagURL(match.away_team.code)}" class="match-team-flag-svg" style="width:20px; height:14px; margin-left:4px">` : '';

        return `
            <div class="admin-match-row" onclick="location.hash='#/predict/${match.id}'" style="cursor:pointer">
                <span style="width:60px;color:var(--text-muted);font-size:0.8rem">${dateStr}</span>
                <span class="admin-match-teams">
                    ${homeFlag} ${homeLabel}
                    <span style="color:var(--text-muted);margin:0 var(--space-sm)">${isFinished ? match.home_score + ' — ' + match.away_score : 'vs'}</span>
                    ${awayLabel} ${awayFlag}
                </span>
                <span style="font-weight:700;color:var(--text-secondary);min-width:50px;text-align:center">
                    ${pred.predicted_home_score} — ${pred.predicted_away_score}
                </span>
                ${pointsBadge}
            </div>
        `;
    }).join('');

    const html = `
        <div class="fade-in">
            <div class="profile-header">
                <div class="profile-avatar">${initial}</div>
                <div class="profile-info">
                    <h2>${user.display_name || user.username}</h2>
                    <p>@${user.username} · ${t('profile_joined', { date: new Date(user.created_at).toLocaleDateString(t('locale') || 'en-US', { month: 'long', year: 'numeric' }) })}</p>
                </div>
                <button class="btn btn-secondary btn-sm" id="edit-profile-btn" style="margin-left:auto">${t('profile_edit_btn')}</button>
            </div>

            <div id="edit-profile-form-container" style="display:${user.username.startsWith('user_') ? 'block' : 'none'}; margin-bottom:var(--space-xl); padding:var(--space-lg); background:var(--bg-glass); border-radius:var(--radius-lg); border:1px solid var(--border-light); animation: slideDown 0.3s ease-out">
                <h3 style="margin-bottom:var(--space-md)">${user.username.startsWith('user_') ? t('profile_setup_title') || 'Set Your Username' : t('profile_update_title')}</h3>
                <p style="color:var(--text-secondary); font-size:0.85rem; margin-bottom:var(--space-md); display:${user.username.startsWith('user_') ? 'block' : 'none'}">
                    ${t('profile_onboarding_desc') || 'Welcome! Choose a unique username to identify yourself on the leaderboard.'}
                </p>
                <form id="edit-profile-form" style="display:grid; gap:var(--space-md)">
                    <div style="display:${user.username.startsWith('user_') ? 'none' : 'block'}">
                        <label class="form-label">${t('profile_label_display')}</label>
                        <input type="text" id="edit-display-name" class="form-input" value="${user.display_name || ''}" placeholder="${t('profile_placeholder_display')}" ${user.username.startsWith('user_') ? '' : 'required'}>
                    </div>
                    <div>
                        <label class="form-label">${t('profile_label_username')}</label>
                        <input type="text" id="edit-username" class="form-input" value="${user.username.startsWith('user_') ? '' : user.username}" placeholder="${t('profile_placeholder_username')}" required>
                        <small style="color:var(--text-muted); font-size:0.75rem">${t('profile_username_hint')}</small>
                    </div>
                    <div style="display:flex; gap:var(--space-md); margin-top:var(--space-sm)">
                        <button type="submit" class="btn btn-primary btn-sm" id="save-profile-btn">${user.username.startsWith('user_') ? t('profile_btn_complete') || 'Complete Setup' : t('profile_btn_save')}</button>
                        <button type="button" class="btn btn-secondary btn-sm" id="cancel-edit-btn" ${user.username.startsWith('user_') ? 'disabled style="display:none"' : ''}>${t('profile_btn_cancel')}</button>
                    </div>
                </form>
            </div>

            <div class="profile-stats">
                <div class="profile-stat-card">
                    <div class="profile-stat-value">${totalPoints}</div>
                    <div class="profile-stat-label">${t('profile_stat_points')}</div>
                </div>
                <div class="profile-stat-card">
                    <div class="profile-stat-value">${predictions.length}</div>
                    <div class="profile-stat-label">${t('profile_stat_preds')}</div>
                </div>
                <div class="profile-stat-card">
                    <div class="profile-stat-value">${exactScores}</div>
                    <div class="profile-stat-label">${t('profile_stat_exact')}</div>
                </div>
                <div class="profile-stat-card">
                    <div class="profile-stat-value">${accuracy}%</div>
                    <div class="profile-stat-label">${t('profile_stat_accuracy')}</div>
                </div>
            </div>

            <h3 class="page-title" style="font-size:1.3rem;margin-bottom:var(--space-lg)">${t('profile_preds_title')}</h3>

            ${predictions.length === 0 ? `
                <div class="empty-state">
                    <div class="empty-state-icon">🔮</div>
                    <div class="empty-state-text">${t('profile_no_preds')}</div>
                    <a href="#/matches" class="btn btn-primary">${t('leaderboard_start_pred')}</a>
                </div>
            ` : `
                <div>${predictionRows}</div>
            `}

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
            const btn = document.getElementById('edit-profile-btn');
            const container = document.getElementById('edit-profile-form-container');
            const cancelBtn = document.getElementById('cancel-edit-btn');
            const form = document.getElementById('edit-profile-form');

            btn?.addEventListener('click', () => {
                container.style.display = 'block';
            });

            cancelBtn?.addEventListener('click', () => {
                container.style.display = 'none';
            });

            form?.addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = document.getElementById('save-profile-btn');
                const prevText = btn.textContent;
                btn.textContent = 'Saving...';
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
            const deleteBtn = document.getElementById('btn-delete-account');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', async () => {
                    if (confirm(t('profile_delete_confirm'))) {
                        try {
                            await fetchAPI('/me', { method: 'DELETE' });
                            alert(t('profile_delete_success'));
                            // Use window.location.href to fully reload and clear state
                            window.location.href = '/'; 
                        } catch (err) {
                            alert(err.message);
                        }
                    }
                });
            }
        }
    };
}
