import { fetchAPI, isAuthenticated } from '../api.js';
import { showToast } from '../components/toast.js';
import { getFlagURL } from '../components/flags.js';
import { t } from '../i18n.js';

/**
 * Renders a single team slot in the bracket.
 */
export function renderSlotTeam(slot, side) {
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
export function renderBracketMatch(match, options = {}) {
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

    const isLocked = options.isLocked;
    const finalMatchId = match.match_id || match.id;
    const clickable = bothTeamsKnown && !isFinished && !isLocked ? `onclick="location.hash='#/predict/${finalMatchId}'"` : '';
    const clickableClass = bothTeamsKnown && !isFinished && !isLocked ? 'bracket-match-clickable' : '';
    const lockedClass = isLocked ? 'bracket-match-locked' : '';

    return `
        <div class="bracket-match ${statusClass} ${clickableClass} ${lockedClass} ${compact ? 'bracket-match-compact' : ''}" 
             id="bracket-match-${finalMatchId}" ${clickable}
             data-match-id="${finalMatchId}" data-match-number="${match.match_number}">
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
                
                ${!bracket.is_unlocked ? `
                    <div class="bracket-lock-banner">
                        <span class="lock-icon">🔒</span>
                        <div class="lock-details">
                            <span class="lock-message">${bracket.unlock_reason || t('bracket_locked_msg')}</span>
                            <span class="lock-hint">${t('bracket_lock_hint')}</span>
                        </div>
                        <button class="btn btn-primary" onclick="location.hash='#/predict'">${t('bracket_go_predict')}</button>
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

            <div id="bracket-content">
                <div id="bracket-rounds-view" class="bracket-container ${!bracket.is_unlocked ? 'bracket-container-locked' : ''}">
                    ${renderRound(t('stage_roundof32'), bracket.round_of_32, { isLocked: !bracket.is_unlocked })}
                    ${renderRound(t('stage_roundof16'), bracket.round_of_16, { compact: true, isLocked: !bracket.is_unlocked })}
                    ${renderRound(t('stage_quarterfinals'), bracket.quarter_finals, { compact: true, isLocked: !bracket.is_unlocked })}
                    ${renderRound(t('stage_semifinals'), bracket.semi_finals, { compact: true, isLocked: !bracket.is_unlocked })}
                    ${bracket.third_place ? renderRound(t('stage_thirdplace'), [bracket.third_place], { compact: true, isLocked: !bracket.is_unlocked }) : ''}
                    ${bracket.final ? renderRound(t('stage_final'), [bracket.final], { isLocked: !bracket.is_unlocked }) : ''}
                </div>
            </div>
        </div>
    `;

    return html;
}
