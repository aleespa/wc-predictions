import { fetchAPI, isAuthenticated } from '../api.js';
import { getCurrentUser, clearUserCache } from '../components/navbar.js';
import { getFlagURL } from '../components/flags.js';
import { showToast } from '../components/toast.js';

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
            pointsBadge = `<span class="match-prediction-badge ${badgeClass}">${pts} pts</span>`;
        } else {
            pointsBadge = '<span class="match-prediction-badge" style="background:var(--bg-glass);color:var(--text-muted)">Pending</span>';
        }

        return `
            <div class="admin-match-row" onclick="location.hash='#/predict/${match.id}'" style="cursor:pointer">
                <span style="width:60px;color:var(--text-muted);font-size:0.8rem">${dateStr}</span>
                <span class="admin-match-teams">
                    <img src="${getFlagURL(match.home_team.code)}" class="match-team-flag-svg" style="width:18px;vertical-align:middle;margin-right:2px"> ${match.home_team.code}
                    <span style="color:var(--text-muted);margin:0 var(--space-sm)">${isFinished ? match.home_score + ' — ' + match.away_score : 'vs'}</span>
                    ${match.away_team.code} <img src="${getFlagURL(match.away_team.code)}" class="match-team-flag-svg" style="width:18px;vertical-align:middle;margin-left:2px">
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
                    <p>@${user.username} · Joined ${new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
                </div>
                <button class="btn btn-secondary btn-sm" id="edit-profile-btn" style="margin-left:auto">Edit Profile</button>
            </div>

            <div id="edit-profile-form-container" style="display:${user.username.startsWith('user_') ? 'block' : 'none'}; margin-bottom:var(--space-xl); padding:var(--space-lg); background:var(--bg-glass); border-radius:var(--radius-lg); border:1px solid var(--border-light); animation: slideDown 0.3s ease-out">
                <h3 style="margin-bottom:var(--space-md)">Update Profile</h3>
                <form id="edit-profile-form" style="display:grid; gap:var(--space-md)">
                    <div>
                        <label class="form-label">Display Name</label>
                        <input type="text" id="edit-display-name" class="form-input" value="${user.display_name || ''}" placeholder="How you want to appear on leaderboard" required>
                    </div>
                    <div>
                        <label class="form-label">Username</label>
                        <input type="text" id="edit-username" class="form-input" value="${user.username.startsWith('user_') ? '' : user.username}" placeholder="unique_username" required>
                        <small style="color:var(--text-muted); font-size:0.75rem">Only letters, numbers, and underscores allowed</small>
                    </div>
                    <div style="display:flex; gap:var(--space-md); margin-top:var(--space-sm)">
                        <button type="submit" class="btn btn-primary btn-sm" id="save-profile-btn">Save Changes</button>
                        <button type="button" class="btn btn-secondary btn-sm" id="cancel-edit-btn" ${user.username.startsWith('user_') ? 'disabled style="display:none"' : ''}>Cancel</button>
                    </div>
                </form>
            </div>

            <div class="profile-stats">
                <div class="profile-stat-card">
                    <div class="profile-stat-value">${totalPoints}</div>
                    <div class="profile-stat-label">Total Points</div>
                </div>
                <div class="profile-stat-card">
                    <div class="profile-stat-value">${predictions.length}</div>
                    <div class="profile-stat-label">Predictions</div>
                </div>
                <div class="profile-stat-card">
                    <div class="profile-stat-value">${exactScores}</div>
                    <div class="profile-stat-label">Exact Scores</div>
                </div>
                <div class="profile-stat-card">
                    <div class="profile-stat-value">${accuracy}%</div>
                    <div class="profile-stat-label">Accuracy</div>
                </div>
            </div>

            <h3 class="page-title" style="font-size:1.3rem;margin-bottom:var(--space-lg)">Your Predictions</h3>

            ${predictions.length === 0 ? `
                <div class="empty-state">
                    <div class="empty-state-icon">🔮</div>
                    <div class="empty-state-text">You haven't made any predictions yet</div>
                    <a href="#/matches" class="btn btn-primary">Start Predicting</a>
                </div>
            ` : `
                <div>${predictionRows}</div>
            `}
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
                    showToast('Profile updated successfully', 'success');
                    clearUserCache();
                    location.reload();
                } catch (err) {
                    showToast(err.message, 'error');
                } finally {
                    btn.textContent = prevText;
                    btn.disabled = false;
                }
            });
        }
    };
}
