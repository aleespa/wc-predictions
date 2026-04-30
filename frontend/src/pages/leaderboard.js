import { fetchAPI } from '../api.js';
import { getCurrentUser } from '../components/navbar.js';

export async function leaderboardPage() {
    let leaderboard = [];
    let currentUser = null;
    try {
        leaderboard = await fetchAPI('/leaderboard');
        currentUser = await getCurrentUser();
    } catch (e) {
        return `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">${e.message}</div></div>`;
    }

    // Podium (top 3) — reorder: 2nd, 1st, 3rd
    const top3 = leaderboard.slice(0, 3);
    const podiumOrder = top3.length >= 3
        ? [top3[1], top3[0], top3[2]]
        : top3;

    const podiumHtml = podiumOrder.map((entry, idx) => {
        const actualRank = entry.rank;
        const isCommunity = entry.is_community;
        const initial = isCommunity ? '👥' : (entry.display_name || entry.username).charAt(0).toUpperCase();
        const nameClass = isCommunity ? 'podium-name-community' : '';
        return `
            <div class="podium-item ${isCommunity ? 'podium-community' : ''}">
                <div class="podium-avatar ${isCommunity ? 'podium-avatar-community' : ''}">${initial}</div>
                <div class="podium-name ${nameClass}">${entry.display_name || entry.username}</div>
                <div class="podium-points">${entry.total_points} pts</div>
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
            : `${entry.display_name || entry.username}${isMe ? ' (you)' : ''}`;
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
        <div class="leaderboard-container fade-in">
            <h1 class="page-title">🏆 Leaderboard</h1>
            <p class="page-subtitle">See who's leading the prediction game</p>

            ${top3.length >= 3 ? `
                <div class="podium">
                    ${podiumHtml}
                </div>
            ` : ''}

            ${leaderboard.length === 0 ? `
                <div class="empty-state">
                    <div class="empty-state-icon">🏜️</div>
                    <div class="empty-state-text">No predictions yet. Be the first to play!</div>
                    <a href="#/matches" class="btn btn-primary">Start Predicting</a>
                </div>
            ` : `
                <div class="card" style="overflow-x:auto">
                    <table class="leaderboard-table" style="width:100%">
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Player</th>
                                <th>Points</th>
                                <th>🎯 Exact</th>
                                <th>✓ Correct</th>
                                <th>Predictions</th>
                            </tr>
                        </thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>
            `}
        </div>
    `;
}
