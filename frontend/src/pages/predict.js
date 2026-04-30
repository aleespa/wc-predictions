import { fetchAPI, isAuthenticated } from '../api.js';
import { showToast } from '../components/toast.js';
import { getFlagURL } from '../components/flags.js';
import { t } from '../i18n.js';

export async function predictPage(params) {
    const matchId = params.id;
    const authed = isAuthenticated();

    let match;
    try {
        match = await fetchAPI(`/matches/${matchId}`);
    } catch (e) {
        return `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">${e.message}</div></div>`;
    }

    const matchDate = new Date(match.match_date);
    const now = new Date();
    const isLocked = matchDate <= now || match.is_finished;
    const teamsKnown = match.home_team && match.away_team;

    const existingPred = match.user_prediction;
    const homeScore = existingPred ? existingPred.predicted_home_score : '';
    const awayScore = existingPred ? existingPred.predicted_away_score : '';

    const dateStr = matchDate.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
    const timeStr = matchDate.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit'
    });

    let resultSection = '';
    if (match.is_finished) {
        let pointsBadge = '';
        if (existingPred) {
            const pts = existingPred.points_awarded;
            let color = 'var(--accent-red)';
            let label = t('predict_wrong');
            if (pts === 5) { color = 'var(--accent-gold)'; label = t('predict_exact'); }
            else if (pts === 3) { color = 'var(--accent-green)'; label = t('predict_gd'); }
            else if (pts === 1) { color = 'var(--accent-blue)'; label = t('predict_correct'); }
            pointsBadge = `
                <div style="margin-top:var(--space-lg);padding:var(--space-lg);background:var(--bg-glass);border-radius:var(--radius-lg);text-align:center">
                    <div style="font-size:0.8rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">${t('predict_your_pred')}</div>
                    <div style="font-size:1.5rem;font-weight:800;margin:var(--space-sm) 0">${existingPred.predicted_home_score} — ${existingPred.predicted_away_score}</div>
                    <div style="font-size:1.2rem;font-weight:700;color:${color}">${pts} ${t('common_pts')} · ${label}</div>
                </div>
            `;
        }
        resultSection = `
            <div style="text-align:center;margin:var(--space-xl) 0">
                <div style="font-size:0.8rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:var(--space-sm)">${t('predict_final_score')}</div>
                <div style="font-size:2.5rem;font-weight:900">${match.home_score} — ${match.away_score}</div>
            </div>
            ${pointsBadge}
        `;
    }

    // Build the prediction form section
    let formSection = '';
    if (match.is_finished) {
        formSection = resultSection;
    } else if (!teamsKnown) {
        // Knockout match where teams are not yet determined
        const homeLabel = match.home_slot || 'TBD';
        const awayLabel = match.away_slot || 'TBD';
        formSection = `
            <div class="score-input-container">
                <div class="score-input-team">
                    <span class="match-team-name" style="color:var(--text-muted);font-style:italic">${homeLabel}</span>
                </div>
                <div class="match-vs">
                    <span class="match-vs-label">VS</span>
                </div>
                <div class="score-input-team">
                    <span class="match-team-name" style="color:var(--text-muted);font-style:italic">${awayLabel}</span>
                </div>
            </div>
            <div style="text-align:center;padding:var(--space-xl);margin-top:var(--space-md);background:var(--bg-glass);border-radius:var(--radius-lg);border:1px dashed var(--border-medium)">
                <div style="font-size:1.5rem;margin-bottom:var(--space-sm)">🏆</div>
                <div style="font-weight:600;margin-bottom:var(--space-sm)">${t('predict_tbd')}</div>
                <div style="font-size:0.85rem;color:var(--text-muted)">
                    ${t('predict_tbd_sub')}
                </div>
            </div>
        `;
    } else if (!authed) {
        // Show login prompt for unauthenticated users
        formSection = `
            <div class="score-input-container">
                <div class="score-input-team">
                    <img src="${getFlagURL(match.home_team.code)}" class="match-team-flag-svg" />
                    <span class="match-team-name">${match.home_team.name}</span>
                </div>
                <div class="match-vs">
                    <span class="match-vs-label">VS</span>
                </div>
                <div class="score-input-team">
                    <img src="${getFlagURL(match.away_team.code)}" class="match-team-flag-svg" />
                    <span class="match-team-name">${match.away_team.name}</span>
                </div>
            </div>

            <div style="text-align:center;padding:var(--space-xl);margin-top:var(--space-md);background:var(--bg-glass);border-radius:var(--radius-lg);border:1px dashed var(--border-medium)">
                <div style="font-size:1.5rem;margin-bottom:var(--space-sm)">🔮</div>
                <div style="font-weight:600;margin-bottom:var(--space-sm)">${t('predict_login_title')}</div>
                <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:var(--space-lg)">${t('predict_login_sub')}</div>
                <div style="display:flex;gap:var(--space-md);justify-content:center;flex-wrap:wrap">
                    <a href="#/register" class="btn btn-primary">${t('predict_signup_btn')}</a>
                    <a href="#/login" class="btn btn-secondary">${t('predict_login_btn')}</a>
                </div>
            </div>
        `;
    } else {
        // Show prediction form for authenticated users
        formSection = `
            <form id="predict-form">
                <div class="score-input-container">
                    <div class="score-input-team">
                        <img src="${getFlagURL(match.home_team.code)}" class="match-team-flag-svg" />
                        <span class="match-team-name">${match.home_team.name}</span>
                        <input type="number" class="score-input-field" id="home-score" min="0" max="20"
                            value="${homeScore}" placeholder="0" ${isLocked ? 'disabled' : ''} required />
                    </div>
                    <span class="score-input-separator">—</span>
                    <div class="score-input-team">
                        <img src="${getFlagURL(match.away_team.code)}" class="match-team-flag-svg" />
                        <span class="match-team-name">${match.away_team.name}</span>
                        <input type="number" class="score-input-field" id="away-score" min="0" max="20"
                            value="${awayScore}" placeholder="0" ${isLocked ? 'disabled' : ''} required />
                    </div>
                </div>

                ${isLocked ? `
                    <div class="empty-state" style="padding:var(--space-lg)">
                        <div style="color:var(--accent-red);font-weight:600">${t('predict_locked')}</div>
                    </div>
                ` : `
                    <div class="points-preview">
                        <div class="points-preview-title">${t('predict_pts_earn')}</div>
                        <div class="points-preview-grid">
                            <div class="points-preview-item">
                                <div class="points-preview-value" style="color:var(--accent-gold)">5</div>
                                <div class="points-preview-label">${t('home_exact_score')}</div>
                            </div>
                            <div class="points-preview-item">
                                <div class="points-preview-value" style="color:var(--accent-green)">3</div>
                                <div class="points-preview-label">${t('home_result_gd')}</div>
                            </div>
                            <div class="points-preview-item">
                                <div class="points-preview-value" style="color:var(--accent-blue)">1</div>
                                <div class="points-preview-label">${t('home_correct_outcome')}</div>
                            </div>
                        </div>
                    </div>

                    <button class="btn btn-primary btn-lg" type="submit" style="width:100%;margin-top:var(--space-lg)" id="predict-submit">
                        ${existingPred ? t('predict_btn_update') : t('predict_btn_submit')}
                    </button>
                `}
            </form>
        `;
    }

    const backTarget = match.group_letter ? '#/matches' : '#/bracket';
    const backLabel = match.group_letter ? t('predict_back_matches') : t('predict_back_bracket');

    const html = `
        <div class="predict-container fade-in">
            <button class="btn btn-secondary btn-sm" onclick="location.hash='${backTarget}'" style="margin-bottom:var(--space-lg)">${backLabel}</button>

            <div class="card">
                <div class="match-card-header" style="margin-bottom:var(--space-sm)">
                    <span class="match-group-badge">${match.group_letter ? t('stage_group', { group: match.group_letter }) : t('stage_' + match.stage.toLowerCase().replace(/[^a-z0-9]/g, '')) || match.stage}</span>
                    <span class="match-status ${match.is_finished ? 'finished' : 'upcoming'}">${match.is_finished ? t('predict_status_finished') : t('predict_status_upcoming')}</span>
                </div>

                <div class="predict-info">
                    <div class="match-date">${dateStr} · ${timeStr}</div>
                    <div class="match-venue" style="white-space:normal">📍 ${match.venue || 'TBD'}</div>
                </div>

                ${formSection}
            </div>
        </div>
    `;

    return {
        html,
        init: () => {
            if (!authed || isLocked || match.is_finished) return;

            const form = document.getElementById('predict-form');
            form?.addEventListener('submit', async (e) => {
                e.preventDefault();
                const submitBtn = document.getElementById('predict-submit');
                submitBtn.disabled = true;
                submitBtn.textContent = t('btn_saving');

                try {
                    await fetchAPI('/predictions', {
                        method: 'POST',
                        body: JSON.stringify({
                            match_id: parseInt(matchId),
                            predicted_home_score: parseInt(document.getElementById('home-score').value),
                            predicted_away_score: parseInt(document.getElementById('away-score').value),
                        }),
                    });
                    showToast(t('toast_pred_saved'));
                    location.hash = match.group_letter ? '#/matches' : '#/bracket';
                } catch (err) {
                    showToast(err.message, 'error');
                    submitBtn.disabled = false;
                    submitBtn.textContent = existingPred ? t('predict_btn_update') : t('predict_btn_submit');
                }
            });
        },
    };
}
