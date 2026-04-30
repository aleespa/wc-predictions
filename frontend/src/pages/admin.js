import { fetchAPI, isAuthenticated } from '../api.js';
import { showToast } from '../components/toast.js';
import { getCurrentUser } from '../components/navbar.js';
import { getFlagURL } from '../components/flags.js';
import { t } from '../i18n.js';

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
    try {
        matches = await fetchAPI('/admin/matches');
        teams = await fetchAPI('/matches/teams');
    } catch (e) {
        return `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">${e.message}</div></div>`;
    }

    const unfinished = matches.filter(m => !m.is_finished);
    const finished = matches.filter(m => m.is_finished);

    const teamOptions = teams.map(t => `<option value="${t.id}">${t.code} ${t.name}</option>`).join('');

    const matchRow = (m) => {
        const homeName = m.home_team ? m.home_team.name : 'TBD';
        const awayName = m.away_team ? m.away_team.name : 'TBD';
        const homeFlag = m.home_team ? `<img src="${getFlagURL(m.home_team.code)}" class="match-team-flag-svg" style="width:20px;vertical-align:middle;margin-right:4px;">` : '';
        const awayFlag = m.away_team ? `<img src="${getFlagURL(m.away_team.code)}" class="match-team-flag-svg" style="width:20px;vertical-align:middle;margin-left:4px;">` : '';
        
        return `
        <div class="admin-match-row" id="admin-match-${m.id}">
            <span class="match-group-badge" style="flex-shrink:0">${m.group_letter ? 'Grp ' + m.group_letter : m.stage}</span>
            <span class="admin-match-teams">
                ${homeFlag}
                ${homeName}
                <span style="color:var(--text-muted);margin:0 var(--space-sm)">vs</span>
                ${awayName}
                ${awayFlag}
            </span>
            <div class="admin-match-score-inputs">
                <input type="number" class="admin-score-input" id="admin-home-${m.id}" min="0" max="20" placeholder="${t('admin_placeholder_h')}" value="${m.home_score ?? ''}" />
                <span style="color:var(--text-muted);font-weight:700">—</span>
                <input type="number" class="admin-score-input" id="admin-away-${m.id}" min="0" max="20" placeholder="${t('admin_placeholder_a')}" value="${m.away_score ?? ''}" />
            </div>
            <button class="btn btn-sm ${m.is_finished ? 'btn-secondary' : 'btn-success'}" onclick="window.__setResult(${m.id})" id="admin-btn-${m.id}">
                ${m.is_finished ? t('admin_btn_done') : t('admin_btn_set')}
            </button>
        </div>
    `};

    const html = `
        <div class="fade-in">
            <h1 class="page-title">${t('admin_title')}</h1>
            <p class="page-subtitle">${t('admin_subtitle')}</p>

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

            <h3 style="margin:var(--space-xl) 0 var(--space-md);font-size:1.1rem;color:var(--accent-gold)">
                ${t('admin_pending', { count: unfinished.length })}
            </h3>
            <div id="admin-pending">
                ${unfinished.length === 0 ? `<p style="color:var(--text-muted)">${t('admin_all_results')}</p>` : unfinished.map(matchRow).join('')}
            </div>

            <h3 style="margin:var(--space-xl) 0 var(--space-md);font-size:1.1rem;color:var(--accent-green)">
                ${t('admin_completed', { count: finished.length })}
            </h3>
            <div>
                ${finished.map(matchRow).join('')}
            </div>
        </div>
    `;

    return {
        html,
        init: () => {
            window.__setResult = async (matchId) => {
                const homeInput = document.getElementById(`admin-home-${matchId}`);
                const awayInput = document.getElementById(`admin-away-${matchId}`);
                const btn = document.getElementById(`admin-btn-${matchId}`);

                const homeScore = parseInt(homeInput.value);
                const awayScore = parseInt(awayInput.value);

                if (isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
                    showToast(t('toast_invalid_scores'), 'error');
                    return;
                }

                btn.disabled = true;
                btn.textContent = t('btn_saving');

                try {
                    await fetchAPI(`/admin/matches/${matchId}/result`, {
                        method: 'PUT',
                        body: JSON.stringify({ home_score: homeScore, away_score: awayScore }),
                    });
                    showToast(t('toast_res_saved', { h: homeScore, a: awayScore }));
                    btn.textContent = t('admin_btn_done');
                    btn.className = 'btn btn-sm btn-secondary';
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
            };
        },
    };
}
