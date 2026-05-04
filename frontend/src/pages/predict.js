import { fetchAPI, isAuthenticated } from '../api.js';
import { showToast } from '../components/toast.js';
import { getFlagURL } from '../components/flags.js';
import { t } from '../i18n.js';

export async function predictPage(params) {
    const matchId = params.id;
    const authed = isAuthenticated();

    let match, user;
    try {
        [match, user] = await Promise.all([
            fetchAPI(`/matches/${matchId}`),
            authed ? fetchAPI('/me') : Promise.resolve(null)
        ]);
    } catch (e) {
        return `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">${e.message}</div></div>`;
    }

    const matchDate = new Date(match.match_date);
    const now = new Date();
    const isGroupLocked = user?.is_group_stage_locked && match.stage === 'Group Stage';
    const isLocked = matchDate <= now || match.is_finished || isGroupLocked;
    const teamsKnown = match.home_team && match.away_team;
    const isKnockout = match.stage !== 'Group Stage';
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    const existingPred = match.user_prediction;
    const isInvalid = existingPred && (existingPred.is_invalid || match.is_invalid_prediction);
    const homeScore = existingPred ? existingPred.predicted_home_score : '';
    const awayScore = existingPred ? existingPred.predicted_away_score : '';

    const dateStr = matchDate.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
    const timeStr = matchDate.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit'
    });

    // Teams Header Row (Flags + Names)
    let teamsHeader = '';
    if (teamsKnown) {
        teamsHeader = `
            <div class="prediction-teams-row" style="margin-top:var(--space-md); margin-bottom:var(--space-xl)">
                <div class="prediction-team">
                    <img src="${getFlagURL(match.home_team.code)}" class="match-team-flag-svg" />
                    <span class="match-team-name">${match.home_team.name}</span>
                </div>
                <div class="prediction-vs-label">VS</div>
                <div class="prediction-team">
                    <img src="${getFlagURL(match.away_team.code)}" class="match-team-flag-svg" />
                    <span class="match-team-name">${match.away_team.name}</span>
                </div>
            </div>
        `;
    } else {
        const homeLabel = match.home_slot || 'TBD';
        const awayLabel = match.away_slot || 'TBD';
        teamsHeader = `
            <div class="prediction-teams-row" style="margin-top:var(--space-md); margin-bottom:var(--space-xl)">
                <div class="prediction-team">
                    <span class="match-team-name" style="color:var(--text-muted);font-style:italic">${homeLabel}</span>
                </div>
                <div class="prediction-vs-label">VS</div>
                <div class="prediction-team">
                    <span class="match-team-name" style="color:var(--text-muted);font-style:italic">${awayLabel}</span>
                </div>
            </div>
        `;
    }

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
            ${teamsHeader}
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
        formSection = `
            ${teamsHeader}
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
            ${teamsHeader}
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
                <div class="prediction-form-layout">
                    ${teamsHeader}

                    ${isInvalid ? `
                        <div style="background:rgba(239, 68, 68, 0.1); border:1px solid var(--accent-red); color:var(--accent-red); padding:var(--space-md); border-radius:var(--radius-md); margin-bottom:var(--space-lg); font-size:0.85rem; text-align:center">
                            ⚠️ ${t('predict_invalid_teams')}
                        </div>
                    ` : ''}
                    
                    <div class="prediction-inputs-row">
                        ${isTouch && !isLocked ? `
                            <div class="wheel-picker-container" id="home-score-wheel" data-value="${homeScore || 0}">
                                <div class="wheel-picker-center-highlight"></div>
                                <div class="wheel-picker-scroll">
                                    ${Array.from({length: 21}, (_, i) => `<div class="wheel-picker-item" data-val="${i}">${i}</div>`).join('')}
                                </div>
                                <input type="hidden" id="home-score" value="${homeScore !== '' ? homeScore : 0}" />
                            </div>
                        ` : `
                            <div class="prediction-input-wrapper">
                                <input type="number" class="score-input-field" id="home-score" min="0" max="20"
                                    value="${homeScore}" placeholder="0" ${isLocked ? 'disabled' : ''} required />
                            </div>
                        `}
                        <span class="score-input-separator">—</span>
                        ${isTouch && !isLocked ? `
                            <div class="wheel-picker-container" id="away-score-wheel" data-value="${awayScore || 0}">
                                <div class="wheel-picker-center-highlight"></div>
                                <div class="wheel-picker-scroll">
                                    ${Array.from({length: 21}, (_, i) => `<div class="wheel-picker-item" data-val="${i}">${i}</div>`).join('')}
                                </div>
                                <input type="hidden" id="away-score" value="${awayScore !== '' ? awayScore : 0}" />
                            </div>
                        ` : `
                            <div class="prediction-input-wrapper">
                                <input type="number" class="score-input-field" id="away-score" min="0" max="20"
                                    value="${awayScore}" placeholder="0" ${isLocked ? 'disabled' : ''} required />
                            </div>
                        `}
                    </div>

                    ${isKnockout ? `
                        <div id="penalty-winner-section" style="margin-top:var(--space-xl); display: ${homeScore === awayScore && homeScore !== '' ? 'block' : 'none'}; text-align:center">
                            <div style="font-size:0.8rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:var(--space-md)">${t('predict_penalty_desc')}</div>
                            <div style="display:flex; justify-content:center; gap:var(--space-md)">
                                <button type="button" class="btn penalty-team-btn ${existingPred?.penalty_winner_id === match.home_team.id ? 'active' : ''}" 
                                        data-team-id="${match.home_team.id}" id="pen-winner-home" ${isLocked ? 'disabled' : ''}>
                                    <img src="${getFlagURL(match.home_team.code)}" class="match-team-flag-svg" style="width:24px; height:auto; margin-right:8px"> ${match.home_team.code}
                                </button>
                                <button type="button" class="btn penalty-team-btn ${existingPred?.penalty_winner_id === match.away_team.id ? 'active' : ''}" 
                                        data-team-id="${match.away_team.id}" id="pen-winner-away" ${isLocked ? 'disabled' : ''}>
                                    ${match.away_team.code} <img src="${getFlagURL(match.away_team.code)}" class="match-team-flag-svg" style="width:24px; height:auto; margin-left:8px">
                                </button>
                            </div>
                            <input type="hidden" id="penalty-winner-id" value="${existingPred?.penalty_winner_id || ''}" />
                        </div>
                    ` : ''}
                </div>

                ${isLocked ? `
                    <div class="empty-state" style="padding:var(--space-lg)">
                        <div style="color:var(--accent-red);font-weight:600">
                            ${isGroupLocked ? t('predict_group_locked') : t('predict_locked')}
                        </div>
                    </div>
                ` : `
                    <button class="btn btn-primary btn-lg" type="submit" style="width:100%;margin-top:var(--space-lg)" id="predict-submit">
                        ${existingPred ? t('predict_btn_update') : t('predict_btn_submit')}
                    </button>

                    <div class="points-preview" style="margin-top:var(--space-lg)">
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
            const homeInput = document.getElementById('home-score');
            const awayInput = document.getElementById('away-score');
            const penaltySection = document.getElementById('penalty-winner-section');
            const penWinnerInput = document.getElementById('penalty-winner-id');

            const updatePenaltyUI = () => {
                if (!isKnockout || !penaltySection) return;
                const h = parseInt(homeInput.value);
                const a = parseInt(awayInput.value);
                if (!isNaN(h) && !isNaN(a) && h === a) {
                    penaltySection.style.display = 'block';
                } else {
                    penaltySection.style.display = 'none';
                    penWinnerInput.value = '';
                    document.querySelectorAll('.penalty-team-btn').forEach(b => b.classList.remove('active'));
                }
            };

            const initWheel = (containerId, inputId) => {
                const container = document.getElementById(containerId);
                const input = document.getElementById(inputId);
                const scroll = container?.querySelector('.wheel-picker-scroll');
                const items = container?.querySelectorAll('.wheel-picker-item');
                if (!container || !scroll) return;

                let startY, currentTranslate = 0, prevTranslate = 0;
                const itemHeight = 40;
                
                const updateSelection = (y) => {
                    const index = Math.round(-y / itemHeight);
                    const clampedIndex = Math.max(0, Math.min(20, index));
                    const finalY = -clampedIndex * itemHeight;
                    
                    scroll.style.transform = `translateY(${finalY}px)`;
                    currentTranslate = finalY;
                    prevTranslate = finalY;
                    input.value = clampedIndex;
                    
                    items.forEach((item, idx) => {
                        item.classList.toggle('active', idx === clampedIndex);
                    });
                    updatePenaltyUI();
                };

                // Set initial position
                const initialVal = parseInt(container.dataset.value) || 0;
                updateSelection(-initialVal * itemHeight);

                container.addEventListener('touchstart', (e) => {
                    startY = e.touches[0].clientY;
                    scroll.style.transition = 'none';
                    container.classList.add('focused');
                });

                container.addEventListener('touchmove', (e) => {
                    const y = e.touches[0].clientY;
                    const diff = y - startY;
                    currentTranslate = prevTranslate + diff;
                    // Dampen resistance at edges
                    if (currentTranslate > 20) currentTranslate = 20 + (currentTranslate - 20) * 0.3;
                    if (currentTranslate < -20 * itemHeight - 20) currentTranslate = -20 * itemHeight - 20 + (currentTranslate + 20 * itemHeight + 20) * 0.3;
                    
                    scroll.style.transform = `translateY(${currentTranslate}px)`;
                });

                container.addEventListener('touchend', () => {
                    scroll.style.transition = 'transform 0.15s cubic-bezier(0.2, 0, 0.2, 1)';
                    updateSelection(currentTranslate);
                    container.classList.remove('focused');
                });
            };

            if (isTouch) {
                initWheel('home-score-wheel', 'home-score');
                initWheel('away-score-wheel', 'away-score');
            } else {
                homeInput?.addEventListener('input', updatePenaltyUI);
                awayInput?.addEventListener('input', updatePenaltyUI);
            }

            document.querySelectorAll('.penalty-team-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (isLocked) return;
                    document.querySelectorAll('.penalty-team-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    penWinnerInput.value = btn.dataset.teamId;
                });
            });

            form?.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const h = parseInt(homeInput.value);
                const a = parseInt(awayInput.value);
                
                if (isKnockout && h === a && !penWinnerInput.value) {
                    showToast(t('predict_penalty_desc'), 'warning');
                    return;
                }

                // Confirmation for first knockout prediction
                if (isKnockout && !user?.is_group_stage_locked) {
                    const confirmed = confirm(t('predict_knockout_lock_confirm'));
                    if (!confirmed) return;
                }

                const submitBtn = document.getElementById('predict-submit');
                submitBtn.disabled = true;
                submitBtn.textContent = t('btn_saving');

                try {
                    await fetchAPI('/predictions', {
                        method: 'POST',
                        body: JSON.stringify({
                            match_id: parseInt(matchId),
                            predicted_home_score: h,
                            predicted_away_score: a,
                            predicted_home_team_id: match.home_team ? match.home_team.id : null,
                            predicted_away_team_id: match.away_team ? match.away_team.id : null,
                            penalty_winner_id: penWinnerInput ? parseInt(penWinnerInput.value) || null : null,
                        }),
                    });
                    showToast(t('toast_pred_saved'));
                    
                    // Fetch all matches to find the next unpredicted one
                    let nextMatchToPredict = null;
                    try {
                        const allMatches = await fetchAPI('/matches');
                        const currentIndex = allMatches.findIndex(m => m.id === parseInt(matchId));
                        
                        if (currentIndex !== -1) {
                            for (let i = currentIndex + 1; i < allMatches.length; i++) {
                                const m = allMatches[i];
                                const mDate = new Date(m.match_date);
                                const isMLocked = mDate <= new Date() || m.is_finished || (user?.is_group_stage_locked && m.stage === 'Group Stage');
                                const mTeamsKnown = m.home_team && m.away_team;
                                
                                if (!m.user_prediction && !isMLocked && mTeamsKnown) {
                                    nextMatchToPredict = m;
                                    break;
                                }
                            }
                        }
                    } catch (fetchErr) {
                        console.error("Could not fetch matches to determine next prediction:", fetchErr);
                    }

                    if (nextMatchToPredict) {
                        location.hash = `#/predict/${nextMatchToPredict.id}`;
                    } else {
                        location.hash = match.group_letter ? '#/matches' : '#/bracket';
                    }
                } catch (err) {
                    showToast(err.message, 'error');
                    submitBtn.disabled = false;
                    submitBtn.textContent = existingPred ? t('predict_btn_update') : t('predict_btn_submit');
                }
            });
        },
    };
}
