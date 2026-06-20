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
        const ts = Date.now();
        const [mRes, tRes] = await Promise.all([
            fetchAPI(`/admin/matches?t=${ts}`),
            fetchAPI(`/matches/teams?t=${ts}`)
        ]);
        matches = mRes;
        teams = tRes;
    } catch (e) {
        return `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">${t(e.message)}</div></div>`;
    }


    const unfinished = matches.filter(m => !m.is_finished);
    const finished = matches.filter(m => m.is_finished);
    const groupMatchesCount = matches.filter(m => m.stage === 'Group Stage').length;
    const groupFinishedCount = matches.filter(m => m.stage === 'Group Stage' && m.is_finished).length;

    // Once all group matches are finished, the admin can confirm & lock the
    // official standings (which unlocks Round of 32 predictions).
    const groupsDone = groupMatchesCount > 0 && groupFinishedCount === groupMatchesCount;
    let confirmData = null;
    let confirmError = null;
    if (groupsDone) {
        try {
            confirmData = await fetchAPI(`/admin/confirmed-standings?t=${Date.now()}`);
        } catch (e) {
            confirmError = e && e.message ? e.message : 'error';
        }
    }

    const teamOptions = teams.map(tm => `<option value="${tm.id}">${tm.code} ${t(tm.name)}</option>`).join('');

    const matchRow = (m) => {
        const homeName = m.home_team ? t(m.home_team.name) : (m.home_slot ? `[${m.home_slot}]` : t('common_tbd'));
        const awayName = m.away_team ? t(m.away_team.name) : (m.away_slot ? `[${m.away_slot}]` : t('common_tbd'));
        const homeFlag = m.home_team ? `<img src="${getFlagURL(m.home_team.code)}" class="match-team-flag-svg" style="width:20px;vertical-align:middle;margin-right:4px;">` : '';
        const awayFlag = m.away_team ? `<img src="${getFlagURL(m.away_team.code)}" class="match-team-flag-svg" style="width:20px;vertical-align:middle;margin-left:4px;">` : '';
        
        const isReady = m.home_team && m.away_team;

        return `
        <div class="admin-match-row ${!isReady ? 'admin-match-not-ready' : ''}" id="admin-match-${m.id}">
            <div class="admin-match-info">
                <span class="match-group-badge">${m.group_letter ? t('matches_filter_grp', { group: m.group_letter }) : t('stage_' + m.stage.toLowerCase().replace(/[^a-z0-9]/g, '')) || m.stage}</span>
                <span class="admin-match-number">#${m.match_number || m.id}</span>
            </div>
            <span class="admin-match-teams">
                <div class="admin-team-item">
                    ${homeFlag}
                    <span class="${!m.home_team ? 'tbd-team' : ''}">${homeName}</span>
                </div>
                <span class="vs-divider">${t('common_vs')}</span>
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
                        <select id="admin-pen-${m.id}" class="form-input" style="font-size:0.95rem; padding:2px 4px; height:auto; width:120px">
                            <option value="">${t('admin_pk_winner_none')}</option>
                            <option value="${m.home_team?.id}" ${m.penalty_winner_id === m.home_team?.id ? 'selected' : ''}>${m.home_team?.code || t('common_home')} ${t('admin_wins')}</option>
                            <option value="${m.away_team?.id}" ${m.penalty_winner_id === m.away_team?.id ? 'selected' : ''}>${m.away_team?.code || t('common_away')} ${t('admin_wins')}</option>
                        </select>
                    </div>
                    ` : ''}
                </div>
                ` : `<span class="status-badge status-locked">${t('admin_awaiting_teams')}</span>`}
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
                        <span class="status-label">${t('admin_group_progress')}</span>
                        <span class="status-value">${groupFinishedCount} / ${groupMatchesCount}</span>
                        <div class="status-bar"><div class="status-bar-fill" style="width: ${(groupFinishedCount/groupMatchesCount)*100}%"></div></div>
                    </div>
                    ${groupFinishedCount === groupMatchesCount ? `
                        <div class="status-badge status-unlocked" style="margin-top:var(--space-sm)">
                            <span class="status-icon">✅</span> ${t('admin_ko_active')}
                        </div>
                    ` : ''}
                </div>
            </div>

            ${groupsDone ? `<div id="confirm-standings-panel" class="fade-in"></div>` : ''}

            <div class="card" style="margin: var(--space-xl) 0;">
                <h3 style="margin-top:0;margin-bottom:var(--space-md);color:var(--accent-gold)">${t('admin_edit_title')}</h3>
                <form id="admin-edit-match-form">
                    <div class="admin-form-group" style="min-width:250px">
                        <label class="form-label" style="display:block;margin-bottom:0.5rem">${t('admin_select_match')}</label>
                        <select id="am-match-id" class="form-input" required>
                            <option value="" disabled selected>${t('admin_select_match')}</option>
                            ${matches.map(m => `<option value="${m.id}">[${t('stage_' + m.stage.toLowerCase().replace(/[^a-z0-9]/g, '')) || m.stage}] ${m.home_team ? t(m.home_team.name) : (m.home_slot || t('common_tbd'))} vs ${m.away_team ? t(m.away_team.name) : (m.away_slot || t('common_tbd'))} (${t('match_number_label', { num: m.match_number || m.id })})</option>`).join('')}
                        </select>
                    </div>
                    <div class="admin-form-group small">
                        <label class="form-label" style="display:block;margin-bottom:0.5rem">${t('admin_override_home')}</label>
                        <select id="am-home" class="form-input">
                            <option value="">${t('admin_no_change')}</option>
                            ${teamOptions}
                        </select>
                    </div>
                    <div class="admin-form-group small">
                        <label class="form-label" style="display:block;margin-bottom:0.5rem">${t('admin_override_away')}</label>
                        <select id="am-away" class="form-input">
                            <option value="">${t('admin_no_change')}</option>
                            ${teamOptions}
                        </select>
                    </div>
                    <div class="admin-form-group">
                        <label class="form-label" style="display:block;margin-bottom:0.5rem">${t('admin_datetime')}</label>
                        <input type="datetime-local" id="am-date" class="form-input" />
                    </div>
                    <div class="admin-form-group">
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


        </div>
    `;

    return {
        html,
        init: () => {
            // ── Confirm & Lock Group Standings panel ──────────────────────────
            const panelEl = document.getElementById('confirm-standings-panel');
            if (panelEl && !confirmData) {
                panelEl.innerHTML = `
                    <div class="card" style="margin: var(--space-xl) 0; border:1px solid var(--accent-gold)">
                        <h3 style="margin-top:0;color:var(--accent-gold)">🔒 ${t('confirm_panel_title')}</h3>
                        <p style="color:var(--danger, #e66)">⚠️ ${confirmError ? (t(confirmError) || confirmError) : 'Could not load standings data.'}</p>
                        <p style="color:var(--text-muted);font-size:0.85rem">If this persists, the backend may need rebuilding (<code>docker compose up -d --build backend</code>).</p>
                    </div>`;
            }
            if (panelEl && confirmData) {
                const GL = "ABCDEFGHIJKL".split("");
                const teamsById = {};
                teams.forEach(tm => { teamsById[tm.id] = tm; });
                const conf = confirmData.confirmed || {};
                const isConfirmed = conf.is_confirmed === true;

                // Initial order: confirmed file if present, else computed standings.
                const order = {};
                for (const gl of GL) {
                    if (isConfirmed && conf.group_standings && conf.group_standings[gl]) {
                        order[gl] = conf.group_standings[gl].slice();
                    } else {
                        order[gl] = (confirmData.computed_standings[gl] || []).map(s => s.team_id);
                    }
                }
                // Ranking of ALL 12 groups' third-place teams; the top 8 qualify.
                const perfOrder = (confirmData.computed_thirds || []).map(x => x.group_letter);
                let thirdsRank;
                if (isConfirmed && Array.isArray(conf.qualifying_thirds)) {
                    const q = conf.qualifying_thirds.slice();
                    thirdsRank = q.concat(perfOrder.filter(gl => !q.includes(gl)));
                } else {
                    thirdsRank = perfOrder.slice();
                }
                for (const gl of GL) if (!thirdsRank.includes(gl)) thirdsRank.push(gl);

                const posKeys = ['confirm_pos_1', 'confirm_pos_2', 'confirm_pos_3', 'confirm_pos_4'];

                const teamRow = (gl, idx) => {
                    const tm = teamsById[order[gl][idx]];
                    const name = tm ? t(tm.name) : '?';
                    const flag = tm ? `<img src="${getFlagURL(tm.code)}" style="width:18px;vertical-align:middle;margin-right:6px">` : '';
                    return `<div style="display:flex;align-items:center;gap:6px;padding:3px 0">
                        <span style="width:32px;color:var(--text-muted);font-size:0.82rem">${t(posKeys[idx])}</span>
                        ${flag}<span style="flex:1">${name}</span>
                        <button type="button" class="btn btn-sm btn-secondary" ${idx === 0 ? 'disabled' : ''} onclick="window.__cMove('${gl}',${idx},-1)" title="${t('confirm_move_up')}">▲</button>
                        <button type="button" class="btn btn-sm btn-secondary" ${idx === 3 ? 'disabled' : ''} onclick="window.__cMove('${gl}',${idx},1)" title="${t('confirm_move_down')}">▼</button>
                    </div>`;
                };
                const cardInner = (gl) => {
                    return `<h4 style="margin:0 0 var(--space-sm)">${t('matches_filter_grp', { group: gl })}</h4>
                        ${[0, 1, 2, 3].map(i => teamRow(gl, i)).join('')}`;
                };

                const thirdName = (gl) => {
                    const tm = teamsById[order[gl][2]];
                    return tm ? t(tm.name) : '?';
                };
                const rankRow = (gl, i) => {
                    const qualifies = i < 8;
                    const cutoff = i === 7
                        ? `<div style="border-top:1px dashed var(--accent-gold);margin:6px 0 2px;font-size:0.72rem;color:var(--text-muted);text-align:center">${t('confirm_cutoff')}</div>`
                        : '';
                    return `<div style="display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:6px;${qualifies ? 'background:rgba(212,175,55,0.12)' : 'opacity:0.5'}">
                        <span style="width:24px;font-weight:700;color:${qualifies ? 'var(--accent-gold)' : 'var(--text-muted)'}">${i + 1}</span>
                        <span style="flex:1">${t('matches_filter_grp', { group: gl })} — ${thirdName(gl)}</span>
                        ${qualifies ? `<span class="status-badge status-unlocked" style="font-size:0.68rem;padding:1px 6px">${t('confirm_qualifies')}</span>` : ''}
                        <button type="button" class="btn btn-sm btn-secondary" ${i === 0 ? 'disabled' : ''} onclick="window.__cThirdMove(${i},-1)" title="${t('confirm_move_up')}">▲</button>
                        <button type="button" class="btn btn-sm btn-secondary" ${i === thirdsRank.length - 1 ? 'disabled' : ''} onclick="window.__cThirdMove(${i},1)" title="${t('confirm_move_down')}">▼</button>
                    </div>${cutoff}`;
                };
                const rankInner = () => thirdsRank.map((gl, i) => rankRow(gl, i)).join('');
                const renderRank = () => {
                    const el = document.getElementById('confirm-thirds-rank');
                    if (el) el.innerHTML = rankInner();
                };

                window.__cMove = (gl, idx, dir) => {
                    const j = idx + dir;
                    if (j < 0 || j > 3) return;
                    const arr = order[gl];
                    [arr[idx], arr[j]] = [arr[j], arr[idx]];
                    const card = document.getElementById(`ccard-${gl}`);
                    if (card) card.innerHTML = cardInner(gl);
                    // The group's 3rd-place team may have changed; refresh the ranking labels.
                    renderRank();
                };
                window.__cThirdMove = (idx, dir) => {
                    const j = idx + dir;
                    if (j < 0 || j >= thirdsRank.length) return;
                    [thirdsRank[idx], thirdsRank[j]] = [thirdsRank[j], thirdsRank[idx]];
                    renderRank();
                };
                window.__cToggle = () => {
                    const body = document.getElementById('confirm-body');
                    const chev = document.getElementById('confirm-chevron');
                    if (!body) return;
                    const hidden = body.style.display === 'none';
                    body.style.display = hidden ? '' : 'none';
                    if (chev) chev.textContent = hidden ? '▾' : '▸';
                };
                window.__cSubmit = async () => {
                    if (!window.confirm(t('confirm_modal_warn'))) return;
                    const btn = document.getElementById('confirm-submit-btn');
                    btn.disabled = true;
                    btn.textContent = t('confirm_btn_saving');
                    const group_standings = {};
                    for (const gl of GL) group_standings[gl] = order[gl];
                    try {
                        await fetchAPI(`/admin/confirm-standings?t=${Date.now()}`, {
                            method: 'POST',
                            body: JSON.stringify({ group_standings, qualifying_thirds: thirdsRank.slice(0, 8) }),
                        });
                        showToast(t('toast_standings_confirmed'));
                        setTimeout(() => window.dispatchEvent(new HashChangeEvent("hashchange")), 800);
                    } catch (err) {
                        showToast(t(err.message), 'error');
                        btn.disabled = false;
                        btn.textContent = t('confirm_btn');
                    }
                };

                panelEl.innerHTML = `
                    <div class="card" style="margin: var(--space-xl) 0; border:1px solid var(--accent-gold)">
                        <div onclick="window.__cToggle()" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer">
                            <h3 style="margin:0;color:var(--accent-gold)">🔒 ${t('confirm_panel_title')}</h3>
                            <span id="confirm-chevron" style="color:var(--accent-gold);font-size:1.3rem;line-height:1">▾</span>
                        </div>
                        <div id="confirm-body" style="margin-top:var(--space-md)">
                            ${isConfirmed ? `<div class="status-badge status-unlocked" style="margin-bottom:var(--space-sm)">✅ ${t('confirm_locked_badge')}</div>` : ''}
                            <p class="page-subtitle" style="text-align:left;margin-top:0">${t('confirm_panel_desc')}</p>
                            ${isConfirmed ? `<p style="color:var(--text-muted);font-size:0.85rem">${t('confirm_reconfirm_note')}</p>` : ''}
                            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:var(--space-md);margin:var(--space-md) 0">
                                ${GL.map(gl => `<div class="card" id="ccard-${gl}" style="padding:var(--space-md)">${cardInner(gl)}</div>`).join('')}
                            </div>
                            <div class="card" style="padding:var(--space-md);margin-top:var(--space-md)">
                                <div style="margin-bottom:var(--space-sm)">
                                    <strong>${t('confirm_thirds_rank_title')}</strong>
                                    <span style="color:var(--text-muted);font-size:0.85rem"> — ${t('confirm_thirds_hint')}</span>
                                </div>
                                <div id="confirm-thirds-rank">${rankInner()}</div>
                            </div>
                            <div style="display:flex;justify-content:flex-end;margin-top:var(--space-md)">
                                <button type="button" class="btn btn-primary" id="confirm-submit-btn" onclick="window.__cSubmit()">${t('confirm_btn')}</button>
                            </div>
                        </div>
                    </div>
                `;
            }

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
                    showToast(t(err.message), 'error');
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
                        showToast(t(err.message), 'error');
                        btn.disabled = false;
                        btn.textContent = t('admin_btn_update');
                    }
                });
            }

            return () => {
                delete window.__setResult;
                delete window.__toggleAdminPen;
                delete window.__cMove;
                delete window.__cThirdMove;
                delete window.__cToggle;
                delete window.__cSubmit;
            };
        },
    };
}
