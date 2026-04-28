import { fetchAPI } from '../api.js';
import { renderMatchCard } from '../components/matchCard.js';
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

export async function matchesPage() {
    let matches = [];
    try {
        matches = await fetchAPI('/matches');
    } catch (e) {
        return `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">${e.message}</div></div>`;
    }

    const tabs = FILTERS.map((f, i) =>
        `<button class="group-tab ${i === 0 ? 'active' : ''}" data-type="${f.type}" data-val="${f.val}">${f.label}</button>`
    ).join('');

    const html = `
        <div class="fade-in">
            <h1 class="page-title">Matches</h1>
            <p class="page-subtitle">Click any match to submit your prediction</p>

            <div class="group-tabs" id="group-tabs">
                ${tabs}
            </div>

            <div id="standings-container"></div>

            <div class="matches-grid" id="matches-grid">
                ${matches.map(m => renderMatchCard(m)).join('')}
            </div>
        </div>
    `;

    return {
        html,
        init: () => {
            const grid = document.getElementById('matches-grid');
            const tabsContainer = document.getElementById('group-tabs');

            tabsContainer.addEventListener('click', async (e) => {
                const tab = e.target.closest('.group-tab');
                if (!tab) return;

                // Update active tab
                tabsContainer.querySelectorAll('.group-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                const filterType = tab.dataset.type;
                const filterVal = tab.dataset.val;

                const standingsContainer = document.getElementById('standings-container');
                standingsContainer.innerHTML = '';

                let filtered = matches;
                if (filterType === 'group') {
                    filtered = matches.filter(m => m.group_letter === filterVal);
                    // Fetch and render standings
                    try {
                        const stds = await fetchAPI(`/matches/standings/${filterVal}`);
                        let trs = stds.map((s, idx) => `
                            <tr style="border-bottom:1px solid var(--border-light)">
                                <td style="padding:12px 4px;text-align:center;font-weight:700;color:var(--text-muted)">${idx+1}</td>
                                <td style="padding:12px 4px;"><img src="${getFlagURL(s.team_code)}" style="width:20px;vertical-align:middle;margin-right:8px">${s.team_name}</td>
                                <td style="padding:12px 4px;text-align:center">${s.played}</td>
                                <td style="padding:12px 4px;text-align:center">${s.won}</td>
                                <td style="padding:12px 4px;text-align:center">${s.drawn}</td>
                                <td style="padding:12px 4px;text-align:center">${s.lost}</td>
                                <td style="padding:12px 4px;text-align:center">${s.goal_diff > 0 ? '+'+s.goal_diff : s.goal_diff}</td>
                                <td style="padding:12px 4px;text-align:center;font-weight:800;color:var(--accent-gold)">${s.points}</td>
                            </tr>
                        `).join('');

                        standingsContainer.innerHTML = `
                            <div class="card" style="margin-bottom:var(--space-lg);overflow-x:auto;">
                                <h3 style="margin-top:0;margin-bottom:var(--space-md)">Group ${filterVal} Standings</h3>
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
                    } catch (err) {
                        console.error('Failed to load standings', err);
                    }
                } else if (filterType === 'stage') {
                    filtered = matches.filter(m => m.stage === filterVal);
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
                                <div class="empty-state-text">No matches available in this filter yet</div>
                            </div>
                        `;
                    }
                } else {
                    grid.innerHTML = filtered.map(m => renderMatchCard(m)).join('');
                }
            });
        },
    };
}
