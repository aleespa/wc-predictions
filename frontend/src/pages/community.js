import { fetchAPI } from '../api.js';
import { getFlagURL } from '../components/flags.js';

const FILTERS = [
    { label: '🌍 All', type: 'all', val: 'All' },
    ...['A','B','C','D','E','F','G','H','I','J','K','L'].map(g => ({ label: `Grp ${g}`, type: 'group', val: g })),
    { label: 'R32', type: 'stage', val: 'Round of 32' },
    { label: 'R16', type: 'stage', val: 'Round of 16' },
    { label: 'QF', type: 'stage', val: 'Quarter-finals' },
    { label: 'SF', type: 'stage', val: 'Semi-finals' },
    { label: 'Final', type: 'stage', val: 'Final' },
];

/**
 * Render a community match card with aggregated prediction statistics.
 */
function renderCommunityMatchCard(match, matchPointsMap = {}) {
    const isFinished = match.is_finished;
    const hasPredictions = match.prediction_count > 0;
    const matchDate = new Date(match.match_date);

    const dateStr = matchDate.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
    });
    const timeStr = matchDate.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit'
    });

    let statusHtml = '';
    if (isFinished) {
        statusHtml = '<span class="match-status finished">✓ Finished</span>';
    } else {
        statusHtml = '<span class="match-status upcoming">● Upcoming</span>';
    }

    let scoreHtml;
    if (isFinished) {
        scoreHtml = `<span class="match-score">${match.home_score} — ${match.away_score}</span>`;
    } else {
        scoreHtml = `
            <span class="match-vs-label">VS</span>
            <span style="font-size:0.7rem;color:var(--text-muted)">${timeStr}</span>
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
            impliedResult = `${match.home_team?.name || 'Home'} Win`;
            impliedColor = 'var(--accent-green)';
        } else if (roundedAway > roundedHome) {
            impliedResult = `${match.away_team?.name || 'Away'} Win`;
            impliedColor = 'var(--accent-blue)';
        } else {
            impliedResult = 'Draw';
            impliedColor = 'var(--accent-gold)';
        }

        communitySection = `
            <div class="community-stats-section">
                <div class="community-avg-score">
                    <div class="community-avg-label">Community Average</div>
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
                    let label = `${detail.predicted_home}–${detail.predicted_away} · 0 pts ❌`;
                    if (pts === 5) { color = 'var(--accent-gold)'; label = `${detail.predicted_home}–${detail.predicted_away} · 5 pts 🎯`; }
                    else if (pts === 3) { color = 'var(--accent-green)'; label = `${detail.predicted_home}–${detail.predicted_away} · 3 pts ✓`; }
                    else if (pts === 1) { color = 'var(--accent-blue)'; label = `${detail.predicted_home}–${detail.predicted_away} · 1 pt ✓`; }
                    return `
                        <div class="community-match-points" style="color:${color}">
                            ${label}
                        </div>
                    `;
                })()}
                <div class="community-count">
                    <span class="community-count-icon">👥</span>
                    ${match.prediction_count} prediction${match.prediction_count !== 1 ? 's' : ''}
                </div>
            </div>
        `;
    } else {
        communitySection = `
            <div class="community-stats-section community-empty">
                <div class="community-empty-icon">📊</div>
                <div class="community-empty-text">No predictions yet</div>
                <div class="community-empty-sub">Be the first to predict this match!</div>
            </div>
        `;
    }

    const classes = ['match-card', 'community-match-card'];
    if (isFinished) classes.push('finished');

    return `
        <div class="${classes.join(' ')}" id="community-match-${match.match_id}">
            <div class="match-card-header">
                <span class="match-group-badge">${match.group_letter ? 'Group ' + match.group_letter : match.stage}</span>
                ${statusHtml}
            </div>
            <div class="match-teams">
                <div class="match-team">
                    ${match.home_team ? `
                        <img src="${getFlagURL(match.home_team.code)}" alt="${match.home_team.code}" class="match-team-flag-svg" />
                        <span class="match-team-name">${match.home_team.name}</span>
                    ` : `
                        <span class="match-team-name" style="color:var(--text-muted);font-style:italic;font-size:0.7rem">${match.home_slot || 'TBD'}</span>
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
                        <span class="match-team-name" style="color:var(--text-muted);font-style:italic;font-size:0.7rem">${match.away_slot || 'TBD'}</span>
                    `}
                </div>
            </div>
            <div class="match-card-footer">
                <span class="match-venue">📍 ${match.venue || 'TBD'}</span>
                <span style="font-size:0.7rem;color:var(--text-muted)">${dateStr}</span>
            </div>
            ${communitySection}
        </div>
    `;
}


/**
 * Render standings table (reused for community predicted standings).
 */
function renderStandingsTable(standings, groupLetter, label = 'Community Predicted') {
    if (!standings || standings.length === 0) return '';

    const trs = standings.map((s, idx) => `
        <tr style="border-bottom:1px solid var(--border-light)">
            <td style="padding:12px 4px;text-align:center;font-weight:700;color:var(--text-muted)">${idx + 1}</td>
            <td style="padding:12px 4px;"><img src="${getFlagURL(s.team_code)}" style="width:20px;vertical-align:middle;margin-right:8px">${s.team_name}</td>
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
                <span style="color:var(--accent-purple-light)">👥</span> ${label} Standings — Group ${groupLetter}
            </h3>
            <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:var(--space-md)">
                Derived from rounding the community's average predicted scores
            </p>
            <table style="width:100%;border-collapse:collapse;font-size:0.95rem;white-space:nowrap;">
                <thead>
                    <tr style="border-bottom:2px solid var(--border-medium);color:var(--text-muted)">
                        <th style="padding:8px 4px;text-align:center">#</th>
                        <th style="padding:8px 4px;text-align:left">Team</th>
                        <th style="padding:8px 4px;text-align:center">MP</th>
                        <th style="padding:8px 4px;text-align:center">W</th>
                        <th style="padding:8px 4px;text-align:center">D</th>
                        <th style="padding:8px 4px;text-align:center">L</th>
                        <th style="padding:8px 4px;text-align:center">GD</th>
                        <th style="padding:8px 4px;text-align:center">Pts</th>
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
    const dateStr = matchDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const timeStr = matchDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const hasPredictions = match.prediction_count > 0;
    const isFinished = match.is_finished;

    function renderSlot(slot) {
        if (!slot || !slot.team) {
            const label = slot?.slot_label || 'TBD';
            return `
                <div class="bracket-team bracket-tbd">
                    <span class="bracket-team-name bracket-placeholder">${label}</span>
                </div>
            `;
        }
        const isWinner = match.derived_winner_team && match.derived_winner_team.id === slot.team.id;
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
            ${match.venue ? `<div class="bracket-venue">📍 ${match.venue}</div>` : ''}
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
                <span class="bracket-round-count">${matches.length} match${matches.length !== 1 ? 'es' : ''}</span>
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
export async function communityPage() {
    let matches = [];
    let communityPoints = null;
    try {
        [matches, communityPoints] = await Promise.all([
            fetchAPI('/community/matches'),
            fetchAPI('/community/points'),
        ]);
    } catch (e) {
        return `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">${e.message}</div></div>`;
    }

    // Build a map of match_id -> community points for that match
    const matchPointsMap = {};
    if (communityPoints && communityPoints.match_details) {
        for (const detail of communityPoints.match_details) {
            matchPointsMap[detail.match_id] = detail;
        }
    }

    // Compute summary stats
    const groupMatches = matches.filter(m => m.stage === 'Group Stage');
    const matchesWithPredictions = matches.filter(m => m.prediction_count > 0);
    const totalPredictions = matches.reduce((sum, m) => sum + m.prediction_count, 0);
    const avgPredictionsPerMatch = matchesWithPredictions.length > 0
        ? Math.round(totalPredictions / matchesWithPredictions.length)
        : 0;

    const tabs = FILTERS.map((f, i) =>
        `<button class="group-tab ${i === 0 ? 'active' : ''}" data-type="${f.type}" data-val="${f.val}">${f.label}</button>`
    ).join('');

    // Points breakdown for hero section
    const totalPts = communityPoints ? communityPoints.total_points : 0;
    const exactCount = communityPoints ? communityPoints.exact_scores : 0;
    const correctCount = communityPoints ? communityPoints.correct_outcomes : 0;
    const predCount = communityPoints ? communityPoints.predictions_count : 0;

    const html = `
        <div class="fade-in" id="community-page">
            <div class="community-hero">
                <h1 class="page-title">
                    <span style="background:linear-gradient(135deg, var(--accent-purple), var(--accent-cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">
                        👥 Community Predictions
                    </span>
                </h1>
                <p class="page-subtitle">See what the crowd thinks — aggregated prediction statistics from all users</p>

                ${predCount > 0 ? `
                    <div class="community-points-hero">
                        <div class="community-points-main">
                            <div class="community-points-value">${totalPts}</div>
                            <div class="community-points-label">Community Points</div>
                        </div>
                        <div class="community-points-details">
                            <div class="community-points-detail">
                                <span class="community-points-detail-value" style="color:var(--accent-gold)">${exactCount}</span>
                                <span class="community-points-detail-label">🎯 Exact</span>
                            </div>
                            <div class="community-points-detail">
                                <span class="community-points-detail-value" style="color:var(--accent-green)">${correctCount}</span>
                                <span class="community-points-detail-label">✓ Correct</span>
                            </div>
                            <div class="community-points-detail">
                                <span class="community-points-detail-value" style="color:var(--accent-blue)">${predCount}</span>
                                <span class="community-points-detail-label">Matches</span>
                            </div>
                        </div>
                    </div>
                ` : ''}

                <div class="community-summary-stats">
                    <div class="community-summary-stat">
                        <div class="community-summary-value">${matchesWithPredictions.length}</div>
                        <div class="community-summary-label">Matches Predicted</div>
                    </div>
                    <div class="community-summary-stat">
                        <div class="community-summary-value">${totalPredictions}</div>
                        <div class="community-summary-label">Total Predictions</div>
                    </div>
                    <div class="community-summary-stat">
                        <div class="community-summary-value">${avgPredictionsPerMatch}</div>
                        <div class="community-summary-label">Avg per Match</div>
                    </div>
                </div>
            </div>

            <div class="group-tabs" id="community-tabs">
                ${tabs}
            </div>

            <div id="community-standings-container"></div>
            <div id="community-bracket-container"></div>

            <div class="matches-grid" id="community-grid">
                ${groupMatches.map(m => renderCommunityMatchCard(m, matchPointsMap)).join('')}
            </div>
        </div>
    `;

    return {
        html,
        init: () => {
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

                    // Fetch community standings for this group
                    try {
                        const stds = await fetchAPI(`/community/standings/${filterVal}`);
                        standingsContainer.innerHTML = renderStandingsTable(stds, filterVal);
                    } catch (err) {
                        console.error('Failed to load community standings', err);
                    }
                } else if (filterType === 'stage') {
                    filtered = matches.filter(m => m.stage === filterVal);
                } else {
                    // "All" — show only group stage by default
                    filtered = groupMatches;
                }

                // Check if we should show knockout bracket
                if (filterType === 'stage' || filterType === 'all') {
                    // Only show knockout section for stage filters
                    if (filterType === 'stage') {
                        // Don't show bracket container for stage filters, just show cards
                    }
                }

                if (filtered.length === 0) {
                    if (filterType === 'stage') {
                        grid.innerHTML = `
                            <div class="empty-state" style="grid-column:1/-1">
                                <div class="empty-state-icon">🏆</div>
                                <div class="empty-state-text">Awaiting ${filterVal} Bracket</div>
                                <div style="color:var(--text-muted);font-size:0.85rem;margin-top:8px">Pairs will be scheduled once the group stages conclude.</div>
                            </div>
                        `;
                    } else {
                        grid.innerHTML = `
                            <div class="empty-state" style="grid-column:1/-1">
                                <div class="empty-state-icon">📭</div>
                                <div class="empty-state-text">No matches in this filter yet</div>
                            </div>
                        `;
                    }
                } else {
                    grid.innerHTML = filtered.map(m => renderCommunityMatchCard(m, matchPointsMap)).join('');
                }
            });

            // On initial load, try to load community bracket if available
            loadCommunityBracket(bracketContainer);
        },
    };
}


/**
 * Attempt to load the community knockout bracket section.
 */
async function loadCommunityBracket(container) {
    try {
        const bracket = await fetchAPI('/community/bracket');
        if (!bracket.available) {
            // Don't show anything — bracket not yet available
            return;
        }

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
                        <h2 style="margin:0;font-size:1.3rem;font-weight:800">
                            🏆 Community Knockout Bracket
                        </h2>
                        <p style="margin:var(--space-xs) 0 0;font-size:0.85rem;color:var(--text-muted)">
                            Bracket progression derived from the community's average predictions
                        </p>
                    </div>
                    <div class="bracket-stats-bar" style="margin:0">
                        <div class="bracket-stat">
                            <span class="bracket-stat-value">${predictedCount}</span>
                            <span class="bracket-stat-label">With Predictions</span>
                        </div>
                        <div class="bracket-stat">
                            <span class="bracket-stat-value">${allKoMatches.length}</span>
                            <span class="bracket-stat-label">KO Matches</span>
                        </div>
                    </div>
                </div>

                <div class="bracket-container">
                    ${renderBracketRound('Round of 32', bracket.round_of_32)}
                    ${renderBracketRound('Round of 16', bracket.round_of_16)}
                    ${renderBracketRound('Quarter-finals', bracket.quarter_finals)}
                    ${renderBracketRound('Semi-finals', bracket.semi_finals)}
                    ${bracket.third_place ? renderBracketRound('Third Place', [bracket.third_place]) : ''}
                    ${bracket.final ? renderBracketRound('🏆 Final', [bracket.final]) : ''}
                </div>
            </div>
        `;
    } catch (err) {
        console.error('Failed to load community bracket', err);
    }
}
