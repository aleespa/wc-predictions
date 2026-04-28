import { fetchAPI, isAuthenticated } from '../api.js';
import { showToast } from '../components/toast.js';
import { getCurrentUser } from '../components/navbar.js';
import { getFlagURL } from '../components/flags.js';

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
                <div class="empty-state-text">Admin access required</div>
                <a href="#/" class="btn btn-secondary">Go Home</a>
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

    const matchRow = (m) => `
        <div class="admin-match-row" id="admin-match-${m.id}">
            <span class="match-group-badge" style="flex-shrink:0">${m.group_letter ? 'Grp ' + m.group_letter : m.stage}</span>
            <span class="admin-match-teams">
                <img src="${getFlagURL(m.home_team.code)}" class="match-team-flag-svg" style="width:20px;vertical-align:middle;margin-right:4px;"> 
                ${m.home_team.name}
                <span style="color:var(--text-muted);margin:0 var(--space-sm)">vs</span>
                ${m.away_team.name}
                <img src="${getFlagURL(m.away_team.code)}" class="match-team-flag-svg" style="width:20px;vertical-align:middle;margin-left:4px;">
            </span>
            <div class="admin-match-score-inputs">
                <input type="number" class="admin-score-input" id="admin-home-${m.id}" min="0" max="20" placeholder="H" value="${m.home_score ?? ''}" />
                <span style="color:var(--text-muted);font-weight:700">—</span>
                <input type="number" class="admin-score-input" id="admin-away-${m.id}" min="0" max="20" placeholder="A" value="${m.away_score ?? ''}" />
            </div>
            <button class="btn btn-sm ${m.is_finished ? 'btn-secondary' : 'btn-success'}" onclick="window.__setResult(${m.id})" id="admin-btn-${m.id}">
                ${m.is_finished ? '✓ Done' : 'Set Result'}
            </button>
        </div>
    `;

    const html = `
        <div class="fade-in">
            <h1 class="page-title">⚙️ Admin Panel</h1>
            <p class="page-subtitle">Manage tournament results and scheduling</p>

            <div class="card" style="margin: var(--space-xl) 0;">
                <h3 style="margin-top:0;margin-bottom:var(--space-md);color:var(--accent-gold)">Create Knockout Match</h3>
                <form id="admin-create-match-form" style="display:flex;gap:var(--space-md);flex-wrap:wrap;align-items:flex-end;">
                    <div style="flex:1;min-width:150px">
                        <label class="form-label">Stage</label>
                        <select id="am-stage" class="form-input" required>
                            <option value="Round of 32">Round of 32</option>
                            <option value="Round of 16">Round of 16</option>
                            <option value="Quarter-finals">Quarter-finals</option>
                            <option value="Semi-finals">Semi-finals</option>
                            <option value="Final">Final</option>
                        </select>
                    </div>
                    <div style="flex:1;min-width:150px">
                        <label class="form-label" style="display:block;margin-bottom:0.5rem">Home Team</label>
                        <select id="am-home" class="form-input" required>
                            <option value="" disabled selected>Select Team...</option>
                            ${teamOptions}
                        </select>
                    </div>
                    <div style="flex:1;min-width:150px">
                        <label class="form-label" style="display:block;margin-bottom:0.5rem">Away Team</label>
                        <select id="am-away" class="form-input" required>
                            <option value="" disabled selected>Select Team...</option>
                            ${teamOptions}
                        </select>
                    </div>
                    <div style="flex:1;min-width:180px">
                        <label class="form-label" style="display:block;margin-bottom:0.5rem">Date/Time (Local)</label>
                        <input type="datetime-local" id="am-date" class="form-input" required />
                    </div>
                    <div style="flex:1;min-width:150px">
                        <label class="form-label" style="display:block;margin-bottom:0.5rem">Venue or Note</label>
                        <input type="text" id="am-venue" class="form-input" placeholder="Optional" />
                    </div>
                    <button type="submit" class="btn btn-primary" id="am-submit">Create Bracket</button>
                </form>
            </div>

            <h3 style="margin:var(--space-xl) 0 var(--space-md);font-size:1.1rem;color:var(--accent-gold)">
                Pending Results (${unfinished.length})
            </h3>
            <div id="admin-pending">
                ${unfinished.length === 0 ? '<p style="color:var(--text-muted)">All matches have results!</p>' : unfinished.map(matchRow).join('')}
            </div>

            <h3 style="margin:var(--space-xl) 0 var(--space-md);font-size:1.1rem;color:var(--accent-green)">
                Completed (${finished.length})
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
                    showToast('Please enter valid scores', 'error');
                    return;
                }

                btn.disabled = true;
                btn.textContent = 'Saving...';

                try {
                    await fetchAPI(`/admin/matches/${matchId}/result`, {
                        method: 'PUT',
                        body: JSON.stringify({ home_score: homeScore, away_score: awayScore }),
                    });
                    showToast(`Result saved: ${homeScore} — ${awayScore} ✓`);
                    btn.textContent = '✓ Done';
                    btn.className = 'btn btn-sm btn-secondary';
                } catch (err) {
                    showToast(err.message, 'error');
                    btn.disabled = false;
                    btn.textContent = 'Set Result';
                }
            };

            const createFormEl = document.getElementById('admin-create-match-form');
            if (createFormEl) {
                createFormEl.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    
                    const stage = document.getElementById('am-stage').value;
                    const homeId = parseInt(document.getElementById('am-home').value);
                    const awayId = parseInt(document.getElementById('am-away').value);
                    
                    if (homeId === awayId) {
                        showToast('Home and Away teams must be different', 'error');
                        return;
                    }

                    const dateStr = document.getElementById('am-date').value;
                    const venue = document.getElementById('am-venue').value;
                    
                    const btn = document.getElementById('am-submit');
                    btn.disabled = true;
                    btn.textContent = 'Creating...';

                    try {
                        const matchDate = new Date(dateStr).toISOString();
                        await fetchAPI('/admin/matches', {
                            method: 'POST',
                            body: JSON.stringify({
                                stage: stage,
                                home_team_id: homeId,
                                away_team_id: awayId,
                                match_date: matchDate,
                                venue: venue || "TBD",
                            })
                        });
                        showToast('Knockout Match scheduled successfully! 🏆');
                        setTimeout(() => {
                           window.dispatchEvent(new HashChangeEvent("hashchange"));
                        }, 600);
                    } catch (err) {
                        showToast(err.message, 'error');
                        btn.disabled = false;
                        btn.textContent = 'Create Bracket';
                    }
                });
            }

            return () => {
                delete window.__setResult;
            };
        },
    };
}
