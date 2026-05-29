import { fetchAPI } from '../api.js';
import { renderMatchCard } from '../components/matchCard.js';
import { renderRound } from './bracket.js';
import { getFlagURL } from '../components/flags.js';
import { t } from '../i18n.js';

export async function userProfilePage(params) {
    const username = params.username;

    const FILTERS = [
        { label: t('matches_filter_all'), type: 'all', val: 'All' },
        ...['A','B','C','D','E','F','G','H','I','J','K','L'].map(g => ({ label: t('matches_filter_grp', { group: g }), type: 'group', val: g })),
        { label: t('matches_filter_thirds'), type: 'thirds', val: 'thirds' },
        { label: t('matches_filter_r32'), type: 'stage', val: 'Round of 32' },
        { label: t('matches_filter_r16'), type: 'stage', val: 'Round of 16' },
        { label: t('matches_filter_qf'), type: 'stage', val: 'Quarter-finals' },
        { label: t('matches_filter_sf'), type: 'stage', val: 'Semi-finals' },
        { label: t('matches_filter_final'), type: 'stage', val: 'Final' },
        { label: t('bracket_title') || 'Bracket', type: 'bracket', val: 'bracket' }
    ];
    
    const PREDICTION_FILTERS = [
        { label: t('matches_pred_filter_all') || 'All', val: 'all' },
        { label: t('matches_pred_filter_with') || 'With Prediction', val: 'with' },
        { label: t('matches_pred_filter_without') || 'Without Prediction', val: 'without' }
    ];

    let profile, matches, bracket;
    try {
        const [p, m, b] = await Promise.all([
            fetchAPI(`/users/${encodeURIComponent(username)}`),
            fetchAPI(`/matches?username=${encodeURIComponent(username)}`),
            fetchAPI(`/knockout/bracket?username=${encodeURIComponent(username)}`)
        ]);
        profile = p;
        matches = m;
        bracket = b;
    } catch (e) {
        if (e.message.includes('not found') || e.message.includes('404')) {
            return `
                <div class="empty-state fade-in">
                    <div class="empty-state-icon">🔍</div>
                    <div class="empty-state-text">${t('user_profile_not_found')}</div>
                    <button class="btn btn-primary" style="margin-top:var(--space-lg)" onclick="location.hash='#/community'">${t('user_profile_back_community')}</button>
                </div>
            `;
        }
        return `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">${e.message}</div></div>`;
    }

    const initial = (profile.username || '?').charAt(0).toUpperCase();

    const tabs = FILTERS.map((f, i) =>
        `<button class="group-tab ${i === 0 ? 'active' : ''}" data-type="${f.type}" data-val="${f.val}">${f.label}</button>`
    ).join('');
    
    const predTabs = PREDICTION_FILTERS.map((f, i) =>
        `<button class="group-tab pred-tab ${i === 0 ? 'active' : ''}" data-val="${f.val}">${f.label}</button>`
    ).join('');

    const html = `
        <div class="fade-in" id="user-profile-page">
            <!-- Share bar -->
            <div class="user-profile-share-bar">
                <button class="btn btn-secondary btn-sm" id="btn-share-profile" title="${t('user_profile_share')}">
                    🔗 ${t('user_profile_share')}
                </button>
                <a href="#/community" class="btn btn-secondary btn-sm">← ${t('user_profile_back_community')}</a>
            </div>

            <!-- User header -->
            <div class="user-profile-header">
                <div class="user-profile-avatar">${initial}</div>
                <div class="user-profile-info">
                    <h1 class="user-profile-name">${profile.username}</h1>
                    <p class="user-profile-username">@${profile.username} · ${t('profile_joined', { date: new Date(profile.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) })}</p>
                </div>
            </div>

            <!-- Stats bar -->
            <div class="profile-stats user-profile-stats">
                <div class="profile-stat-card">
                    <div class="profile-stat-value"><span class="stat-number">${profile.total_points}</span></div>
                    <div class="profile-stat-label">${t('leaderboard_th_points')}</div>
                </div>
                <div class="profile-stat-card">
                    <div class="profile-stat-value">🎯 <span class="stat-number">${profile.exact_scores}</span></div>
                    <div class="profile-stat-label">${t('leaderboard_th_exact')}</div>
                </div>
                <div class="profile-stat-card">
                    <div class="profile-stat-value">✓ <span class="stat-number">${profile.correct_outcomes}</span></div>
                    <div class="profile-stat-label">${t('leaderboard_th_correct')}</div>
                </div>
                <div class="profile-stat-card">
                    <div class="profile-stat-value">🔮 <span class="stat-number">${profile.predictions_count}</span></div>
                    <div class="profile-stat-label">${t('leaderboard_th_preds')}</div>
                </div>
            </div>

            <!-- Matches Section -->
            <h2 style="margin-bottom: var(--space-md); margin-top: var(--space-xl)">
                <span style="background:linear-gradient(135deg, var(--accent-purple), var(--accent-cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">
                    🔮 ${t('user_profile_preds_title', { name: profile.username })}
                </span>
            </h2>

            <div class="group-tabs" id="user-group-tabs" style="margin-bottom: var(--space-sm)">
                ${tabs}
            </div>
            
            <div class="group-tabs" id="user-pred-tabs" style="margin-bottom: var(--space-lg); padding: 4px; background: rgba(0,0,0,0.05); border-radius: var(--radius-lg); display: inline-flex;">
                ${predTabs}
            </div>

            <div id="user-standings-container"></div>

            <div class="matches-grid" id="user-matches-grid">
                <!-- Matches will be rendered here by init() -->
            </div>
        </div>
    `;

    return {
        html,
        init: () => {
            const grid = document.getElementById('user-matches-grid');
            const tabsContainer = document.getElementById('user-group-tabs');
            const predTabsContainer = document.getElementById('user-pred-tabs');
            const shareBtn = document.getElementById('btn-share-profile');

            if (shareBtn) {
                shareBtn.addEventListener('click', () => {
                    const url = window.location.origin + window.location.pathname + '#/user/' + profile.username;
                    navigator.clipboard.writeText(url).then(() => {
                        shareBtn.textContent = '✓ ' + t('user_profile_copied');
                        setTimeout(() => { shareBtn.textContent = '🔗 ' + t('user_profile_share'); }, 2000);
                    }).catch(() => {
                        prompt('Copy this link:', url);
                    });
                });
            }

            let currentFilterType = 'all';
            let currentFilterVal = 'All';
            let currentPredFilter = 'all';

            const renderMatches = async () => {
                const standingsContainer = document.getElementById('user-standings-container');
                standingsContainer.innerHTML = '';

                if (currentFilterType === 'bracket') {
                    predTabsContainer.style.display = 'none';
                } else {
                    predTabsContainer.style.display = 'inline-flex';
                }
                
                let filtered = matches;
                
                // 1. Apply Group/Stage filter
                if (currentFilterType === 'thirds') {
                    filtered = []; // No matches for "thirds" view itself
                    grid.innerHTML = `<div class="loading" style="grid-column: 1/-1; text-align: center; padding: 2rem;">${t('matches_loading_thirds')}</div>`;
                    try {
                        const stds = await fetchAPI(`/matches/thirds?username=${encodeURIComponent(username)}`);
                        grid.innerHTML = '';
                        if (stds.length === 0) {
                             grid.innerHTML = `
                                <div class="empty-state" style="grid-column:1/-1">
                                    <div class="empty-state-icon">📭</div>
                                    <div class="empty-state-text">${t('matches_no_matches')}</div>
                                </div>
                            `;
                            return;
                        }
                        let trs = stds.map((s, idx) => {
                            const isPredicted = s.is_predicted;
                            const rowStyle = isPredicted ? 'color: var(--accent-purple-light); font-style: italic;' : '';
                            const pointsStyle = isPredicted ? 'color: var(--accent-purple);' : 'color: var(--accent-gold);';
                            const qualStyle = idx < 8 ? 'background: rgba(255,215,0,0.05);' : '';

                            return `
                                <tr style="border-bottom:1px solid var(--border-light); ${rowStyle} ${qualStyle}">
                                    <td style="padding:12px 4px;text-align:center;font-weight:700;color:var(--text-muted)">${idx+1}</td>
                                    <td style="padding:12px 4px;"><img src="${getFlagURL(s.team_code)}" class="match-team-flag-svg" style="width:24px; height:16px; margin-right:8px">${t(s.team_name)}${isPredicted ? ' *' : ''}</td>
                                    <td style="padding:12px 4px;text-align:center;font-weight:600;color:var(--accent-gold)">${s.group_letter}</td>
                                    <td style="padding:12px 4px;text-align:center">${s.played}</td>
                                    <td style="padding:12px 4px;text-align:center">${s.won}</td>
                                    <td style="padding:12px 4px;text-align:center">${s.drawn}</td>
                                    <td style="padding:12px 4px;text-align:center">${s.lost}</td>
                                    <td style="padding:12px 4px;text-align:center">${s.goal_diff > 0 ? '+'+s.goal_diff : s.goal_diff}</td>
                                    <td style="padding:12px 4px;text-align:center;font-weight:800; ${pointsStyle}">${s.points}</td>
                                </tr>
                            `;
                        }).join('');

                        standingsContainer.innerHTML = `
                            <div class="card" style="margin-bottom:var(--space-lg);overflow-x:auto;">
                                <h3 style="margin-top:0;margin-bottom:var(--space-md)">${t('matches_standings_thirds_title')}</h3>
                                <table style="width:100%;border-collapse:collapse;font-size:1.1rem;white-space:nowrap;">
                                    <thead>
                                        <tr style="border-bottom:2px solid var(--border-medium);color:var(--text-muted)">
                                            <th style="padding:8px 4px;text-align:center">#</th>
                                            <th style="padding:8px 4px;text-align:left">${t('matches_standings_team')}</th>
                                            <th style="padding:8px 4px;text-align:center">${t('matches_filter_grp', { group: '' }).replace(':','').trim()}</th>
                                            <th style="padding:8px 4px;text-align:center">${t('matches_standings_mp')}</th>
                                            <th style="padding:8px 4px;text-align:center">${t('matches_standings_w')}</th>
                                            <th style="padding:8px 4px;text-align:center">${t('matches_standings_d')}</th>
                                            <th style="padding:8px 4px;text-align:center">${t('matches_standings_l')}</th>
                                            <th style="padding:8px 4px;text-align:center">${t('matches_standings_gd')}</th>
                                            <th style="padding:8px 4px;text-align:center">${t('matches_standings_pts')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${trs}
                                    </tbody>
                                </table>
                                <div style="margin-top:var(--space-md); font-size:0.95rem; color:var(--text-muted); display:flex; gap:var(--space-lg); justify-content: flex-end;">
                                    <div style="display:flex; align-items:center; gap:4px">
                                        <span style="width:8px; height:8px; border-radius:50%; background:var(--accent-gold)"></span>
                                        ${t('matches_standings_legend_confirmed')}
                                    </div>
                                    <div style="display:flex; align-items:center; gap:4px">
                                        <span style="width:8px; height:8px; border-radius:50%; background:var(--accent-purple)"></span>
                                        ${t('matches_standings_legend_user_predicted', { name: profile.username })}
                                    </div>
                                </div>
                            </div>
                        `;
                    } catch (err) {
                        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">${t('matches_error_thirds', { msg: err.message })}</div></div>`;
                    }
                } else if (currentFilterType === 'group') {
                    filtered = matches.filter(m => m.group_letter === currentFilterVal);
                    // Fetch and render standings
                    try {
                        const stds = await fetchAPI(`/matches/standings/${currentFilterVal}?username=${encodeURIComponent(username)}`);
                        let trs = stds.map((s, idx) => {
                            const isPredicted = s.is_predicted;
                            const rowStyle = isPredicted ? 'color: var(--accent-purple-light); font-style: italic;' : '';
                            const pointsStyle = isPredicted ? 'color: var(--accent-purple);' : 'color: var(--accent-gold);';
                            
                            return `
                                <tr style="border-bottom:1px solid var(--border-light); ${rowStyle}">
                                    <td style="padding:12px 4px;text-align:center;font-weight:700;color:var(--text-muted)">${idx+1}</td>
                                    <td style="padding:12px 4px;"><img src="${getFlagURL(s.team_code)}" class="match-team-flag-svg" style="width:24px; height:16px; margin-right:8px">${t(s.team_name)}${isPredicted ? ' *' : ''}</td>
                                    <td style="padding:12px 4px;text-align:center">${s.played}</td>
                                    <td style="padding:12px 4px;text-align:center">${s.won}</td>
                                    <td style="padding:12px 4px;text-align:center">${s.drawn}</td>
                                    <td style="padding:12px 4px;text-align:center">${s.lost}</td>
                                    <td style="padding:12px 4px;text-align:center">${s.goal_diff > 0 ? '+'+s.goal_diff : s.goal_diff}</td>
                                    <td style="padding:12px 4px;text-align:center;font-weight:800; ${pointsStyle}">${s.points}</td>
                                </tr>
                            `;
                        }).join('');

                        standingsContainer.innerHTML = `
                            <div class="card" style="margin-bottom:var(--space-lg);overflow-x:auto;">
                                <h3 style="margin-top:0;margin-bottom:var(--space-md)">${t('matches_standings_title', { group: currentFilterVal })}</h3>
                                <table style="width:100%;border-collapse:collapse;font-size:1.1rem;white-space:nowrap;">
                                    <thead>
                                        <tr style="border-bottom:2px solid var(--border-medium);color:var(--text-muted)">
                                            <th style="padding:8px 4px;text-align:center">#</th>
                                            <th style="padding:8px 4px;text-align:left">${t('matches_standings_team')}</th>
                                            <th style="padding:8px 4px;text-align:center">${t('matches_standings_mp')}</th>
                                            <th style="padding:8px 4px;text-align:center">${t('matches_standings_w')}</th>
                                            <th style="padding:8px 4px;text-align:center">${t('matches_standings_d')}</th>
                                            <th style="padding:8px 4px;text-align:center">${t('matches_standings_l')}</th>
                                            <th style="padding:8px 4px;text-align:center">${t('matches_standings_gd')}</th>
                                            <th style="padding:8px 4px;text-align:center">${t('matches_standings_pts')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${trs}
                                    </tbody>
                                </table>
                                <div style="margin-top:var(--space-md); font-size:0.95rem; color:var(--text-muted); display:flex; gap:var(--space-lg); justify-content: flex-end;">
                                    <div style="display:flex; align-items:center; gap:4px">
                                        <span style="width:8px; height:8px; border-radius:50%; background:var(--accent-gold)"></span>
                                        ${t('matches_standings_legend_confirmed')}
                                    </div>
                                    <div style="display:flex; align-items:center; gap:4px">
                                        <span style="width:8px; height:8px; border-radius:50%; background:var(--accent-purple)"></span>
                                        ${t('matches_standings_legend_user_predicted', { name: profile.username })}
                                    </div>
                                </div>
                            </div>
                        `;
                    } catch (err) {
                        console.error('Failed to load standings', err);
                    }
                } else if (currentFilterType === 'bracket') {
                    standingsContainer.innerHTML = '';
                    
                    grid.innerHTML = `
                        <div style="grid-column:1/-1; overflow-x:auto;">
                            <div id="bracket-rounds-view" class="bracket-container">
                                ${renderRound(t('stage_roundof32'), bracket.round_of_32, { profileName: profile.username })}
                                ${renderRound(t('stage_roundof16'), bracket.round_of_16, { compact: true, profileName: profile.username })}
                                ${renderRound(t('stage_quarterfinals'), bracket.quarter_finals, { compact: true, profileName: profile.username })}
                                ${renderRound(t('stage_semifinals'), bracket.semi_finals, { compact: true, profileName: profile.username })}
                                ${bracket.third_place ? renderRound(t('stage_thirdplace'), [bracket.third_place], { compact: true, profileName: profile.username }) : ''}
                                ${bracket.final ? renderRound(t('stage_final'), [bracket.final], { profileName: profile.username }) : ''}
                            </div>
                        </div>
                    `;
                    
                    // Remove links from bracket matches
                    document.querySelectorAll('#user-matches-grid .bracket-match').forEach(el => {
                        el.removeAttribute('onclick');
                        el.classList.remove('bracket-match-clickable');
                    });
                    
                    return; // Stop normal rendering
                } else if (currentFilterType === 'stage') {
                    filtered = matches.filter(m => m.stage === currentFilterVal);
                }
                
                // 2. Apply Prediction filter
                if (currentPredFilter === 'with') {
                    filtered = filtered.filter(m => m.user_prediction != null);
                } else if (currentPredFilter === 'without') {
                    filtered = filtered.filter(m => m.user_prediction == null);
                }
                
                // 3. Sort: Move predicted matches to the top (first), ordered by date ascending
                filtered.sort((a, b) => {
                    const aHasPred = a.user_prediction != null;
                    const bHasPred = b.user_prediction != null;
                    if (aHasPred && !bHasPred) return -1;
                    if (!aHasPred && bHasPred) return 1;
                    return new Date(a.match_date) - new Date(b.match_date); 
                });

                if (filtered.length === 0) {
                    if (currentFilterType === 'stage') {
                        let stg = t('stage_' + currentFilterVal.toLowerCase().replace(/[^a-z0-9]/g, '')) || currentFilterVal;
                        grid.innerHTML = `
                            <div class="empty-state" style="grid-column:1/-1">
                                <div class="empty-state-icon">🏆</div>
                                <div class="empty-state-text">${t('matches_awaiting_bracket', { stage: stg })}</div>
                                <div style="color:var(--text-muted);font-size:0.85rem;margin-top:8px">${t('matches_awaiting_sub')}</div>
                            </div>
                        `;
                    } else {
                        grid.innerHTML = `
                            <div class="empty-state" style="grid-column:1/-1">
                                <div class="empty-state-icon">📭</div>
                                <div class="empty-state-text">${t('matches_no_matches')}</div>
                            </div>
                        `;
                    }
                } else {
                    // Re-use standard renderMatchCard
                    grid.innerHTML = filtered.map(m => renderMatchCard(m, { profileName: profile.username })).join('');
                    
                    // But we don't want them to be clickable to /predict since they are someone else's matches!
                    document.querySelectorAll('#user-matches-grid .match-card').forEach(el => {
                        el.removeAttribute('onclick');
                        el.style.cursor = 'default';
                        // Keep hover effects but remove the link behavior
                    });
                }
            };

            tabsContainer.addEventListener('click', (e) => {
                if (e.target.classList.contains('group-tab')) {
                    tabsContainer.querySelectorAll('.group-tab').forEach(btn => btn.classList.remove('active'));
                    e.target.classList.add('active');
                    currentFilterType = e.target.dataset.type;
                    currentFilterVal = e.target.dataset.val;
                    renderMatches();
                }
            });
            
            predTabsContainer.addEventListener('click', (e) => {
                if (e.target.classList.contains('pred-tab')) {
                    predTabsContainer.querySelectorAll('.pred-tab').forEach(btn => btn.classList.remove('active'));
                    e.target.classList.add('active');
                    currentPredFilter = e.target.dataset.val;
                    renderMatches();
                }
            });

            // Initial render
            renderMatches();
        }
    };
}
