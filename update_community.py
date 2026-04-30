import re

with open(r"c:\Users\Alejandro\Projects\New folder\frontend\src\pages\community.js", "r", encoding="utf-8") as f:
    content = f.read()

split_point = "export async function communityPage() {"
prefix, _ = content.split(split_point, 1)

new_content = prefix + """
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
        let opts = `<option value="">Global Community</option>`;
        for (const c of myCommunities) {
            opts += `<option value="${c.id}" ${currentCommunityId == c.id ? 'selected' : ''}>${c.name} (${c.member_count} members)</option>`;
        }
        return `
            <div class="community-selector-container card" style="margin-bottom: var(--space-xl); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <label style="font-weight: bold; color: var(--text-muted)">Selected Community:</label>
                    <select id="community-select" class="form-control" style="width: auto; display: inline-block;">
                        ${opts}
                    </select>
                </div>
                ${isAuthenticated() ? `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <input type="text" id="new-community-name" class="form-control" placeholder="New community name" style="width: auto;">
                    <button id="btn-create-community" class="btn btn-primary">Create</button>
                    <button id="btn-invite" class="btn btn-secondary" style="display: ${currentCommunityId ? 'inline-block' : 'none'}">Copy Invite Link</button>
                </div>
                ` : ''}
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

    return {
        html,
        init: () => {
            const selectEl = document.getElementById('community-select');
            const createBtn = document.getElementById('btn-create-community');
            const newNameInput = document.getElementById('new-community-name');
            const inviteBtn = document.getElementById('btn-invite');
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
                    contentArea.innerHTML = renderCommunityContent(matches, communityPoints, leaderboard, currentUser, suffix);
                    initCommunityContent(matches, communityPoints, suffix);
                } catch (e) {
                    contentArea.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">${e.message}</div></div>`;
                }
            };

            if (selectEl) {
                selectEl.addEventListener('change', (e) => {
                    currentCommunityId = e.target.value ? parseInt(e.target.value) : null;
                    if (inviteBtn) {
                        inviteBtn.style.display = currentCommunityId ? 'inline-block' : 'none';
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
                        const { navigate } = await import('../router.js');
                        navigate('/community');
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
                        alert("Invite link copied to clipboard!");
                    }
                });
            }

            loadContent();
        }
    };
}

function renderLeaderboardTable(leaderboard, currentUser) {
    const top3 = leaderboard.slice(0, 3);
    const podiumOrder = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3;
    const podiumHtml = podiumOrder.map((entry) => {
        const isCommunity = entry.is_community;
        const initial = isCommunity ? '👥' : (entry.display_name || entry.username || '?').charAt(0).toUpperCase();
        return `
            <div class="podium-item ${isCommunity ? 'podium-community' : ''}">
                <div class="podium-avatar ${isCommunity ? 'podium-avatar-community' : ''}">${initial}</div>
                <div class="podium-name ${isCommunity ? 'podium-name-community' : ''}">${entry.display_name || entry.username}</div>
                <div class="podium-points">${entry.total_points} ${t('common_pts')}</div>
                <div class="podium-bar"></div>
            </div>
        `;
    }).join('');

    const tableRows = leaderboard.map(entry => {
        const isMe = currentUser && currentUser.id === entry.user_id;
        const isCommunity = entry.is_community;
        const rowClass = isCommunity ? 'leaderboard-community-row' : '';
        const nameDisplay = isCommunity
            ? `<span class="leaderboard-community-name">${entry.display_name || entry.username}</span>`
            : `${entry.display_name || entry.username}${isMe ? t('leaderboard_you') : ''}`;
        return `
            <tr class="${rowClass}">
                <td class="leaderboard-rank ${entry.rank <= 3 ? 'top-' + entry.rank : ''}">${entry.rank <= 3 ? ['🥇','🥈','🥉'][entry.rank-1] : entry.rank}</td>
                <td class="leaderboard-user ${isMe ? 'is-me' : ''}">${nameDisplay}</td>
                <td class="leaderboard-points ${isCommunity ? 'leaderboard-community-points' : ''}">${entry.total_points}</td>
                <td class="leaderboard-stat">${entry.exact_scores}</td>
                <td class="leaderboard-stat">${entry.correct_outcomes}</td>
                <td class="leaderboard-stat">${entry.predictions_count}</td>
            </tr>
        `;
    }).join('');

    return `
        <div style="margin-bottom: var(--space-2xl);">
            ${top3.length >= 3 ? `<div class="podium">${podiumHtml}</div>` : ''}
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
                                <th>${t('leaderboard_th_preds')}</th>
                            </tr>
                        </thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>
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
    const matchesWithPredictions = matches.filter(m => m.prediction_count > 0);
    const totalPredictions = matches.reduce((sum, m) => sum + m.prediction_count, 0);
    const avgPredictionsPerMatch = matchesWithPredictions.length > 0
        ? Math.round(totalPredictions / matchesWithPredictions.length)
        : 0;

    const tabs = getFilters().map((f, i) =>
        `<button class="group-tab ${i === 0 ? 'active' : ''}" data-type="${f.type}" data-val="${f.val}">${f.label}</button>`
    ).join('');

    const totalPts = communityPoints ? communityPoints.total_points : 0;
    const exactCount = communityPoints ? communityPoints.exact_scores : 0;
    const correctCount = communityPoints ? communityPoints.correct_outcomes : 0;
    const predCount = communityPoints ? communityPoints.predictions_count : 0;

    return `
        <div class="community-points-hero" style="margin-bottom: var(--space-xl);">
            ${predCount > 0 ? `
                <div class="community-points-main">
                    <div class="community-points-value">${totalPts}</div>
                    <div class="community-points-label">${t('community_pts_label')}</div>
                </div>
                <div class="community-points-details">
                    <div class="community-points-detail">
                        <span class="community-points-detail-value" style="color:var(--accent-gold)">${exactCount}</span>
                        <span class="community-points-detail-label">${t('community_pts_exact')}</span>
                    </div>
                    <div class="community-points-detail">
                        <span class="community-points-detail-value" style="color:var(--accent-green)">${correctCount}</span>
                        <span class="community-points-detail-label">${t('community_pts_correct')}</span>
                    </div>
                    <div class="community-points-detail">
                        <span class="community-points-detail-value" style="color:var(--accent-blue)">${predCount}</span>
                        <span class="community-points-detail-label">${t('community_pts_matches')}</span>
                    </div>
                </div>
            ` : ''}
            <div class="community-summary-stats">
                <div class="community-summary-stat">
                    <div class="community-summary-value">${matchesWithPredictions.length}</div>
                    <div class="community-summary-label">${t('community_stat_pred_matches')}</div>
                </div>
                <div class="community-summary-stat">
                    <div class="community-summary-value">${totalPredictions}</div>
                    <div class="community-summary-label">${t('community_stat_total_preds')}</div>
                </div>
                <div class="community-summary-stat">
                    <div class="community-summary-value">${avgPredictionsPerMatch}</div>
                    <div class="community-summary-label">${t('community_stat_avg')}</div>
                </div>
            </div>
        </div>

        <h2 style="margin-bottom: var(--space-md);">Leaderboard</h2>
        ${renderLeaderboardTable(leaderboard, currentUser)}

        <h2 style="margin-bottom: var(--space-md);">Average Predictions</h2>
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
                grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🏆</div><div class="empty-state-text">Awaiting Bracket</div></div>`;
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
                    ${renderBracketRound(t('stage_r32'), bracket.round_of_32)}
                    ${renderBracketRound(t('stage_r16'), bracket.round_of_16)}
                    ${renderBracketRound(t('stage_qf'), bracket.quarter_finals)}
                    ${renderBracketRound(t('stage_sf'), bracket.semi_finals)}
                    ${bracket.third_place ? renderBracketRound(t('stage_3rd'), [bracket.third_place]) : ''}
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
                <h2>Join Private Community</h2>
                <p>You have been invited to join a private community.</p>
                <button id="btn-confirm-join" class="btn btn-primary" style="width: 100%; margin-top: 20px;">Join Community</button>
            </div>
        `,
        init: () => {
            document.getElementById('btn-confirm-join').addEventListener('click', async () => {
                const { isAuthenticated, fetchAPI } = await import('../api.js');
                if (!isAuthenticated()) {
                    alert("Please log in first to join a community.");
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
"""

with open(r"c:\Users\Alejandro\Projects\New folder\frontend\src\pages\community.js", "w", encoding="utf-8") as f:
    f.write(new_content)
