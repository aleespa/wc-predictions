import { fetchAPI } from '../api.js';
import { renderMatchCard } from '../components/matchCard.js';
import { getFlagURL } from '../components/flags.js';
import { t } from '../i18n.js';

export async function matchesPage() {
    const FILTERS = [
        { label: t('matches_filter_all'), type: 'all', val: 'All' },
        ...['A','B','C','D','E','F','G','H','I','J','K','L'].map(g => ({ label: t('matches_filter_grp', { group: g }), type: 'group', val: g })),
        { label: t('matches_filter_r32'), type: 'stage', val: 'Round of 32' },
        { label: t('matches_filter_r16'), type: 'stage', val: 'Round of 16' },
        { label: t('matches_filter_qf'), type: 'stage', val: 'Quarter-finals' },
        { label: t('matches_filter_sf'), type: 'stage', val: 'Semi-finals' },
        { label: t('matches_filter_final'), type: 'stage', val: 'Final' },
    ];
    
    const PREDICTION_FILTERS = [
        { label: t('matches_pred_filter_all') || 'All', val: 'all' },
        { label: t('matches_pred_filter_with') || 'With Prediction', val: 'with' },
        { label: t('matches_pred_filter_without') || 'Without Prediction', val: 'without' }
    ];

    let matches = [];
    try {
        matches = await fetchAPI('/matches');
    } catch (e) {
        return `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">${e.message}</div></div>`;
    }

    const tabs = FILTERS.map((f, i) =>
        `<button class="group-tab ${i === 0 ? 'active' : ''}" data-type="${f.type}" data-val="${f.val}">${f.label}</button>`
    ).join('');
    
    const predTabs = PREDICTION_FILTERS.map((f, i) =>
        `<button class="group-tab pred-tab ${i === 0 ? 'active' : ''}" data-val="${f.val}">${f.label}</button>`
    ).join('');

    const html = `
        <div class="fade-in">
            <h1 class="page-title">${t('matches_title')}</h1>
            <p class="page-subtitle">${t('matches_subtitle')}</p>

            <div class="group-tabs" id="group-tabs" style="margin-bottom: var(--space-sm)">
                ${tabs}
            </div>
            
            <div class="group-tabs" id="pred-tabs" style="margin-bottom: var(--space-lg); padding: 4px; background: rgba(0,0,0,0.05); border-radius: var(--radius-lg); display: inline-flex;">
                ${predTabs}
            </div>

            <div id="standings-container"></div>

            <div class="matches-grid" id="matches-grid">
                <!-- Matches will be rendered here by init() -->
            </div>
        </div>
    `;

    return {
        html,
        init: () => {
            const grid = document.getElementById('matches-grid');
            const tabsContainer = document.getElementById('group-tabs');
            const predTabsContainer = document.getElementById('pred-tabs');
            
            let currentFilterType = 'all';
            let currentFilterVal = 'All';
            let currentPredFilter = 'all';

            const renderMatches = async () => {
                const standingsContainer = document.getElementById('standings-container');
                standingsContainer.innerHTML = '';

                let filtered = matches;
                
                // 1. Apply Group/Stage filter
                if (currentFilterType === 'group') {
                    filtered = matches.filter(m => m.group_letter === currentFilterVal);
                    // Fetch and render standings
                    try {
                        const stds = await fetchAPI(`/matches/standings/${currentFilterVal}`);
                        let trs = stds.map((s, idx) => {
                            const isPredicted = s.is_predicted;
                            const rowStyle = isPredicted ? 'color: var(--accent-purple-light); font-style: italic;' : '';
                            const pointsStyle = isPredicted ? 'color: var(--accent-purple);' : 'color: var(--accent-gold);';
                            
                            return `
                                <tr style="border-bottom:1px solid var(--border-light); ${rowStyle}">
                                    <td style="padding:12px 4px;text-align:center;font-weight:700;color:var(--text-muted)">${idx+1}</td>
                                    <td style="padding:12px 4px;"><img src="${getFlagURL(s.team_code)}" class="match-team-flag-svg" style="width:24px; height:16px; margin-right:8px">${s.team_name}${isPredicted ? ' *' : ''}</td>
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
                                <table style="width:100%;border-collapse:collapse;font-size:0.95rem;white-space:nowrap;">
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
                                <div style="margin-top:var(--space-md); font-size:0.75rem; color:var(--text-muted); display:flex; gap:var(--space-lg); justify-content: flex-end;">
                                    <div style="display:flex; align-items:center; gap:4px">
                                        <span style="width:8px; height:8px; border-radius:50%; background:var(--accent-gold)"></span>
                                        ${t('matches_standings_legend_confirmed')}
                                    </div>
                                    <div style="display:flex; align-items:center; gap:4px">
                                        <span style="width:8px; height:8px; border-radius:50%; background:var(--accent-purple)"></span>
                                        ${t('matches_standings_legend_predicted')}
                                    </div>
                                </div>
                            </div>
                        `;
                    } catch (err) {
                        console.error('Failed to load standings', err);
                    }
                } else if (currentFilterType === 'stage') {
                    filtered = matches.filter(m => m.stage === currentFilterVal);
                }
                
                // 2. Apply Prediction filter
                if (currentPredFilter === 'with') {
                    filtered = filtered.filter(m => m.user_prediction != null);
                } else if (currentPredFilter === 'without') {
                    filtered = filtered.filter(m => m.user_prediction == null);
                }
                
                // 3. Sort: Move predicted matches to the bottom
                // If it's a specific stage, it might be better to keep the bracket order, 
                // but based on request we will sort all views.
                filtered.sort((a, b) => {
                    const aHasPred = a.user_prediction != null;
                    const bHasPred = b.user_prediction != null;
                    if (aHasPred && !bHasPred) return 1;
                    if (!aHasPred && bHasPred) return -1;
                    // If both have or both don't have predictions, keep original order (which is usually chronological/match_number)
                    return a.id - b.id; 
                });

                if (filtered.length === 0) {
                    if (currentFilterType === 'stage') {
                        let stg = currentFilterVal === 'Round of 32' ? t('stage_r32') : currentFilterVal === 'Round of 16' ? t('stage_r16') : currentFilterVal === 'Quarter-finals' ? t('stage_qf') : currentFilterVal === 'Semi-finals' ? t('stage_sf') : currentFilterVal === 'Final' ? t('stage_final') : currentFilterVal;
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
                    if (currentFilterType === 'stage' && currentFilterVal !== 'all') {
                        // For knockout stages, use the bracket card style
                        import('./bracket.js').then(({ renderBracketMatch }) => {
                            const transformToBracketMatch = (m) => ({
                                match_id: m.id,
                                match_number: m.match_number,
                                match_date: m.match_date,
                                venue: m.venue,
                                home: { 
                                    team: m.home_team, 
                                    slot_label: m.home_slot, 
                                    is_predicted: m.is_home_predicted 
                                },
                                away: { 
                                    team: m.away_team, 
                                    slot_label: m.away_slot, 
                                    is_predicted: m.is_away_predicted 
                                },
                                is_finished: m.is_finished,
                                home_score: m.home_score,
                                away_score: m.away_score,
                                user_prediction: m.user_prediction,
                                is_invalid_prediction: m.is_invalid_prediction || (m.user_prediction && m.user_prediction.is_invalid)
                            });
                            grid.innerHTML = filtered.map(m => renderBracketMatch(transformToBracketMatch(m))).join('');
                        });
                    } else {
                        grid.innerHTML = filtered.map(m => renderMatchCard(m)).join('');
                    }
                }
            };

            tabsContainer.addEventListener('click', (e) => {
                const tab = e.target.closest('.group-tab');
                if (!tab) return;

                tabsContainer.querySelectorAll('.group-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                currentFilterType = tab.dataset.type;
                currentFilterVal = tab.dataset.val;
                
                renderMatches();
            });
            
            predTabsContainer.addEventListener('click', (e) => {
                const tab = e.target.closest('.pred-tab');
                if (!tab) return;

                predTabsContainer.querySelectorAll('.pred-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                currentPredFilter = tab.dataset.val;
                
                renderMatches();
            });
            
            // Initial render
            renderMatches();
        },
    };
}
