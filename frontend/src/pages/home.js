import { fetchAPI, isAuthenticated } from '../api.js';
import { renderMatchCard } from '../components/matchCard.js';

export async function homePage() {
    const authed = isAuthenticated();

    let upcomingMatches = [];
    let leaderboard = [];
    try {
        const allMatches = await fetchAPI('/matches?finished=false');
        upcomingMatches = allMatches.slice(0, 6);
        leaderboard = await fetchAPI('/leaderboard');
    } catch (e) {
        console.error(e);
    }

    const matchCards = upcomingMatches.map(m => renderMatchCard(m)).join('');
    const top5 = leaderboard.slice(0, 5);

    const html = `
        <div class="hero">
            <div class="hero-badge">🏆 FIFA World Cup 2026 · USA · Mexico · Canada</div>
            <h1>Predict. Compete.<br/><span class="gradient-text">Win the Glory.</span></h1>
            <p>Make your predictions for every World Cup 2026 match. Earn points for accuracy and climb the global leaderboard.</p>
            <div class="hero-actions">
                ${authed
                    ? '<a href="#/matches" class="btn btn-primary btn-lg">Browse Matches</a><a href="#/bracket" class="btn btn-secondary btn-lg">🏆 Bracket</a><a href="#/leaderboard" class="btn btn-secondary btn-lg">Leaderboard</a>'
                    : '<a href="#/register" class="btn btn-primary btn-lg">Get Started Free</a><a href="#/matches" class="btn btn-secondary btn-lg">View Matches</a>'
                }
            </div>
            <div class="hero-stats">
                <div class="hero-stat">
                    <div class="hero-stat-value">48</div>
                    <div class="hero-stat-label">Teams</div>
                </div>
                <div class="hero-stat">
                    <div class="hero-stat-value">104</div>
                    <div class="hero-stat-label">Matches</div>
                </div>
                <div class="hero-stat">
                    <div class="hero-stat-value">16</div>
                    <div class="hero-stat-label">Venues</div>
                </div>
                <div class="hero-stat">
                    <div class="hero-stat-value">5</div>
                    <div class="hero-stat-label">Max Points</div>
                </div>
            </div>
        </div>

        ${upcomingMatches.length > 0 ? `
            <section class="fade-in" style="margin-top: var(--space-2xl)">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-lg)">
                    <h2 class="page-title" style="margin-bottom:0">Upcoming Matches</h2>
                    <a href="#/matches" class="btn btn-secondary btn-sm">View All →</a>
                </div>
                <div class="matches-grid">${matchCards}</div>
            </section>
        ` : ''}

        ${top5.length > 0 ? `
            <section class="fade-in" style="margin-top: var(--space-2xl)">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-lg)">
                    <h2 class="page-title" style="margin-bottom:0">Top Players</h2>
                    <a href="#/leaderboard" class="btn btn-secondary btn-sm">Full Rankings →</a>
                </div>
                <div class="card">
                    <table class="leaderboard-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Player</th>
                                <th>Points</th>
                                <th>Predictions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${top5.map(entry => `
                                <tr>
                                    <td class="leaderboard-rank ${entry.rank <= 3 ? 'top-' + entry.rank : ''}">${entry.rank}</td>
                                    <td class="leaderboard-user">${entry.display_name || entry.username}</td>
                                    <td class="leaderboard-points">${entry.total_points}</td>
                                    <td class="leaderboard-stat">${entry.predictions_count}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </section>
        ` : ''}

        <section class="fade-in" style="margin-top: var(--space-2xl)">
            <div class="card" style="text-align:center;padding:var(--space-2xl)">
                <h3 style="margin-bottom:var(--space-md)">🏅 How Scoring Works</h3>
                <div class="points-preview-grid" style="max-width:500px;margin:0 auto">
                    <div class="points-preview-item">
                        <div class="points-preview-value" style="color:var(--accent-gold)">5 pts</div>
                        <div class="points-preview-label">Exact Score</div>
                    </div>
                    <div class="points-preview-item">
                        <div class="points-preview-value" style="color:var(--accent-green)">3 pts</div>
                        <div class="points-preview-label">Result + Goal Diff</div>
                    </div>
                    <div class="points-preview-item">
                        <div class="points-preview-value" style="color:var(--accent-blue)">1 pt</div>
                        <div class="points-preview-label">Correct Outcome</div>
                    </div>
                </div>
            </div>
        </section>
    `;

    return html;
}
