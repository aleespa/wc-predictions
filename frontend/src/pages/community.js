import { fetchAPI } from '../api.js';
import { getFlagURL } from '../components/flags.js';
import { t } from '../i18n.js';

const getFilters = () => [
    { label: t('matches_filter_all'), type: 'all', val: 'All' },
    ...['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].map(g => ({ label: t('matches_filter_grp', { group: g }), type: 'group', val: g })),
    { label: t('matches_filter_thirds'), type: 'thirds', val: 'thirds' },
    { label: t('matches_filter_r32'), type: 'stage', val: 'Round of 32' },
    { label: t('matches_filter_r16'), type: 'stage', val: 'Round of 16' },
    { label: t('matches_filter_qf'), type: 'stage', val: 'Quarter-finals' },
    { label: t('matches_filter_sf'), type: 'stage', val: 'Semi-finals' },
    { label: t('matches_filter_final'), type: 'stage', val: 'Final' },
];

/**
 * Render a community match card with aggregated prediction statistics.
 */
function renderCommunityMatchCard(match, matchPointsMap = {}) {
    const isFinished = match.is_finished;
    const hasPredictions = match.prediction_count > 0;
    const matchDate = new Date(match.match_date);

    const dateStr = matchDate.toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric'
    });
    const timeStr = matchDate.toLocaleTimeString(undefined, {
        hour: '2-digit', minute: '2-digit'
    });

    let statusHtml = '';
    if (isFinished) {
        statusHtml = `<span class="match-status finished">${t('match_status_finished')}</span>`;
    } else {
        statusHtml = `<span class="match-status upcoming">${t('match_status_upcoming')}</span>`;
    }

    let scoreHtml;
    if (isFinished) {
        scoreHtml = `
            <div style="display:flex;flex-direction:column;align-items:center;line-height:1">
                <span class="match-score">${match.home_score} — ${match.away_score}</span>
                <span style="font-size:0.6rem;color:var(--text-muted);margin-top:4px">${dateStr}</span>
            </div>
        `;
    } else {
        scoreHtml = `
            <span class="match-vs-label">${t('common_vs')}</span>
            <div style="display:flex;flex-direction:column;align-items:center;line-height:1">
                <span style="font-size:0.6rem;color:var(--text-muted);margin-bottom:2px">${dateStr}</span>
                <span style="font-size:0.7rem;color:var(--text-muted);font-weight:500">${timeStr}</span>
            </div>
        `;
    }

    // Community prediction overlay
    let communitySection = '';
    if (hasPredictions) {
        // Derive implied result from rounded averages
        const roundedHome = Math.round(match.avg_home_score);
        const roundedAway = Math.round(match.avg_away_score);
        let impliedResult = '';
        let impliedColor = '';
        if (roundedHome > roundedAway) {
            impliedResult = t('community_win', { team: match.home_team?.name || t('common_home') });
            impliedColor = 'var(--accent-green)';
        } else if (roundedAway > roundedHome) {
            impliedResult = t('community_win', { team: match.away_team?.name || t('common_away') });
            impliedColor = 'var(--accent-blue)';
        } else {
            impliedResult = t('community_draw');
            impliedColor = 'var(--accent-gold)';
        }

        communitySection = `
            <div class="community-stats-section">
                <div class="community-avg-score">
                    <div class="community-avg-label">${t('community_avg_label')}</div>
                    <div class="community-avg-value">${match.avg_home_score.toFixed(1)} — ${match.avg_away_score.toFixed(1)}</div>
                    <div class="community-implied" style="color:${impliedColor}">
                        → ${roundedHome} – ${roundedAway} · ${impliedResult}
                    </div>
                </div>
                <div class="community-outcome-bars">
                    <div class="community-bar-row">
                        <span class="community-bar-label" style="color:var(--accent-green)">🏠 ${match.home_win_pct}%</span>
                        <div class="community-bar-track">
                            <div class="community-bar-fill community-bar-home" style="width:${match.home_win_pct}%"></div>
                        </div>
                    </div>
                    <div class="community-bar-row">
                        <span class="community-bar-label" style="color:var(--accent-gold)">🤝 ${match.draw_pct}%</span>
                        <div class="community-bar-track">
                            <div class="community-bar-fill community-bar-draw" style="width:${match.draw_pct}%"></div>
                        </div>
                    </div>
                    <div class="community-bar-row">
                        <span class="community-bar-label" style="color:var(--accent-blue)">✈️ ${match.away_win_pct}%</span>
                        <div class="community-bar-track">
                            <div class="community-bar-fill community-bar-away" style="width:${match.away_win_pct}%"></div>
                        </div>
                    </div>
                </div>
                ${(() => {
                const detail = matchPointsMap[match.match_id];
                if (!detail) return '';
                const pts = detail.points_awarded;
                let color = 'var(--accent-red)';
                let label = t('match_badge_0pts', { h: detail.predicted_home, a: detail.predicted_away }) + ' ❌';
                if (pts === 5) { color = 'var(--accent-gold)'; label = t('match_badge_exact', { h: detail.predicted_home, a: detail.predicted_away }); }
                else if (pts === 3) { color = 'var(--accent-green)'; label = t('match_badge_3pts', { h: detail.predicted_home, a: detail.predicted_away }) + ' ✓'; }
                else if (pts === 1) { color = 'var(--accent-blue)'; label = t('match_badge_1pt', { h: detail.predicted_home, a: detail.predicted_away }) + ' ✓'; }
                return `
                        <div class="community-match-points" style="color:${color}">
                            ${label}
                        </div>
                    `;
            })()}
                <div class="community-count">
                    <span class="community-count-icon">👥</span>
                    ${match.prediction_count === 1 ? t('community_pred_count', { count: match.prediction_count }) : t('community_preds_count', { count: match.prediction_count })}
                </div>
            </div>
        `;
    } else {
        communitySection = `
            <div class="community-stats-section community-empty">
                <div class="community-empty-icon">📊</div>
                <div class="community-empty-text">${t('community_no_preds')}</div>
                <div class="community-empty-sub">${t('community_be_first')}</div>
            </div>
        `;
    }

    const classes = ['match-card', 'community-match-card'];
    if (isFinished) classes.push('finished');

    return `
        <div class="${classes.join(' ')}" id="community-match-${match.match_id}">
            <div class="match-card-header">
                <span class="match-group-badge">${match.group_letter ? t('stage_group', { group: match.group_letter }) : t('stage_' + match.stage.toLowerCase().replace(/[^a-z0-9]/g, '')) || match.stage}</span>
                ${statusHtml}
            </div>
            <div class="match-teams">
                <div class="match-team">
                    ${match.home_team ? `
                        <img src="${getFlagURL(match.home_team.code)}" alt="${match.home_team.code}" class="match-team-flag-svg" />
                        <span class="match-team-name">${match.home_team.name}</span>
                    ` : `
                        <span class="match-team-name" style="color:var(--text-muted);font-style:italic;font-size:0.7rem">${match.home_slot || t('common_tbd')}</span>
                    `}
                </div>
                <div class="match-vs">
                    ${scoreHtml}
                </div>
                <div class="match-team">
                    ${match.away_team ? `
                        <img src="${getFlagURL(match.away_team.code)}" alt="${match.away_team.code}" class="match-team-flag-svg" />
                        <span class="match-team-name">${match.away_team.name}</span>
                    ` : `
                        <span class="match-team-name" style="color:var(--text-muted);font-style:italic;font-size:0.7rem">${match.away_slot || t('common_tbd')}</span>
                    `}
                </div>
            </div>
            <div class="match-card-footer">
                <span class="match-venue">🏟️ ${match.venue || t('common_tbd')}</span>
            </div>
            ${communitySection}
        </div>
    `;
}


/**
 * Render standings table (reused for community predicted standings).
 */
function renderStandingsTable(standings, groupLetter, label = t('community_avg_label')) {
    if (!standings || standings.length === 0) return '';

    const trs = standings.map((s, idx) => `
        <tr style="border-bottom:1px solid var(--border-light)">
            <td style="padding:12px 4px;text-align:center;font-weight:700;color:var(--text-muted)">${idx + 1}</td>
            <td style="padding:12px 4px;"><img src="${getFlagURL(s.team_code)}" class="match-team-flag-svg" style="width:24px; height:16px; margin-right:8px">${s.team_name}</td>
            <td style="padding:12px 4px;text-align:center">${s.played}</td>
            <td style="padding:12px 4px;text-align:center">${s.won}</td>
            <td style="padding:12px 4px;text-align:center">${s.drawn}</td>
            <td style="padding:12px 4px;text-align:center">${s.lost}</td>
            <td style="padding:12px 4px;text-align:center">${s.goal_diff > 0 ? '+' + s.goal_diff : s.goal_diff}</td>
            <td style="padding:12px 4px;text-align:center;font-weight:800;color:var(--accent-gold)">${s.points}</td>
        </tr>
    `).join('');

    return `
        <div class="card" style="margin-bottom:var(--space-lg);overflow-x:auto;">
            <h3 style="margin-top:0;margin-bottom:var(--space-md)">
                <span style="color:var(--accent-purple-light)">👥</span> ${t('community_standings_title', { label: label, group: groupLetter })}
            </h3>
            <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:var(--space-md)">
                ${t('community_standings_sub')}
            </p>
            <table style="width:100%;border-collapse:collapse;font-size:0.95rem;white-space:nowrap;">
                <thead>
                    <tr style="border-bottom:2px solid var(--border-medium);color:var(--text-muted)">
                        <th style="padding:8px 4px;text-align:center">#</th>
                        <th style="padding:8px 4px;text-align:left">${t('standings_th_team')}</th>
                        <th style="padding:8px 4px;text-align:center">${t('standings_th_mp')}</th>
                        <th style="padding:8px 4px;text-align:center">${t('standings_th_w')}</th>
                        <th style="padding:8px 4px;text-align:center">${t('standings_th_d')}</th>
                        <th style="padding:8px 4px;text-align:center">${t('standings_th_l')}</th>
                        <th style="padding:8px 4px;text-align:center">${t('standings_th_gd')}</th>
                        <th style="padding:8px 4px;text-align:center">${t('standings_th_pts')}</th>
                    </tr>
                </thead>
                <tbody>
                    ${trs}
                </tbody>
            </table>
        </div>
    `;
}


/**
 * Render a community bracket match card for knockout.
 */
function renderCommunityBracketMatch(match) {
    const matchDate = new Date(match.match_date);
    const dateStr = matchDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const timeStr = matchDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const hasPredictions = match.prediction_count > 0;
    const isFinished = match.is_finished;

    function renderSlot(slot) {
        if (!slot || !slot.team) {
            const label = slot?.slot_label || t('bracket_tbd');
            return `
                <div class="bracket-team bracket-tbd">
                    <span class="bracket-team-name bracket-placeholder">${label}</span>
                </div>
            `;
        }
        const isWinner = match.derived_winner_team && slot.team && match.derived_winner_team.id === slot.team.id;
        return `
            <div class="bracket-team ${isWinner ? 'community-winner' : ''}">
                <img src="${getFlagURL(slot.team.code)}" alt="${slot.team.code}" class="bracket-team-flag" />
                <span class="bracket-team-name">${slot.team.name}</span>
                ${isWinner ? '<span class="community-winner-badge">✓</span>' : ''}
            </div>
        `;
    }

    let scoreSection = '';
    if (isFinished && match.home_score !== null) {
        scoreSection = `<div class="bracket-score">${match.home_score} – ${match.away_score}</div>`;
    } else if (hasPredictions && match.avg_home_score !== null) {
        scoreSection = `<div class="bracket-score community-bracket-score">${match.avg_home_score.toFixed(1)} – ${match.avg_away_score.toFixed(1)}</div>`;
    }

    let statusClass = 'bracket-upcoming';
    if (isFinished) statusClass = 'bracket-finished';
    else if (hasPredictions) statusClass = 'bracket-has-prediction';

    // Outcome bar mini
    let miniOutcome = '';
    if (hasPredictions) {
        miniOutcome = `
            <div class="community-mini-outcome">
                <span style="color:var(--accent-green);font-size:0.65rem">${match.home_win_pct}%</span>
                <span style="color:var(--accent-gold);font-size:0.65rem">${match.draw_pct}%</span>
                <span style="color:var(--accent-blue);font-size:0.65rem">${match.away_win_pct}%</span>
                <span style="color:var(--text-muted);font-size:0.6rem;margin-left:4px">👥 ${match.prediction_count}</span>
            </div>
        `;
    }

    return `
        <div class="bracket-match ${statusClass}" id="community-bracket-${match.match_id}" data-match-id="${match.match_id}">
            <div class="bracket-match-header">
                <span class="bracket-match-num">M${match.match_number}</span>
                <span class="bracket-match-info">${dateStr} · ${timeStr}</span>
            </div>
            <div class="bracket-matchup">
                ${renderSlot(match.home)}
                ${scoreSection}
                ${renderSlot(match.away)}
            </div>
            ${miniOutcome}
            ${match.venue ? `<div class="bracket-venue">🏟️ ${match.venue}</div>` : ''}
        </div>
    `;
}


/**
 * Render a round column.
 */
function renderBracketRound(title, matches) {
    if (!matches || matches.length === 0) return '';
    return `
        <div class="bracket-round">
            <div class="bracket-round-header">
                <h3 class="bracket-round-title">${title}</h3>
                <span class="bracket-round-count">${matches.length === 1 ? t('bracket_round_match', { count: matches.length }) : t('bracket_round_matches', { count: matches.length })}</span>
            </div>
            <div class="bracket-round-matches">
                ${matches.map(m => renderCommunityBracketMatch(m)).join('')}
            </div>
        </div>
    `;
}


/**
 * Main community page.
 */

import { getCurrentUser } from '../components/navbar.js';
import { isAuthenticated } from '../api.js';

let currentCommunityId = null;

export async function communityPage() {
    let myCommunities = [];
    let currentUser = null;
    try {
        if (isAuthenticated()) {
            currentUser = await getCurrentUser();
            myCommunities = await fetchAPI('/community/private/mine');
        }
    } catch (e) {
        console.error("Failed to load private communities", e);
    }

    const renderSelector = () => {
        let opts = `<option value="">${t('community_opt_global')}</option>`;
        for (const c of myCommunities) {
            opts += `<option value="${c.id}" ${currentCommunityId == c.id ? 'selected' : ''}>${t('community_opt_private', { name: c.name, count: c.member_count })}</option>`;
        }

        return `
            <div class="community-controls card fade-in" style="margin-bottom: var(--space-xl); display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-lg); padding: var(--space-lg); background: var(--bg-card); border: 1px solid var(--border-medium); border-radius: var(--radius-lg); box-shadow: var(--shadow-md);">
                <div class="community-selector-block" style="display: flex; flex-direction: column; gap: var(--space-sm);">
                    <label style="font-weight: 600; font-size: 0.85rem; color: var(--text-secondary);">${t('community_viewing')}</label>
                    <div style="display: flex; gap: var(--space-sm); align-items: center; flex-wrap: wrap;">
                        <select id="community-select" class="form-input" style="flex: 1; min-width: 200px; cursor: pointer; font-weight: 600; font-size: 0.95rem;">
                            ${opts}
                        </select>
                        <div style="display: flex; gap: var(--space-xs);">
                            <button id="btn-invite" class="btn btn-secondary btn-sm" style="display: ${currentCommunityId ? 'inline-flex' : 'none'};" title="${t('community_invite_btn')}">
                                ${t('community_invite_btn')}
                            </button>
                            <button id="btn-leave" class="btn btn-danger btn-sm" style="display: ${currentCommunityId ? 'inline-flex' : 'none'}; opacity: 0.8;" title="${t('community_leave_btn')}">
                                ${t('community_leave_btn')}
                            </button>
                        </div>
                    </div>
                    <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">${t('community_switch_desc')}</p>
                </div>
                
                ${isAuthenticated() ? `
                <div class="community-create-block" style="display: flex; flex-direction: column; gap: var(--space-sm);">
                    <label style="font-weight: 600; font-size: 0.85rem; color: var(--text-secondary);">${t('community_create_new')}</label>
                    <div style="display: flex; gap: var(--space-sm);">
                        <input type="text" id="new-community-name" class="form-input" placeholder="${t('community_name_ph')}" style="flex: 1;">
                        <button id="btn-create-community" class="btn btn-primary btn-sm">
                            ${t('community_btn_create')}
                        </button>
                    </div>
                    <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">${t('community_create_desc')}</p>
                </div>
                ` : `
                <div class="community-create-block" style="display: flex; flex-direction: column; justify-content: center;">
                    <p style="color: var(--text-muted); font-size: 0.85rem; margin: 0; font-weight: 500;">${t('community_login_req')}</p>
                </div>
                `}
            </div>
        `;
    };

    const html = `
        <div class="fade-in" id="community-page">
            <h1 class="page-title">
                <span style="background:linear-gradient(135deg, var(--accent-purple), var(--accent-cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">
                    👥 ${t('community_title')}
                </span>
            </h1>
            <p class="page-subtitle">${t('community_subtitle')}</p>

            ${renderSelector()}

            <div id="community-content-area"></div>
        </div>
    `;

    let currentData = null;

    return {
        html,
        init: () => {
            const selectEl = document.getElementById('community-select');
            const createBtn = document.getElementById('btn-create-community');
            const newNameInput = document.getElementById('new-community-name');
            const inviteBtn = document.getElementById('btn-invite');
            const leaveBtn = document.getElementById('btn-leave');
            const contentArea = document.getElementById('community-content-area');

            const loadContent = async () => {
                contentArea.innerHTML = '<div class="spinner"></div>';
                try {
                    let suffix = currentCommunityId ? `?community_id=${currentCommunityId}` : '';
                    const [matches, communityPoints, leaderboard] = await Promise.all([
                        fetchAPI('/community/matches' + suffix),
                        fetchAPI('/community/points' + suffix),
                        fetchAPI('/leaderboard' + suffix)
                    ]);
                    currentData = { matches, communityPoints, leaderboard, suffix };
                    currentLeaderboardPage = 1;
                    render();
                } catch (e) {
                    contentArea.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">${e.message}</div></div>`;
                }
            };

            const render = () => {
                if (!currentData) return;
                const { matches, communityPoints, leaderboard, suffix } = currentData;
                contentArea.innerHTML = renderCommunityContent(matches, communityPoints, leaderboard, currentUser, suffix);
                initCommunityContent(matches, communityPoints, suffix);

                // Pagination listeners
                const prevBtn = document.getElementById('prev-page');
                const nextBtn = document.getElementById('next-page');
                if (prevBtn) {
                    prevBtn.addEventListener('click', () => {
                        currentLeaderboardPage--;
                        render();
                        document.querySelector('h2').scrollIntoView({ behavior: 'smooth' });
                    });
                }
                if (nextBtn) {
                    nextBtn.addEventListener('click', () => {
                        currentLeaderboardPage++;
                        render();
                        document.querySelector('h2').scrollIntoView({ behavior: 'smooth' });
                    });
                }
            };

            if (selectEl) {
                selectEl.addEventListener('change', (e) => {
                    currentCommunityId = e.target.value ? parseInt(e.target.value) : null;
                    if (inviteBtn) {
                        inviteBtn.style.display = currentCommunityId ? 'inline-flex' : 'none';
                    }
                    if (leaveBtn) {
                        leaveBtn.style.display = currentCommunityId ? 'inline-flex' : 'none';
                    }
                    loadContent();
                });
            }

            if (createBtn && newNameInput) {
                createBtn.addEventListener('click', async () => {
                    const name = newNameInput.value.trim();
                    if (!name) return;
                    try {
                        const newComm = await fetchAPI('/community/private', {
                            method: 'POST',
                            body: JSON.stringify({ name })
                        });
                        myCommunities.push(newComm);
                        currentCommunityId = newComm.id;


                        // Reliably reload the page to render the new state cleanly
                        const { handleRoute } = await import('../router.js');
                        handleRoute();

                    } catch (e) {
                        alert(e.message);
                    }
                });
            }

            if (inviteBtn) {
                inviteBtn.addEventListener('click', () => {
                    const c = myCommunities.find(x => x.id === currentCommunityId);
                    if (c) {
                        const link = window.location.origin + window.location.pathname + '#/join/' + c.invite_code;
                        navigator.clipboard.writeText(link);
                        alert(t('community_toast_invite_copied'));
                    }
                });
            }

            if (leaveBtn) {
                leaveBtn.addEventListener('click', async () => {
                    if (confirm(t('community_leave_confirm'))) {
                        try {
                            await fetchAPI(`/community/private/${currentCommunityId}/leave`, { method: 'DELETE' });
                            myCommunities = myCommunities.filter(c => c.id !== currentCommunityId);
                            currentCommunityId = null;
                            const { handleRoute } = await import('../router.js');
                            handleRoute();
                        } catch (e) {
                            alert(e.message);
                        }
                    }
                });
            }

            loadContent();
        }
    };
}

let currentLeaderboardPage = 1;

function renderLeaderboardTable(leaderboard, currentUser, page = 1) {
    const pageSize = 10;
    const totalPages = Math.ceil(leaderboard.length / pageSize);
    const startIndex = (page - 1) * pageSize;
    const paginatedItems = leaderboard.slice(startIndex, startIndex + pageSize);

    const userEntry = currentUser ? leaderboard.find(e => e.user_id === currentUser.id) : null;
    const userInCurrentPage = paginatedItems.some(e => e.user_id === (currentUser ? currentUser.id : null));

    const renderRow = (entry, isSticky = false) => {
        const isMe = currentUser && currentUser.id === entry.user_id;
        const isCommunity = entry.is_community;
        const rowClass = isCommunity ? 'leaderboard-community-row' : '';
        const stickyClass = isSticky ? 'leaderboard-row-sticky' : '';
        let nameDisplay;
        if (isCommunity) {
            nameDisplay = `<span class="leaderboard-community-name">${entry.username}</span>`;
        } else {
            const displayText = `${entry.username}${isMe ? t('leaderboard_you') : ''}`;
            nameDisplay = `<a href="#/user/${encodeURIComponent(entry.username)}" class="leaderboard-user-link" title="View ${entry.username}'s predictions">${displayText}</a>`;
        }
        return `
            <tr class="${rowClass} ${stickyClass}">
                <td class="leaderboard-rank ${entry.rank <= 3 ? 'top-' + entry.rank : ''}">${entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : entry.rank}</td>
                <td class="leaderboard-user ${isMe ? 'is-me' : ''}">
                    ${nameDisplay}
                    <div class="leaderboard-mobile-stats">
                        <span>🎯 ${entry.exact_scores}</span>
                        <span>✓ ${entry.correct_outcomes}</span>
                        <span>🔮 ${entry.predictions_count}</span>
                    </div>
                </td>
                <td class="leaderboard-points ${isCommunity ? 'leaderboard-community-points' : ''}">${entry.total_points}</td>
                <td class="leaderboard-stat">${entry.exact_scores}</td>
                <td class="leaderboard-stat">${entry.correct_outcomes}</td>
                <td class="leaderboard-stat">${entry.predictions_count}</td>
            </tr>
        `;
    };

    let tableRows = paginatedItems.map(entry => renderRow(entry)).join('');

    if (userEntry && !userInCurrentPage) {
        tableRows += `
            <tr class="leaderboard-separator">
                <td colspan="6" style="text-align:center; padding: 4px; font-size: 0.8rem; color: var(--text-muted); opacity: 0.5;">•••</td>
            </tr>
            ${renderRow(userEntry, true)}
        `;
    }

    const paginationHtml = totalPages > 1 ? `
        <div class="leaderboard-pagination">
            <button class="btn btn-secondary btn-sm" id="prev-page" ${page === 1 ? 'disabled' : ''}>← ${t('pagination_prev')}</button>
            <span style="font-size:0.9rem; font-weight:600; color:var(--text-muted)">${page} / ${totalPages}</span>
            <button class="btn btn-secondary btn-sm" id="next-page" ${page === totalPages ? 'disabled' : ''}>${t('pagination_next')} →</button>
        </div>
    ` : '';

    return `
        <div style="margin-bottom: var(--space-2xl);">
            ${leaderboard.length === 0 ? `
                <div class="empty-state">
                    <div class="empty-state-icon">🏜️</div>
                    <div class="empty-state-text">${t('leaderboard_no_preds')}</div>
                </div>
            ` : `
                <div class="card" style="overflow-x:auto">
                    <table class="leaderboard-table" style="width:100%">
                        <thead>
                            <tr>
                                <th>${t('leaderboard_th_rank')}</th>
                                <th>${t('leaderboard_th_player')}</th>
                                <th>${t('leaderboard_th_points')}</th>
                                <th>${t('leaderboard_th_exact')}</th>
                                <th>${t('leaderboard_th_correct')}</th>
                                <th>🔮 ${t('leaderboard_th_preds')}</th>
                            </tr>
                        </thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>
                ${paginationHtml}
            `}
        </div>
    `;
}

function renderCommunityContent(matches, communityPoints, leaderboard, currentUser, suffix) {
    const matchPointsMap = {};
    if (communityPoints && communityPoints.match_details) {
        for (const detail of communityPoints.match_details) {
            matchPointsMap[detail.match_id] = detail;
        }
    }
    const groupMatches = matches.filter(m => m.stage === 'Group Stage');

    const tabs = getFilters().map((f, i) =>
        `<button class="group-tab ${i === 0 ? 'active' : ''}" data-type="${f.type}" data-val="${f.val}">${f.label}</button>`
    ).join('');

    return `
        <h2 style="margin-bottom: var(--space-md);">${t('community_leaderboard')}</h2>
        ${renderLeaderboardTable(leaderboard, currentUser, currentLeaderboardPage)}

        <h2 style="margin-bottom: var(--space-md);">${t('community_avg_preds')}</h2>
        <div class="group-tabs" id="community-tabs">
            ${tabs}
        </div>

        <div id="community-standings-container"></div>
        <div id="community-bracket-container"></div>

        <div class="matches-grid" id="community-grid">
            ${groupMatches.map(m => renderCommunityMatchCard(m, matchPointsMap)).join('')}
        </div>
    `;
}

function initCommunityContent(matches, communityPoints, suffix) {
    const matchPointsMap = {};
    if (communityPoints && communityPoints.match_details) {
        for (const detail of communityPoints.match_details) {
            matchPointsMap[detail.match_id] = detail;
        }
    }
    const groupMatches = matches.filter(m => m.stage === 'Group Stage');
    const grid = document.getElementById('community-grid');
    const tabsContainer = document.getElementById('community-tabs');
    const standingsContainer = document.getElementById('community-standings-container');
    const bracketContainer = document.getElementById('community-bracket-container');

    tabsContainer.addEventListener('click', async (e) => {
        const tab = e.target.closest('.group-tab');
        if (!tab) return;
        tabsContainer.querySelectorAll('.group-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const filterType = tab.dataset.type;
        const filterVal = tab.dataset.val;

        standingsContainer.innerHTML = '';
        bracketContainer.innerHTML = '';

        let filtered = matches;
        if (filterType === 'group') {
            filtered = matches.filter(m => m.group_letter === filterVal);
            try {
                let url = `/community/standings/${filterVal}`;
                if (suffix) {
                    url += suffix;
                }
                const stds = await fetchAPI(url);
                standingsContainer.innerHTML = renderStandingsTable(stds, filterVal);
            } catch (err) {
                console.error('Failed to load community standings', err);
            }
        } else if (filterType === 'stage') {
            filtered = matches.filter(m => m.stage === filterVal);
        } else {
            filtered = groupMatches;
        }

        if (filtered.length === 0) {
            if (filterType === 'stage') {
                grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🏆</div><div class="empty-state-text">${t('community_awaiting_bracket')}</div></div>`;
            } else {
                grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">📭</div><div class="empty-state-text">${t('matches_no_matches')}</div></div>`;
            }
        } else {
            grid.innerHTML = filtered.map(m => renderCommunityMatchCard(m, matchPointsMap)).join('');
        }
    });

    loadCommunityBracket(bracketContainer, suffix);
}

async function loadCommunityBracket(container, suffix) {
    try {
        let url = '/community/bracket';
        if (suffix) url += suffix;
        const bracket = await fetchAPI(url);
        if (!bracket.available) return;
        const allKoMatches = [
            ...(bracket.round_of_32 || []),
            ...(bracket.round_of_16 || []),
            ...(bracket.quarter_finals || []),
            ...(bracket.semi_finals || []),
            ...(bracket.third_place ? [bracket.third_place] : []),
            ...(bracket.final ? [bracket.final] : []),
        ];
        const predictedCount = allKoMatches.filter(m => m.prediction_count > 0).length;
        container.innerHTML = `
            <div class="community-bracket-section card" style="margin-bottom:var(--space-xl);padding:var(--space-xl);">
                <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:var(--space-md);margin-bottom:var(--space-lg)">
                    <div>
                        <h2 style="margin:0;font-size:1.3rem;font-weight:800">${t('community_ko_title')}</h2>
                        <p style="margin:var(--space-xs) 0 0;font-size:0.85rem;color:var(--text-muted)">${t('community_ko_sub')}</p>
                    </div>
                    <div class="bracket-stats-bar" style="margin:0">
                        <div class="bracket-stat"><span class="bracket-stat-value">${predictedCount}</span><span class="bracket-stat-label">${t('community_ko_stat_pred')}</span></div>
                        <div class="bracket-stat"><span class="bracket-stat-value">${allKoMatches.length}</span><span class="bracket-stat-label">${t('community_ko_stat_ko')}</span></div>
                    </div>
                </div>
                <div class="bracket-container">
                    ${renderBracketRound(t('stage_roundof32'), bracket.round_of_32)}
                    ${renderBracketRound(t('stage_roundof16'), bracket.round_of_16)}
                    ${renderBracketRound(t('stage_quarterfinals'), bracket.quarter_finals)}
                    ${renderBracketRound(t('stage_semifinals'), bracket.semi_finals)}
                    ${bracket.third_place ? renderBracketRound(t('stage_thirdplace'), [bracket.third_place]) : ''}
                    ${bracket.final ? renderBracketRound(t('stage_final'), [bracket.final]) : ''}
                </div>
            </div>
        `;
    } catch (err) {
        console.error('Failed to load community bracket', err);
    }
}

export async function joinCommunityPage(params) {
    const code = params.code;
    return {
        html: `
            <div class="fade-in card" style="max-width: 400px; margin: 40px auto; text-align: center;">
                <h2>${t('community_join_title')}</h2>
                <p>${t('community_join_desc')}</p>
                <button id="btn-confirm-join" class="btn btn-primary" style="width: 100%; margin-top: 20px;">${t('community_join_btn')}</button>
            </div>
        `,
        init: () => {
            document.getElementById('btn-confirm-join').addEventListener('click', async () => {
                const { isAuthenticated, fetchAPI } = await import('../api.js');
                if (!isAuthenticated()) {
                    alert(t('community_join_login_req'));
                    window.location.hash = '#/login';
                    return;
                }
                try {
                    await fetchAPI('/community/private/join', {
                        method: 'POST',
                        body: JSON.stringify({ invite_code: code })
                    });
                    const { navigate } = await import('../router.js');
                    navigate('/community');
                } catch (e) {
                    alert(e.message);
                }
            });
        }
    };
}
