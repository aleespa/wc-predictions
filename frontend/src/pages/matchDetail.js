import { fetchAPI } from '../api.js';
import { t } from '../i18n.js';
import { getFlagURL } from '../components/flags.js';

export async function matchDetailPage(params) {
    const matchId = params.matchId;
    let currentPage = 1;
    let currentCommunityId = null;
    let totalCount = 0;
    const limit = 10;

    async function loadData() {
        const query = new URLSearchParams({
            page: currentPage,
            limit: limit
        });
        if (currentCommunityId) {
            query.append('community_id', currentCommunityId);
        }

        try {
            const data = await fetchAPI(`/community/match/${matchId}/predictions?${query.toString()}`);
            return data;
        } catch (err) {
            console.error('Failed to load match predictions', err);
            throw err;
        }
    }

    async function loadCommunities() {
        try {
            return await fetchAPI('/community/private/mine');
        } catch (err) {
            console.error('Failed to load communities', err);
            return [];
        }
    }

    const communities = await loadCommunities();

    function renderTable(data) {
        const isFinished = data.match.is_finished;
        const predictions = data.predictions;
        
        if (predictions.length === 0) {
            return `
                <div class="empty-state">
                    <div class="empty-state-icon">🔮</div>
                    <div class="empty-state-text">${t('match_no_prediction')}</div>
                </div>
            `;
        }

        return `
            <div class="card" style="overflow-x: auto; margin-top: var(--space-lg)">
                <table class="leaderboard-table">
                    <thead>
                        <tr>
                            <th>${t('leaderboard_th_player')}</th>
                            <th>🏠 ${t('common_home')}</th>
                            <th>✈️ ${t('common_away')}</th>
                            <th>🥅 ${t('match_penalty_winner_short')}</th>
                            ${isFinished ? `<th>⭐ ${t('leaderboard_th_points')}</th>` : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${predictions.map(p => {
                            const isDraw = p.predicted_home_score === p.predicted_away_score;
                            const penaltyWinner = p.penalty_winner_id ? (p.penalty_winner_id === data.match.home_team_id ? '🏠' : '✈️') : '—';
                            
                            return `
                                <tr>
                                    <td class="leaderboard-user">
                                        <a href="#/user/${encodeURIComponent(p.username)}" class="leaderboard-user-link">${p.username}</a>
                                    </td>
                                    <td style="font-weight:700">${p.predicted_home_score}</td>
                                    <td style="font-weight:700">${p.predicted_away_score}</td>
                                    <td>${isDraw ? penaltyWinner : '—'}</td>
                                    ${isFinished ? `<td class="leaderboard-points">${p.points_awarded !== null ? p.points_awarded : '—'}</td>` : ''}
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    function renderMatchHeader(match) {
        const homeFlag = getFlagURL(match.home_team?.code);
        const awayFlag = getFlagURL(match.away_team?.code);
        const homeName = match.home_team?.name ? t(match.home_team.name) : (match.home_slot || '???');
        const awayName = match.away_team?.name ? t(match.away_team.name) : (match.away_slot || '???');
        
        return `
            <div class="match-detail-header card" style="margin-bottom: var(--space-xl); padding: var(--space-xl); text-align: center;">
                <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: var(--space-sm); text-transform: uppercase; letter-spacing: 1px;">
                    ${match.stage} ${match.group_letter ? `· ${t('matches_filter_grp', { group: match.group_letter })}` : ''}
                </div>
                <div style="display: flex; align-items: center; justify-content: center; gap: var(--space-xl); margin-bottom: var(--space-lg);">
                    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px;">
                        <img src="${homeFlag}" style="width: 64px; height: 44px; object-fit: cover; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1);">
                        <span style="font-size: 1.2rem; font-weight: 700;">${homeName}</span>
                    </div>
                    
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                        ${match.is_finished 
                            ? `<span style="font-size: 2.5rem; font-weight: 800; letter-spacing: 4px;">${match.home_score} – ${match.away_score}</span>`
                            : `<span style="font-size: 1.5rem; font-weight: 600; color: var(--text-muted);">${t('common_vs')}</span>`
                        }
                        <span class="match-status ${match.is_finished ? 'finished' : 'upcoming'}">
                            ${match.is_finished ? t('match_status_finished') : t('match_status_upcoming')}
                        </span>
                    </div>

                    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px;">
                        <img src="${awayFlag}" style="width: 64px; height: 44px; object-fit: cover; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1);">
                        <span style="font-size: 1.2rem; font-weight: 700;">${awayName}</span>
                    </div>
                </div>
                <div style="font-size: 1rem; color: var(--text-muted);">
                    ${new Date(match.match_date).toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    ${match.venue ? ` · ${match.venue}` : ''}
                </div>
            </div>
        `;
    }

    function renderPagination() {
        const totalPages = Math.ceil(totalCount / limit);
        if (totalPages <= 1) return '';

        return `
            <div class="pagination-controls" style="display: flex; justify-content: center; align-items: center; gap: var(--space-md); margin-top: var(--space-xl);">
                <button class="btn btn-secondary btn-sm" id="prev-page" ${currentPage === 1 ? 'disabled' : ''}>${t('pagination_prev')}</button>
                <span style="color: var(--text-muted)">${t('common_page_of', { current: currentPage, total: totalPages }) || `Page ${currentPage} of ${totalPages}`}</span>
                <button class="btn btn-secondary btn-sm" id="next-page" ${currentPage === totalPages ? 'disabled' : ''}>${t('pagination_next')}</button>
            </div>
        `;
    }

    function renderFilter() {
        if (communities.length === 0) return '';

        return `
            <div style="margin-bottom: var(--space-md); display: flex; align-items: center; gap: var(--space-sm);">
                <label for="community-filter" style="color: var(--text-muted); font-size: 0.9rem;">${t('community_filter_label')}</label>
                <select id="community-filter" class="btn btn-secondary btn-sm" style="background: var(--bg-card); border: 1px solid var(--border-color); color: var(--text-primary); cursor: pointer;">
                    <option value="">${t('community_filter_all')}</option>
                    ${communities.map(c => `<option value="${c.id}" ${currentCommunityId == c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
                </select>
            </div>
        `;
    }

    const result = {
        html: `
            <div class="fade-in">
                <div style="margin-bottom: var(--space-lg)">
                    <a href="#/community" class="btn btn-secondary btn-sm">← ${t('common_back_to_list')}</a>
                </div>
                <div id="match-header-container"></div>
                <div style="display: flex; justify-content: space-between; align-items: flex-end;">
                    <h2 class="page-title" style="margin-bottom: 0;">🔮 ${t('match_detail_predictions_title')}</h2>
                    <div id="filter-container"></div>
                </div>
                <div id="predictions-table-container"></div>
                <div id="pagination-container"></div>
            </div>
        `,
        init: () => {
            const headerContainer = document.getElementById('match-header-container');
            const tableContainer = document.getElementById('predictions-table-container');
            const paginationContainer = document.getElementById('pagination-container');
            const filterContainer = document.getElementById('filter-container');

            async function refresh() {
                tableContainer.innerHTML = '<div class="spinner"></div>';
                try {
                    const data = await loadData();
                    totalCount = data.total_count;
                    
                    headerContainer.innerHTML = renderMatchHeader(data.match);
                    filterContainer.innerHTML = renderFilter();
                    tableContainer.innerHTML = renderTable(data);
                    paginationContainer.innerHTML = renderPagination();

                    // Re-bind events
                    const communityFilter = document.getElementById('community-filter');
                    if (communityFilter) {
                        communityFilter.onchange = (e) => {
                            currentCommunityId = e.target.value || null;
                            currentPage = 1;
                            refresh();
                        };
                    }

                    const prevBtn = document.getElementById('prev-page');
                    if (prevBtn) {
                        prevBtn.onclick = () => {
                            if (currentPage > 1) {
                                currentPage--;
                                refresh();
                            }
                        };
                    }

                    const nextBtn = document.getElementById('next-page');
                    if (nextBtn) {
                        nextBtn.onclick = () => {
                            const totalPages = Math.ceil(totalCount / limit);
                            if (currentPage < totalPages) {
                                currentPage++;
                                refresh();
                            }
                        };
                    }
                } catch (err) {
                    tableContainer.innerHTML = `<div class="empty-state">⚠️ ${err.message}</div>`;
                }
            }

            refresh();
        }
    };

    return result;
}
