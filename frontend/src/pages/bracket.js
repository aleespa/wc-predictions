import { fetchAPI, isAuthenticated } from '../api.js';
import { showToast } from '../components/toast.js';
import { getFlagURL } from '../components/flags.js';
import { t } from '../i18n.js';

/**
 * Renders a single team slot in the bracket.
 */
export function renderSlotTeam(slot, side, profileName) {
    if (!slot) return `<div class="bracket-team bracket-tbd"><span class="bracket-team-name">${t('bracket_tbd')}</span></div>`;

    if (slot.team) {
        const predictedClass = slot.is_predicted ? 'bracket-predicted' : '';
        const legendKey = profileName ? 'bracket_legend_user_pred' : 'bracket_legend_pred';
        const titleText = profileName ? t(legendKey, { name: profileName }) : t(legendKey);

        return `
            <div class="bracket-team ${predictedClass}" data-side="${side}">
                <img src="${getFlagURL(slot.team.code)}" alt="${slot.team.code}" class="bracket-team-flag" />
                <span class="bracket-team-name">${slot.team.name}</span>
                ${slot.is_predicted ? `<span class="bracket-predicted-badge" title="${titleText}">⟡</span>` : ''}
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
    const dateStr = matchDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const timeStr = matchDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

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
                ${renderSlotTeam(match.home, 'home', options.profileName)}
                ${scoreSection}
                ${renderSlotTeam(match.away, 'away', options.profileName)}
            </div>
            ${!compact && match.venue ? `<div class="bracket-venue">📍 ${match.venue}</div>` : ''}
        </div>
    `;
}

/**
 * Renders a round column in the bracket.
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

    const allMatches = [
        ...(bracket.round_of_32 || []),
        ...(bracket.round_of_16 || []),
        ...(bracket.quarter_finals || []),
        ...(bracket.semi_finals || []),
        ...(bracket.third_place ? [bracket.third_place] : []),
        ...(bracket.final ? [bracket.final] : []),
    ];
    const invalidMatches = allMatches.filter(m => m.is_invalid_prediction);

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
                                        M${m.match_number}: ${m.home.team ? m.home.team.code : '?'} vs ${m.away.team ? m.away.team.code : '?'}
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
