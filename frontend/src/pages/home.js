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
                    ? `<a href="#/matches" class="btn btn-primary btn-lg">${t('home_btn_browse')}</a><a href="#/bracket" class="btn btn-secondary btn-lg">${t('home_btn_bracket')}</a><a href="#/community" class="btn btn-secondary btn-lg">${t('home_btn_leaderboard')}</a>`
                    : `<a href="#/register" class="btn btn-primary btn-lg">${t('home_btn_get_started')}</a>`
                }
            </div>

            <div style="margin-top: var(--space-2xl); display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--space-xl);">
                <!-- How to Play Section -->
                <div class="card" style="padding: var(--space-xl); background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); text-align: left;">
                    <h3 style="margin-bottom: var(--space-lg); display: flex; align-items: center; gap: 8px; font-size: 1.5rem;">
                        📖 ${t('home_how_to_play')}
                    </h3>
                    <div style="display: flex; flex-direction: column; gap: var(--space-md); color: var(--text-primary); font-size: 1.1rem; line-height: 1.6;">
                        <div>${t('home_how_to_play_1')}</div>
                        <div>${t('home_how_to_play_2')}</div>
                        <div>${t('home_how_to_play_3')}</div>
                        <div>${t('home_how_to_play_4')}</div>
                    </div>
                </div>

                <!-- Points Table Section -->
                <div class="card" style="padding: var(--space-xl); background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05);">
                    <h3 style="margin-bottom: var(--space-lg); display: flex; align-items: center; gap: 8px; font-size: 1.5rem;">
                        ${t('home_scoring_works')}
                    </h3>
                    <div style="overflow-x: auto;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 1rem; text-align: center;">
                            <thead>
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.1); color: var(--text-muted);">
                                    <th style="padding: 8px; text-align: left;">${t('home_table_stage')}</th>
                                    <th style="padding: 8px; color: var(--accent-gold);">${t('home_table_exact')}</th>
                                    <th style="padding: 8px; color: var(--accent-green);">${t('home_table_gd')}</th>
                                    <th style="padding: 8px; color: var(--accent-blue);">${t('home_table_outcome')}</th>
                                </tr>
                            </thead>
                            <tbody style="color: var(--text-primary);">
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                                    <td style="padding: 8px; text-align: left; color: var(--text-muted);">${t('matches_filter_all').replace('🌍 ', '')} Stage</td>
                                    <td style="padding: 8px; font-weight: 700;">3</td>
                                    <td style="padding: 8px; font-weight: 700;">2</td>
                                    <td style="padding: 8px; font-weight: 700;">1</td>
                                </tr>
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                                    <td style="padding: 8px; text-align: left; color: var(--text-muted);">${t('matches_filter_r32')}</td>
                                    <td style="padding: 8px; font-weight: 700;">6</td>
                                    <td style="padding: 8px; font-weight: 700;">4</td>
                                    <td style="padding: 8px; font-weight: 700;">2</td>
                                </tr>
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                                    <td style="padding: 8px; text-align: left; color: var(--text-muted);">${t('matches_filter_r16')}</td>
                                    <td style="padding: 8px; font-weight: 700;">8</td>
                                    <td style="padding: 8px; font-weight: 700;">6</td>
                                    <td style="padding: 8px; font-weight: 700;">3</td>
                                </tr>
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                                    <td style="padding: 8px; text-align: left; color: var(--text-muted);">${t('matches_filter_qf')}</td>
                                    <td style="padding: 8px; font-weight: 700;">12</td>
                                    <td style="padding: 8px; font-weight: 700;">8</td>
                                    <td style="padding: 8px; font-weight: 700;">4</td>
                                </tr>
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                                    <td style="padding: 8px; text-align: left; color: var(--text-muted);">${t('matches_filter_sf')}</td>
                                    <td style="padding: 8px; font-weight: 700;">16</td>
                                    <td style="padding: 8px; font-weight: 700;">12</td>
                                    <td style="padding: 8px; font-weight: 700;">5</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px; text-align: left; color: var(--text-muted);">${t('matches_filter_final')}</td>
                                    <td style="padding: 8px; font-weight: 700;">25</td>
                                    <td style="padding: 8px; font-weight: 700;">20</td>
                                    <td style="padding: 8px; font-weight: 700;">15</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
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
                    <a href="#/community" class="btn btn-secondary btn-sm">${t('home_full_rankings')}</a>
                </div>
                <div class="card">
                    <table class="leaderboard-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>${t('leaderboard_th_player')}</th>
                                <th>${t('leaderboard_th_points')}</th>
                                <th>🔮 ${t('leaderboard_th_preds')}</th>
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
                                    <td class="leaderboard-user">
                                        ${nameHtml}
                                        <div class="leaderboard-mobile-stats">
                                            <span>🔮 ${entry.predictions_count}</span>
                                        </div>
                                    </td>
                                    <td class="leaderboard-points">${entry.total_points}</td>
                                    <td class="leaderboard-stat">${entry.predictions_count}</td>
                                </tr>
                            `}).join('')}
                        </tbody>
                    </table>
                </div>
            </section>
        ` : ''}
    `;

    return html;
}
