import { fetchAPI, isAuthenticated } from '../api.js';
import { showToast } from '../components/toast.js';
import { getFlagURL } from '../components/flags.js';
import { t, getLanguage } from '../i18n.js';

const SHIELD_SVG = `
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:16px; height:16px; opacity:0.5">
    <path d="M12 2L3 7V12C3 17.5 7 21 12 22C17 21 21 17.5 21 12V7L12 2Z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

/**
 * Renders a single team slot in the bracket.
 */
export function renderSlotTeam(slot, side, profileName) {
    if (!slot || !slot.team) {
        const label = slot?.slot_label || t('bracket_tbd');
        return `
            <div class="bracket-team bracket-tbd">
                <div class="bracket-placeholder-icon">${SHIELD_SVG}</div>
                <span class="bracket-team-name bracket-placeholder">${label}</span>
            </div>
        `;
    }

    const predictedClass = slot.is_predicted ? 'bracket-predicted' : '';
    const legendKey = profileName ? 'bracket_legend_user_pred' : 'bracket_legend_pred';
    const titleText = profileName ? t(legendKey, { name: profileName }) : t(legendKey);

    return `
        <div class="bracket-team ${predictedClass}" data-side="${side}">
            <img src="${getFlagURL(slot.team.code)}" alt="${slot.team.code}" class="bracket-team-flag" />
            <span class="bracket-team-name">${t(slot.team.name)}</span>
            ${slot.is_predicted ? `<span class="bracket-predicted-badge" title="${titleText}">⟡</span>` : ''}
        </div>
    `;
}

/**
 * Renders a single bracket match card.
 */
export function renderBracketMatch(match, options = {}) {
    const matchDate = new Date(match.match_date);
    const dateStr = matchDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const timeStr = matchDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

    const bothTeamsKnown = match.home.team && match.away.team;
    const hasPrediction = match.user_prediction != null;
    const isFinished = match.is_finished;
    const isInvalid = match.is_invalid_prediction;

    let scoreHome = '';
    let scoreAway = '';

    const isDraw = isFinished && match.home_score === match.away_score;
    const homeIsPenWinner = isDraw && match.penalty_winner_id && match.home?.team && match.penalty_winner_id === match.home.team.id;
    const awayIsPenWinner = isDraw && match.penalty_winner_id && match.away?.team && match.penalty_winner_id === match.away.team.id;

    if (isFinished && match.home_score !== null) {
        const homePenLabel = homeIsPenWinner ? ' <span style="font-size:0.6rem; font-weight:normal; opacity:0.75; color:var(--accent-purple-light); vertical-align:middle; margin-left:3px">p</span>' : '';
        const awayPenLabel = awayIsPenWinner ? ' <span style="font-size:0.6rem; font-weight:normal; opacity:0.75; color:var(--accent-purple-light); vertical-align:middle; margin-left:3px">p</span>' : '';
        scoreHome = `<div class="bracket-score">${match.home_score}${homePenLabel}</div>`;
        scoreAway = `<div class="bracket-score">${match.away_score}${awayPenLabel}</div>`;
    } else if (hasPrediction) {
        const invalidClass = isInvalid ? 'bracket-score-invalid' : '';
        scoreHome = `<div class="bracket-score bracket-score-predicted ${invalidClass}">${match.user_prediction.predicted_home_score}</div>`;
        scoreAway = `<div class="bracket-score bracket-score-predicted ${invalidClass}">${match.user_prediction.predicted_away_score}</div>`;
    }

    let statusClass = 'bracket-upcoming';
    let statusIcon = '';
    if (isFinished) {
        statusClass = 'bracket-finished';
        statusIcon = '✓';
    } else if (isInvalid) {
        statusClass = 'bracket-match-invalid';
        statusIcon = '⚠️';
    } else if (hasPrediction) {
        statusClass = 'bracket-has-prediction';
        statusIcon = '⚡';
    } else if (bothTeamsKnown && match.is_confirmed) {
        statusClass = 'bracket-predictable';
        statusIcon = '🔮';
    } else if (bothTeamsKnown && !match.is_confirmed) {
        statusIcon = '🔒';
    }

    const isConfirmed = match.is_confirmed;
    const finalMatchId = match.match_id || match.id;
    const canPredict = bothTeamsKnown && !isFinished && isConfirmed;
    const clickable = canPredict ? `onclick="location.hash='#/predict/${finalMatchId}'"` : '';
    const clickableClass = canPredict ? 'bracket-match-clickable' : '';
    const lockedClass = !isConfirmed && !isFinished ? 'bracket-match-locked' : '';
    const showConnectors = options.showConnectors !== false;

    return `
        <div class="bracket-match-wrapper ${!showConnectors ? 'no-connectors' : ''}">
            <div class="bracket-match ${statusClass} ${clickableClass} ${lockedClass}" 
                 id="bracket-match-${finalMatchId}" ${clickable}
                 data-match-id="${finalMatchId}" 
                 data-match-number="${match.match_number}"
                 data-home-source="${match.home_source_match_id || ''}"
                 data-away-source="${match.away_source_match_id || ''}">
                <div class="bracket-match-header">
                    <span class="bracket-match-num">M${match.match_number}</span>
                    <span class="bracket-match-info">${dateStr} · ${timeStr}</span>
                    ${statusIcon ? `<span class="bracket-status-icon">${statusIcon}</span>` : ''}
                </div>
                <div class="bracket-matchup">
                    <div style="display:flex; align-items:center; width:100%">
                        ${renderSlotTeam(match.home, 'home', options.profileName)}
                        ${scoreHome}
                    </div>
                    <div style="display:flex; align-items:center; width:100%">
                        ${renderSlotTeam(match.away, 'away', options.profileName)}
                        ${scoreAway}
                    </div>
                </div>
                ${(() => {
                    if (isDraw && match.penalty_winner_id) {
                        let winTeam = null;
                        if (match.home?.team && match.penalty_winner_id === match.home.team.id) {
                            winTeam = match.home.team;
                        } else if (match.away?.team && match.penalty_winner_id === match.away.team.id) {
                            winTeam = match.away.team;
                        }
                        if (winTeam) {
                            const winsText = getLanguage() === 'es' ? `(${winTeam.code} gana en penales)` : `(${winTeam.code} wins on penalties)`;
                            return `<div class="bracket-pk-label" style="font-size:0.6rem; font-weight:700; color:var(--accent-purple-light); margin-top:4px; text-align:center; border-top:1px solid var(--border-subtle); padding-top:4px">${winsText}</div>`;
                        }
                    }
                    return '';
                })()}
                ${match.venue ? `<div class="bracket-venue">🏟️ ${match.venue}</div>` : ''}
            </div>
        </div>
    `;
}

/**
 * Renders a round column (Legacy/Simplified view used by Profile).
 */
export function renderRound(title, matches, options = {}) {
    if (!matches || matches.length === 0) return '';
    return `
        <div class="bracket-round">
            <div class="bracket-round-header">
                <h3 class="bracket-round-title">${title}</h3>
                <span class="bracket-round-count">${matches.length === 1 ? t('bracket_round_match', { count: matches.length }) : t('bracket_round_matches', { count: matches.length })}</span>
            </div>
            <div class="bracket-round-matches">
                ${matches.map(m => renderBracketMatch(m, { ...options, showConnectors: false })).join('')}
            </div>
        </div>
    `;
}

/**
 * Organizes matches into a tree-compatible order for each round.
 */
function getOrderedTree(bracket) {
    const final = bracket.final;
    if (!final) return null;

    const allMatches = [
        ...(bracket.round_of_32 || []),
        ...(bracket.round_of_16 || []),
        ...(bracket.quarter_finals || []),
        ...(bracket.semi_finals || []),
        final
    ];
    const matchMap = {};
    allMatches.forEach(m => matchMap[m.match_id] = m);

    const tree = {
        final: [final],
        semi_finals: [],
        quarter_finals: [],
        round_of_16: [],
        round_of_32: []
    };

    const levels = ['final', 'semi_finals', 'quarter_finals', 'round_of_16', 'round_of_32'];
    for (let i = 0; i < levels.length - 1; i++) {
        const currentLevel = levels[i];
        const nextLevel = levels[i + 1];
        tree[currentLevel].forEach(m => {
            const h = matchMap[m.home_source_match_id];
            const a = matchMap[m.away_source_match_id];
            // Order is important here: first one pushed is top in next level traversal
            if (h) tree[nextLevel].push(h);
            if (a) tree[nextLevel].push(a);
        });
    }

    // Use the collected matches in the order they were discovered (top-to-bottom traversal)
    return {
        round_of_32: tree.round_of_32,
        round_of_16: tree.round_of_16,
        quarter_finals: tree.quarter_finals,
        semi_finals: tree.semi_finals,
        final: tree.final[0]
    };
}

export async function bracketPage() {
    let bracket;
    try {
        bracket = await fetchAPI('/knockout/bracket');
    } catch (e) {
        return `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">${t(e.message)}</div></div>`;
    }

    const authed = isAuthenticated();
    const ordered = getOrderedTree(bracket);

    // Count stats
    const totalKO = (bracket.round_of_32?.length || 0) + (bracket.round_of_16?.length || 0) +
        (bracket.quarter_finals?.length || 0) + (bracket.semi_finals?.length || 0) +
        (bracket.third_place ? 1 : 0) + (bracket.final ? 1 : 0);
    const predictedCount = [
        ...(bracket.round_of_32 || []),
        ...(bracket.round_of_16 || []),
        ...(bracket.quarter_finals || []),
        ...(bracket.semi_finals || []),
        ...(bracket.third_place ? [bracket.third_place] : []),
        ...(bracket.final ? [bracket.final] : []),
    ].filter(m => m.user_prediction).length;

    const allMatches = [
        ...(bracket.round_of_32 || []),
        ...(bracket.round_of_16 || []),
        ...(bracket.quarter_finals || []),
        ...(bracket.semi_finals || []),
        ...(bracket.third_place ? [bracket.third_place] : []),
        ...(bracket.final ? [bracket.final] : []),
    ];
    const invalidMatches = allMatches.filter(m => m.is_invalid_prediction);

    const renderColumn = (title, matches, index) => {
        if (!matches || (Array.isArray(matches) && matches.length === 0)) return '';
        const matchesList = Array.isArray(matches) ? matches : [matches];
        return `
            <div class="bracket-column ${index === 0 ? 'first-visible' : ''}" data-index="${index}">
                <div class="bracket-column-header">
                    <h4 class="bracket-column-title">${title}</h4>
                </div>
                <div class="bracket-column-content">
                    ${matchesList.map((m, i) => renderBracketMatch(m, {})).join('')}
                </div>
            </div>
        `;
    };

    const rounds = [
        { id: 0, title: t('stage_roundof32') },
        { id: 1, title: t('stage_roundof16') },
        { id: 2, title: t('stage_quarterfinals') },
        { id: 3, title: t('stage_semifinals') },
        { id: 4, title: t('stage_final') }
    ];

    const html = `
        <div class="bracket-page fade-in">
            <div class="bracket-hero">
                <h1 class="page-title">${t('bracket_title')}</h1>
                <p class="page-subtitle">
                    ${authed
            ? t('bracket_subtitle_authed')
            : t('bracket_subtitle_unauthed')}
                </p>
                ${authed ? `
                    <div class="bracket-stats-bar">
                        <div class="bracket-stat">
                            <span class="bracket-stat-value">${predictedCount}</span>
                            <span class="bracket-stat-label">${t('bracket_stat_pred')}</span>
                        </div>
                        <div class="bracket-stat">
                            <span class="bracket-stat-value">${totalKO}</span>
                            <span class="bracket-stat-label">${t('bracket_stat_total')}</span>
                        </div>
                    </div>
                ` : ''}
            </div>
            
            ${invalidMatches.length > 0 ? `
                <div class="card" style="border:1px solid var(--accent-red); background:rgba(239, 68, 68, 0.05); margin-bottom:var(--space-lg); border-radius:var(--radius-lg)">
                    <div style="display:flex; gap:var(--space-md); align-items:flex-start">
                        <div style="font-size:1.5rem">⚠️</div>
                        <div>
                            <h4 style="margin:0; color:var(--accent-red)">${t('bracket_invalid_title')}</h4>
                            <p style="margin:var(--space-xs) 0 var(--space-md); font-size:0.9rem; color:var(--text-muted)">
                                ${t('bracket_invalid_subtitle')}
                            </p>
                            <div style="display:flex; flex-wrap:wrap; gap:var(--space-sm)">
                                ${invalidMatches.map(m => `
                                    <a href="#/predict/${m.match_id}" class="btn btn-secondary btn-sm" style="border-color:var(--accent-red); color:var(--accent-red)">
                                        M${m.match_number}: ${m.home.team ? m.home.team.code : '?'} ${t('common_vs')} ${m.away.team ? m.away.team.code : '?'}
                                    </a>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            ` : ''}

            <div class="bracket-legend">
                <div class="bracket-legend-item">
                    <span class="bracket-legend-dot bracket-legend-predicted"></span>
                    <span>${t('bracket_legend_pred')}</span>
                </div>
                <div class="bracket-legend-item">
                    <span class="bracket-legend-dot bracket-legend-confirmed"></span>
                    <span>${t('bracket_legend_conf')}</span>
                </div>
                <div class="bracket-legend-item">
                    <span class="bracket-legend-dot bracket-legend-tbd"></span>
                    <span>${t('bracket_legend_tbd')}</span>
                </div>
            </div>

            <div id="bracket-content">
                <div class="bracket-header-nav" id="bracket-header-nav">
                    ${rounds.map(r => `
                        <button class="bracket-round-btn ${r.id === 0 ? 'active' : ''}" data-index="${r.id}">
                            ${r.title}
                        </button>
                    `).join('')}
                </div>

                <div class="bracket-tree-container">
                    <svg class="bracket-svg-overlay" style="position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:1; overflow:visible"></svg>
                    ${renderColumn(t('stage_roundof32'), ordered?.round_of_32 || bracket.round_of_32, 0)}
                    ${renderColumn(t('stage_roundof16'), ordered?.round_of_16 || bracket.round_of_16, 1)}
                    ${renderColumn(t('stage_quarterfinals'), ordered?.quarter_finals || bracket.quarter_finals, 2)}
                    ${renderColumn(t('stage_semifinals'), ordered?.semi_finals || bracket.semi_finals, 3)}
                    ${renderColumn(t('stage_final'), [bracket.final], 4)}
                </div>

                ${bracket.third_place ? `
                    <div class="bracket-small-finals">
                        <div class="bracket-small-finals-title">${t('stage_thirdplace')}</div>
                        ${renderBracketMatch(bracket.third_place, { showConnectors: false })}
                    </div>
                ` : ''}
            </div>
        </div>
    `;

    return {
        html,
        init: () => {
            const headerNav = document.getElementById('bracket-header-nav');
            const container = document.querySelector('.bracket-tree-container');
            const columns = document.querySelectorAll('.bracket-column');
            const buttons = document.querySelectorAll('.bracket-round-btn');
            let currentStartIndex = 0;

            const updateVisibility = (index) => {
                // If clicking the currently active (first visible) round, toggle back to full view
                if (index === currentStartIndex && index !== 0) {
                    index = 0;
                }

                currentStartIndex = index;
                if (container) container.dataset.startIndex = index;

                columns.forEach((col, i) => {
                    const colIndex = parseInt(col.dataset.index);
                    col.classList.toggle('collapsed', colIndex < index);
                    col.classList.toggle('first-visible', colIndex === index);
                });

                buttons.forEach((btn, i) => {
                    const btnIndex = parseInt(btn.dataset.index);
                    btn.classList.toggle('active', btnIndex === index);
                    btn.classList.toggle('hidden-prev', btnIndex < index);
                });
            };

            headerNav?.addEventListener('click', (e) => {
                const btn = e.target.closest('.bracket-round-btn');
                if (!btn) return;
                const index = parseInt(btn.dataset.index);
                updateVisibility(index);
                // Redraw connectors after transition
                setTimeout(drawBracketConnectors, 600);
            });

            // Initial draw
            setTimeout(drawBracketConnectors, 100);

            // Resize listener
            window.addEventListener('resize', drawBracketConnectors);

            // Cleanup listener if needed (though this is a SPA, so we might want to handle this better)
            // For now, we'll just keep it simple.
        }
    };
}

/**
 * Draws the SVG connector lines between matches.
 */
function drawBracketConnectors() {
    const container = document.querySelector('.bracket-tree-container');
    const svg = container?.querySelector('.bracket-svg-overlay');
    if (!container || !svg) return;

    svg.innerHTML = ''; // Clear existing paths

    // Ensure SVG covers the full scrollable area
    svg.setAttribute('width', container.scrollWidth);
    svg.setAttribute('height', container.scrollHeight);

    const containerRect = container.getBoundingClientRect();
    const matches = container.querySelectorAll('.bracket-match');

    matches.forEach(targetCard => {
        const homeSourceId = targetCard.dataset.homeSource;
        const awaySourceId = targetCard.dataset.awaySource;
        if (!homeSourceId && !awaySourceId) return;

        // Target left-center
        const targetRect = targetCard.getBoundingClientRect();
        // If target card is hidden (collapsed column), skip
        if (targetRect.width === 0) return;

        const targetX = targetRect.left - containerRect.left + container.scrollLeft;
        const targetY = targetRect.top - containerRect.top + container.scrollTop + (targetRect.height / 2);

        const getSourcePos = (sourceId) => {
            const sourceCard = container.querySelector(`[data-match-id="${sourceId}"]`);
            if (!sourceCard) return null;
            const sourceRect = sourceCard.getBoundingClientRect();
            if (sourceRect.width === 0) return null; // Hidden

            return {
                x: sourceRect.right - containerRect.left + container.scrollLeft,
                y: sourceRect.top - containerRect.top + container.scrollTop + (sourceRect.height / 2)
            };
        };

        const homePos = getSourcePos(homeSourceId);
        const awayPos = getSourcePos(awaySourceId);

        if (homePos && awayPos) {
            // Standard fork: Source 1 & 2 -> Midpoint -> Target
            const midX = homePos.x + (targetX - homePos.x) / 2;
            const midY = homePos.y + (awayPos.y - homePos.y) / 2;

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            // D-string: M x y L x y ...
            // We use square lines: Horizontal -> Vertical -> Horizontal
            const d = `
                M ${homePos.x} ${homePos.y}
                H ${midX}
                V ${midY}
                M ${awayPos.x} ${awayPos.y}
                H ${midX}
                V ${midY}
                H ${targetX}
            `;
            path.setAttribute('d', d);
            path.setAttribute('stroke', 'var(--border-medium)');
            path.setAttribute('stroke-width', '2');
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke-opacity', '0.6');
            svg.appendChild(path);
        } else if (homePos || awayPos) {
            // Single connection (e.g. if one source is missing for some reason)
            const pos = homePos || awayPos;
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const midX = pos.x + (targetX - pos.x) / 2;
            const d = `
                M ${pos.x} ${pos.y}
                H ${midX}
                V ${targetY}
                H ${targetX}
            `;
            path.setAttribute('d', d);
            path.setAttribute('stroke', 'var(--border-medium)');
            path.setAttribute('stroke-width', '2');
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke-opacity', '0.6');
            svg.appendChild(path);
        }
    });
}


