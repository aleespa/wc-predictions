import { fetchAPI, isAuthenticated } from '../api.js';
import { showToast } from '../components/toast.js';
import { getFlagURL } from '../components/flags.js';
import { t } from '../i18n.js';

/**
 * Renders a single team slot in the bracket.
 */
function renderSlotTeam(slot, side) {
    if (!slot) return `<div class="bracket-team bracket-tbd"><span class="bracket-team-name">${t('bracket_tbd')}</span></div>`;

    if (slot.team) {
        const predictedClass = slot.is_predicted ? 'bracket-predicted' : '';
        return `
            <div class="bracket-team ${predictedClass}" data-side="${side}">
                <img src="${getFlagURL(slot.team.code)}" alt="${slot.team.code}" class="bracket-team-flag" />
                <span class="bracket-team-name">${slot.team.name}</span>
                ${slot.is_predicted ? `<span class="bracket-predicted-badge" title="${t('bracket_legend_pred')}">⟡</span>` : ''}
            </div>
        `;
    }

    // Placeholder slot
    const label = slot.slot_label || t('bracket_tbd');
    return `
        <div class="bracket-team bracket-tbd">
            <span class="bracket-team-name bracket-placeholder">${label}</span>
        </div>
    `;
}

/**
 * Renders a single bracket match card.
 */
function renderBracketMatch(match, options = {}) {
    const { compact = false } = options;
    const matchDate = new Date(match.match_date);
    const dateStr = matchDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const timeStr = matchDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const bothTeamsKnown = match.home.team && match.away.team;
    const hasPrediction = match.user_prediction != null;
    const isFinished = match.is_finished;
    const isInvalid = match.is_invalid_prediction;

    let scoreSection = '';
    if (isFinished && match.home_score !== null) {
        scoreSection = `<div class="bracket-score">${match.home_score} – ${match.away_score}</div>`;
    } else if (hasPrediction) {
        scoreSection = `<div class="bracket-score bracket-score-predicted ${isInvalid ? 'bracket-score-invalid' : ''}">${match.user_prediction.predicted_home_score} – ${match.user_prediction.predicted_away_score}</div>`;
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
    } else if (bothTeamsKnown) {
        statusClass = 'bracket-predictable';
        statusIcon = '🔮';
    }

    const clickable = bothTeamsKnown && !isFinished ? `onclick="location.hash='#/predict/${match.match_id}'"` : '';
    const clickableClass = bothTeamsKnown && !isFinished ? 'bracket-match-clickable' : '';

    return `
        <div class="bracket-match ${statusClass} ${clickableClass} ${compact ? 'bracket-match-compact' : ''}" 
             id="bracket-match-${match.match_id}" ${clickable}
             data-match-id="${match.match_id}" data-match-number="${match.match_number}">
            <div class="bracket-match-header">
                <span class="bracket-match-num">M${match.match_number}</span>
                <span class="bracket-match-info">${dateStr} · ${timeStr}</span>
                ${statusIcon ? `<span class="bracket-status-icon">${statusIcon}</span>` : ''}
            </div>
            <div class="bracket-matchup">
                ${renderSlotTeam(match.home, 'home')}
                ${scoreSection}
                ${renderSlotTeam(match.away, 'away')}
            </div>
            ${!compact && match.venue ? `<div class="bracket-venue">📍 ${match.venue}</div>` : ''}
        </div>
    `;
}

/**
 * Renders a round column in the bracket.
 */
function renderRound(title, matches, options = {}) {
    if (!matches || matches.length === 0) return '';
    return `
        <div class="bracket-round">
            <div class="bracket-round-header">
                <h3 class="bracket-round-title">${title}</h3>
                <span class="bracket-round-count">${matches.length === 1 ? t('bracket_round_match', { count: matches.length }) : t('bracket_round_matches', { count: matches.length })}</span>
            </div>
            <div class="bracket-round-matches">
                ${matches.map(m => renderBracketMatch(m, options)).join('')}
            </div>
        </div>
    `;
}


export async function bracketPage() {
    let bracket;
    try {
        bracket = await fetchAPI('/knockout/bracket');
    } catch (e) {
        return `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">${e.message}</div></div>`;
    }

    const authed = isAuthenticated();

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

            <div class="bracket-view-toggle">
                <button class="bracket-view-btn active" data-view="rounds" id="btn-rounds-view">${t('bracket_view_rounds')}</button>
                <button class="bracket-view-btn" data-view="tree" id="btn-tree-view">${t('bracket_view_tree')}</button>
            </div>

            <div id="bracket-content">
                <div id="bracket-rounds-view" class="bracket-container">
                    ${renderRound(t('stage_r32'), bracket.round_of_32)}
                    ${renderRound(t('stage_r16'), bracket.round_of_16, { compact: true })}
                    ${renderRound(t('stage_qf'), bracket.quarter_finals, { compact: true })}
                    ${renderRound(t('stage_sf'), bracket.semi_finals, { compact: true })}
                    ${bracket.third_place ? renderRound(t('stage_3rd'), [bracket.third_place], { compact: true }) : ''}
                    ${bracket.final ? renderRound(t('stage_final'), [bracket.final]) : ''}
                </div>
                <div id="bracket-tree-view" class="bracket-tree-container" style="display:none;">
                    ${renderTreeBracket(bracket)}
                </div>
            </div>
        </div>
    `;

    return {
        html,
        init: () => {
            // View toggle
            const roundsBtn = document.getElementById('btn-rounds-view');
            const treeBtn = document.getElementById('btn-tree-view');
            const roundsView = document.getElementById('bracket-rounds-view');
            const treeView = document.getElementById('bracket-tree-view');

            roundsBtn?.addEventListener('click', () => {
                roundsBtn.classList.add('active');
                treeBtn.classList.remove('active');
                roundsView.style.display = '';
                treeView.style.display = 'none';
            });

            treeBtn?.addEventListener('click', () => {
                treeBtn.classList.add('active');
                roundsBtn.classList.remove('active');
                treeView.style.display = '';
                roundsView.style.display = 'none';
            });
        },
    };
}


/**
 * Renders a traditional tournament tree bracket.
 * Groups R32 matches into pairs that feed into R16 matches, etc.
 */
function renderTreeBracket(bracket) {
    const r32 = bracket.round_of_32 || [];
    const r16 = bracket.round_of_16 || [];
    const qf = bracket.quarter_finals || [];
    const sf = bracket.semi_finals || [];
    const final = bracket.final;
    const thirdPlace = bracket.third_place;

    // Build the tree column by column
    // R32 (16 matches) -> R16 (8) -> QF (4) -> SF (2) -> Final (1)
    // Split into top and bottom halves for display

    let treeHtml = `
        <div class="tree-bracket">
            <div class="tree-column tree-col-r32">
                <div class="tree-column-header">${t('stage_r32')}</div>
                ${r32.map(m => renderTreeMatch(m)).join('')}
            </div>
            <div class="tree-column tree-col-r16">
                <div class="tree-column-header">${t('stage_r16')}</div>
                ${r16.map(m => renderTreeMatch(m)).join('')}
            </div>
            <div class="tree-column tree-col-qf">
                <div class="tree-column-header">${t('stage_qf')}</div>
                ${qf.map(m => renderTreeMatch(m)).join('')}
            </div>
            <div class="tree-column tree-col-sf">
                <div class="tree-column-header">${t('stage_sf')}</div>
                ${sf.map(m => renderTreeMatch(m)).join('')}
            </div>
            <div class="tree-column tree-col-final">
                <div class="tree-column-header">${t('stage_final')}</div>
                ${final ? renderTreeMatch(final) : ''}
                ${thirdPlace ? `<div style="margin-top:var(--space-xl)"><div class="tree-column-header" style="font-size:0.75rem">${t('stage_3rd')}</div>${renderTreeMatch(thirdPlace)}</div>` : ''}
            </div>
        </div>
    `;

    return treeHtml;
}

function renderTreeMatch(match) {
    const bothTeams = match.home.team && match.away.team;
    const isFinished = match.is_finished;
    const hasPred = match.user_prediction != null;
    const isInvalid = match.is_invalid_prediction;
    const clickable = bothTeams && !isFinished;

    let statusClass = '';
    if (isFinished) statusClass = 'bracket-finished';
    else if (isInvalid) statusClass = 'tree-match-invalid';
    else if (hasPred) statusClass = 'bracket-has-prediction';
    else if (bothTeams) statusClass = 'bracket-predictable';

    const onClick = clickable ? `onclick="location.hash='#/predict/${match.match_id}'"` : '';

    function teamRow(slot, score, side) {
        if (!slot || !slot.team) {
            const label = slot?.slot_label || t('bracket_tbd');
            return `
                <div class="tree-team tree-tbd ${side}">
                    <span class="tree-team-name tree-placeholder">${label}</span>
                    <span class="tree-team-score">-</span>
                </div>
            `;
        }
        const predicted = slot.is_predicted ? 'tree-predicted' : '';
        const winnerClass = isFinished && score !== null ? (
            (side === 'home' && match.home_score > match.away_score) ||
            (side === 'away' && match.away_score > match.home_score)
                ? 'tree-winner' : ''
        ) : '';
        return `
            <div class="tree-team ${predicted} ${winnerClass} ${side}">
                <img src="${getFlagURL(slot.team.code)}" class="tree-team-flag" />
                <span class="tree-team-name">${slot.team.code}</span>
                ${slot.is_predicted ? '<span class="tree-pred-dot" title="Predicted">⟡</span>' : ''}
                <span class="tree-team-score">${score !== null && score !== undefined ? score : (hasPred ? (side === 'home' ? match.user_prediction.predicted_home_score : match.user_prediction.predicted_away_score) : '-')}</span>
            </div>
        `;
    }

    return `
        <div class="tree-match ${statusClass} ${clickable ? 'tree-match-clickable' : ''}" ${onClick} data-match-num="${match.match_number}">
            ${teamRow(match.home, isFinished ? match.home_score : null, 'home')}
            ${teamRow(match.away, isFinished ? match.away_score : null, 'away')}
        </div>
    `;
}
