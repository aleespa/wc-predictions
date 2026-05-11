import { fetchAPI, isAuthenticated } from '../api.js';
import { renderMatchCard } from '../components/matchCard.js';
import { t } from '../i18n.js';

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
            <div class="hero-badge">${t('home_hero_badge')}</div>
            <h1>${t('home_hero_title')}</h1>
            <p>${t('home_hero_desc')}</p>
            <div class="hero-actions">
                ${authed
                    ? `<a href="#/matches" class="btn btn-primary btn-lg">${t('home_btn_browse')}</a><a href="#/bracket" class="btn btn-secondary btn-lg">${t('home_btn_bracket')}</a><a href="#/leaderboard" class="btn btn-secondary btn-lg">${t('home_btn_leaderboard')}</a>`
                    : `<a href="#/register" class="btn btn-primary btn-lg">${t('home_btn_get_started')}</a><a href="#/matches" class="btn btn-secondary btn-lg">${t('home_btn_view_matches')}</a>`
                }
            </div>
            <div class="hero-stats">
                <div class="hero-stat">
                    <div class="hero-stat-value">48</div>
                    <div class="hero-stat-label">${t('home_stat_teams')}</div>
                </div>
                <div class="hero-stat">
                    <div class="hero-stat-value">104</div>
                    <div class="hero-stat-label">${t('home_stat_matches')}</div>
                </div>
                <div class="hero-stat">
                    <div class="hero-stat-value">16</div>
                    <div class="hero-stat-label">${t('home_stat_venues')}</div>
                </div>
                <div class="hero-stat">
                    <div class="hero-stat-value">5</div>
                    <div class="hero-stat-label">${t('home_stat_points')}</div>
                </div>
            </div>
        </div>

        ${upcomingMatches.length > 0 ? `
            <section class="fade-in" style="margin-top: var(--space-2xl)">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-lg)">
                    <h2 class="page-title" style="margin-bottom:0">${t('home_upcoming')}</h2>
                    <a href="#/matches" class="btn btn-secondary btn-sm">${t('home_view_all')}</a>
                </div>
                <div class="matches-grid">${matchCards}</div>
            </section>
        ` : ''}

        ${top5.length > 0 ? `
            <section class="fade-in" style="margin-top: var(--space-2xl)">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-lg)">
                    <h2 class="page-title" style="margin-bottom:0">${t('home_top_players')}</h2>
                    <a href="#/leaderboard" class="btn btn-secondary btn-sm">${t('home_full_rankings')}</a>
                </div>
                <div class="card">
                    <table class="leaderboard-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>${t('leaderboard_th_player')}</th>
                                <th>${t('leaderboard_th_points')}</th>
                                <th>${t('leaderboard_th_preds')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${top5.map(entry => {
                                const isCommunity = entry.is_community;
                                const nameHtml = isCommunity
                                    ? `${entry.username}`
                                    : `<a href="#/user/${encodeURIComponent(entry.username)}" class="leaderboard-user-link">${entry.username}</a>`;
                                return `
                                <tr>
                                    <td class="leaderboard-rank ${entry.rank <= 3 ? 'top-' + entry.rank : ''}">${entry.rank}</td>
                                    <td class="leaderboard-user">${nameHtml}</td>
                                    <td class="leaderboard-points">${entry.total_points}</td>
                                    <td class="leaderboard-stat">${entry.predictions_count}</td>
                                </tr>
                            `}).join('')}
                        </tbody>
                    </table>
                </div>
            </section>
        ` : ''}

        <section class="fade-in" style="margin-top: var(--space-2xl)">
            <div class="card" style="text-align:center;padding:var(--space-2xl)">
                <h3 style="margin-bottom:var(--space-md)">${t('home_scoring_works')}</h3>
                <div class="points-preview-grid" style="max-width:500px;margin:0 auto">
                    <div class="points-preview-item">
                        <div class="points-preview-value" style="color:var(--accent-gold)">5 ${t('common_pts')}</div>
                        <div class="points-preview-label">${t('home_exact_score')}</div>
                    </div>
                    <div class="points-preview-item">
                        <div class="points-preview-value" style="color:var(--accent-green)">3 ${t('common_pts')}</div>
                        <div class="points-preview-label">${t('home_result_gd')}</div>
                    </div>
                    <div class="points-preview-item">
                        <div class="points-preview-value" style="color:var(--accent-blue)">1 ${t('common_pt')}</div>
                        <div class="points-preview-label">${t('home_correct_outcome')}</div>
                    </div>
                </div>
            </div>
        </section>
    `;

    return html;
}
