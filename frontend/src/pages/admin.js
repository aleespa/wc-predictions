import { fetchAPI, isAuthenticated } from '../api.js';
import { showToast } from '../components/toast.js';
import { getCurrentUser } from '../components/navbar.js';
import { getFlagURL } from '../components/flags.js';
import { t } from '../i18n.js';
import { renderRound } from './bracket.js';

export async function adminPage() {
    if (!isAuthenticated()) {
        location.hash = '#/login';
        return '';
    }

    const user = await getCurrentUser();
    if (!user || !user.is_admin) {
        return `
            <div class="empty-state">
                <div class="empty-state-icon">🔒</div>
                <div class="empty-state-text">${t('admin_access_req')}</div>
                <a href="#/" class="btn btn-secondary">${t('admin_go_home')}</a>
            </div>
        `;
    }

    let matches = [];
    let teams = [];
    let bracket = null;
    try {
        const ts = Date.now();
        const [mRes, tRes, bRes] = await Promise.all([
            fetchAPI(`/admin/matches?t=${ts}`),
            fetchAPI(`/matches/teams?t=${ts}`),
            fetchAPI(`/knockout/bracket?t=${ts}`).catch(() => null)
        ]);
        matches = mRes;
        teams = tRes;
        bracket = bRes;
    } catch (e) {
        return `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">${e.message}</div></div>`;
    }


    const unfinished = matches.filter(m => !m.is_finished);
    const finished = matches.filter(m => m.is_finished);
    const groupMatchesCount = matches.filter(m => m.stage === 'Group Stage').length;
    const groupFinishedCount = matches.filter(m => m.stage === 'Group Stage' && m.is_finished).length;

    const teamOptions = teams.map(t => `<option value="${t.id}">${t.code} ${t.name}</option>`).join('');

    const matchRow = (m) => {
        const homeName = m.home_team ? m.home_team.name : (m.home_slot ? `[${m.home_slot}]` : 'TBD');
        const awayName = m.away_team ? m.away_team.name : (m.away_slot ? `[${m.away_slot}]` : 'TBD');
        const homeFlag = m.home_team ? `<img src="${getFlagURL(m.home_team.code)}" class="match-team-flag-svg" style="width:20px;vertical-align:middle;margin-right:4px;">` : '';
        const awayFlag = m.away_team ? `<img src="${getFlagURL(m.away_team.code)}" class="match-team-flag-svg" style="width:20px;vertical-align:middle;margin-left:4px;">` : '';
        
        const isReady = m.home_team && m.away_team;

        return `
        <div class="admin-match-row ${!isReady ? 'admin-match-not-ready' : ''}" id="admin-match-${m.id}">
            <div class="admin-match-info">
                <span class="match-group-badge">${m.group_letter ? 'Grp ' + m.group_letter : m.stage}</span>
                <span class="admin-match-number">#${m.match_number || m.id}</span>
            </div>
            <span class="admin-match-teams">
                <div class="admin-team-item">
                    ${homeFlag}
                    <span class="${!m.home_team ? 'tbd-team' : ''}">${homeName}</span>
                </div>
                <span class="vs-divider">vs</span>
                <div class="admin-team-item">
                    <span class="${!m.away_team ? 'tbd-team' : ''}">${awayName}</span>
                    ${awayFlag}
                </div>
            </span>
            <div class="admin-match-score-inputs">
                ${isReady ? `
                <div style="display:flex; flex-direction:column; gap:4px; align-items:center">
                    <div style="display:flex; align-items:center; gap:var(--space-xs)">
                        <input type="number" class="admin-score-input" id="admin-home-${m.id}" min="0" max="20" placeholder="0" value="${m.home_score ?? ''}" oninput="window.__toggleAdminPen(${m.id})" />
                        <span style="color:var(--text-muted);font-weight:700">—</span>
                        <input type="number" class="admin-score-input" id="admin-away-${m.id}" min="0" max="20" placeholder="0" value="${m.away_score ?? ''}" oninput="window.__toggleAdminPen(${m.id})" />
                    </div>
                    ${m.stage !== 'Group Stage' ? `
                    <div id="admin-pen-wrapper-${m.id}" style="display:${m.home_score === m.away_score && m.home_score !== null ? 'block' : 'none'}">
                        <select id="admin-pen-${m.id}" class="form-input" style="font-size:0.75rem; padding:2px 4px; height:auto; width:120px">
                            <option value="">-- PK Winner --</option>
                            <option value="${m.home_team?.id}" ${m.penalty_winner_id === m.home_team?.id ? 'selected' : ''}>${m.home_team?.code || 'Home'} wins</option>
                            <option value="${m.away_team?.id}" ${m.penalty_winner_id === m.away_team?.id ? 'selected' : ''}>${m.away_team?.code || 'Away'} wins</option>
                        </select>
                    </div>
                    ` : ''}
                </div>
                ` : `<span class="status-badge status-locked">Awaiting Teams</span>`}
            </div>
            <button class="btn btn-sm ${m.is_finished ? 'btn-secondary' : 'btn-success'}" 
                    onclick="window.__setResult(${m.id})" 
                    id="admin-btn-${m.id}"
                    ${!isReady ? 'disabled' : ''}>
                ${m.is_finished ? t('admin_btn_done') : t('admin_btn_set')}
            </button>
        </div>
    `};


    const html = `
        <div class="fade-in">
            <div class="admin-header-flex">
                <div>
                    <h1 class="page-title" style="text-align:left; margin-bottom:0">${t('admin_title')}</h1>
                    <p class="page-subtitle" style="text-align:left">${t('admin_subtitle')}</p>
                </div>
                <div class="admin-status-box">
                    <div class="status-item">
                        <span class="status-label">Group Progress</span>
                        <span class="status-value">${groupFinishedCount} / ${groupMatchesCount}</span>
                        <div class="status-bar"><div class="status-bar-fill" style="width: ${(groupFinishedCount/groupMatchesCount)*100}%"></div></div>
                    </div>
                    ${groupFinishedCount === groupMatchesCount ? `
                        <div class="status-badge status-unlocked" style="margin-top:var(--space-sm)">
                            <span class="status-icon">✅</span> Knockout Stages Active
                        </div>
                    ` : ''}
                </div>
            </div>

            <div class="card" style="margin: var(--space-xl) 0;">
                <h3 style="margin-top:0;margin-bottom:var(--space-md);color:var(--accent-gold)">${t('admin_edit_title')}</h3>
                <form id="admin-edit-match-form" style="display:flex;gap:var(--space-md);flex-wrap:wrap;align-items:flex-end;">
                    <div style="flex:1;min-width:250px">
                        <label class="form-label" style="display:block;margin-bottom:0.5rem">${t('admin_select_match')}</label>
                        <select id="am-match-id" class="form-input" required>
                            <option value="" disabled selected>${t('admin_select_match')}</option>
                            ${matches.map(m => `<option value="${m.id}">[${m.stage}] ${m.home_team?.name || m.home_slot || 'TBD'} vs ${m.away_team?.name || m.away_slot || 'TBD'} (Match ${m.match_number || m.id})</option>`).join('')}
                        </select>
                    </div>
                    <div style="flex:1;min-width:150px">
                        <label class="form-label" style="display:block;margin-bottom:0.5rem">${t('admin_override_home')}</label>
                        <select id="am-home" class="form-input">
                            <option value="">${t('admin_no_change')}</option>
                            ${teamOptions}
                        </select>
                    </div>
                    <div style="flex:1;min-width:150px">
                        <label class="form-label" style="display:block;margin-bottom:0.5rem">${t('admin_override_away')}</label>
                        <select id="am-away" class="form-input">
                            <option value="">${t('admin_no_change')}</option>
                            ${teamOptions}
                        </select>
                    </div>
                    <div style="flex:1;min-width:180px">
                        <label class="form-label" style="display:block;margin-bottom:0.5rem">${t('admin_datetime')}</label>
                        <input type="datetime-local" id="am-date" class="form-input" />
                    </div>
                    <div style="flex:1;min-width:150px">
                        <label class="form-label" style="display:block;margin-bottom:0.5rem">${t('admin_venue')}</label>
                        <input type="text" id="am-venue" class="form-input" placeholder="${t('admin_no_change')}" />
                    </div>
                    <button type="submit" class="btn btn-primary" id="am-submit">${t('admin_btn_update')}</button>
                </form>
            </div>


            <div class="admin-section-title">
                <span class="title-icon">⏳</span>
                <h3>${t('admin_pending', { count: unfinished.length })}</h3>
            </div>
            <div id="admin-pending">
                ${unfinished.length === 0 ? `<p style="color:var(--text-muted); padding: var(--space-lg); text-align:center">${t('admin_all_results')}</p>` : unfinished.map(matchRow).join('')}
            </div>

            <div class="admin-section-title">
                <span class="title-icon">✅</span>
                <h3>${t('admin_completed', { count: finished.length })}</h3>
            </div>
            <div class="admin-completed-list">
                ${finished.map(matchRow).join('')}
            </div>


            ${bracket ? `
                <div style="margin-top: var(--space-2xl); border-top: 1px solid var(--border-color); padding-top: var(--space-xl)">
                    <h2 class="page-title" style="text-align:left; font-size:1.5rem; margin-bottom:var(--space-md)">${t('bracket_title')}</h2>
                    <div class="bracket-container" style="background: var(--card-bg); border-radius: var(--radius-lg); padding: var(--space-lg);">
                        ${renderRound(t('stage_roundof32'), bracket.round_of_32, { isLocked: true })}
                        ${renderRound(t('stage_roundof16'), bracket.round_of_16, { compact: true, isLocked: true })}
                        ${renderRound(t('stage_quarterfinals'), bracket.quarter_finals, { compact: true, isLocked: true })}
                        ${renderRound(t('stage_semifinals'), bracket.semi_finals, { compact: true, isLocked: true })}
                        ${bracket.third_place ? renderRound(t('stage_thirdplace'), [bracket.third_place], { compact: true, isLocked: true }) : ''}
                        ${bracket.final ? renderRound(t('stage_final'), [bracket.final], { isLocked: true }) : ''}
                    </div>
                </div>
            ` : ''}
        </div>
    `;

    return {
        html,
        init: () => {
            window.__toggleAdminPen = (matchId) => {
                const h = document.getElementById(`admin-home-${matchId}`).value;
                const a = document.getElementById(`admin-away-${matchId}`).value;
                const wrapper = document.getElementById(`admin-pen-wrapper-${matchId}`);
                if (wrapper) {
                    wrapper.style.display = (h !== '' && a !== '' && h === a) ? 'block' : 'none';
                }
            };

            window.__setResult = async (matchId) => {
                const homeInput = document.getElementById(`admin-home-${matchId}`);
                const awayInput = document.getElementById(`admin-away-${matchId}`);
                const penSelect = document.getElementById(`admin-pen-${matchId}`);
                const btn = document.getElementById(`admin-btn-${matchId}`);
 
                const homeScore = parseInt(homeInput.value);
                const awayScore = parseInt(awayInput.value);
                const penWinnerId = penSelect ? parseInt(penSelect.value) : null;
 
                if (isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
                    showToast(t('toast_invalid_scores'), 'error');
                    return;
                }

                if (penSelect && homeScore === awayScore && !penWinnerId) {
                    showToast(t('predict_penalty_desc'), 'warning');
                    return;
                }
 
                btn.disabled = true;
                btn.textContent = t('btn_saving');
 
                try {
                    await fetchAPI(`/admin/matches/${matchId}/result?t=${Date.now()}`, {
                        method: 'PUT',
                        body: JSON.stringify({ 
                            home_score: homeScore, 
                            away_score: awayScore,
                            penalty_winner_id: penWinnerId 
                        }),
                    });
                    showToast(t('toast_res_saved', { h: homeScore, a: awayScore }));
                    btn.textContent = t('admin_btn_done');
                    btn.className = 'btn btn-sm btn-secondary';
                    // Refresh the page after a short delay to show propagated results
                    setTimeout(() => {
                        window.dispatchEvent(new HashChangeEvent("hashchange"));
                    }, 800);
                } catch (err) {
                    showToast(err.message, 'error');
                    btn.disabled = false;
                    btn.textContent = 'Set Result';
                }
            };

            const editFormEl = document.getElementById('admin-edit-match-form');
            if (editFormEl) {
                const matchSelect = document.getElementById('am-match-id');
                matchSelect.addEventListener('change', (e) => {
                    const matchId = parseInt(e.target.value);
                    const match = matches.find(m => m.id === matchId);
                    if (match) {
                        if (match.match_date) {
                            const d = new Date(match.match_date);
                            const pad = (n) => n.toString().padStart(2, '0');
                            const localStr = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                            document.getElementById('am-date').value = localStr;
                        } else {
                            document.getElementById('am-date').value = '';
                        }
                        document.getElementById('am-venue').value = match.venue || '';
                        document.getElementById('am-home').value = match.home_team ? match.home_team.id : '';
                        document.getElementById('am-away').value = match.away_team ? match.away_team.id : '';
                    }
                });

                editFormEl.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    
                    const matchId = parseInt(document.getElementById('am-match-id').value);
                    const homeId = document.getElementById('am-home').value;
                    const awayId = document.getElementById('am-away').value;
                    const dateStr = document.getElementById('am-date').value;
                    const venue = document.getElementById('am-venue').value;
                    
                    if (!matchId) return;

                    const body = {};
                    if (homeId) body.home_team_id = parseInt(homeId);
                    if (awayId) body.away_team_id = parseInt(awayId);
                    if (dateStr) body.match_date = new Date(dateStr).toISOString();
                    if (venue) body.venue = venue;

                    const btn = document.getElementById('am-submit');
                    btn.disabled = true;
                    btn.textContent = t('btn_updating');

                    try {
                        await fetchAPI(`/admin/matches/${matchId}`, {
                            method: 'PUT',
                            body: JSON.stringify(body)
                        });
                        showToast(t('toast_match_updated'));
                        setTimeout(() => {
                           window.dispatchEvent(new HashChangeEvent("hashchange"));
                        }, 600);
                    } catch (err) {
                        showToast(err.message, 'error');
                        btn.disabled = false;
                        btn.textContent = t('admin_btn_update');
                    }
                });
            }

            return () => {
                delete window.__setResult;
                delete window.__toggleAdminPen;
            };
        },
    };
}
