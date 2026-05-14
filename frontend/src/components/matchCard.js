import { getFlagURL } from './flags.js';
import { t } from '../i18n.js';

export function renderMatchCard(match, options = {}) {
    const { onClick, showPrediction = true, profileName } = options;
    const isFinished = match.is_finished;
    const hasPrediction = match.user_prediction != null;
    const matchDate = new Date(match.match_date);

    const dateStr = matchDate.toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric'
    });
    const timeStr = matchDate.toLocaleTimeString(undefined, {
        hour: '2-digit', minute: '2-digit'
    });

    let statusHtml = '';
    if (isFinished) {
        statusHtml = `<span class="match-status finished">${t('match_status_finished')}</span>`;
    } else if (hasPrediction) {
        statusHtml = `<span class="match-status predicted">${t('match_status_predicted')}</span>`;
    } else {
        statusHtml = `<span class="match-status upcoming">${t('match_status_upcoming')}</span>`;
    }

    let scoreHtml;
    if (isFinished) {
        scoreHtml = `
            <div style="display:flex;flex-direction:column;align-items:center;line-height:1">
                <span class="match-score">${match.home_score} — ${match.away_score}</span>
                <span style="font-size:0.6rem;color:var(--text-muted);margin-top:4px">${dateStr}</span>
            </div>
        `;
    } else {
        scoreHtml = `
            <span class="match-vs-label">${t('common_vs')}</span>
            <div style="display:flex;flex-direction:column;align-items:center;line-height:1">
                <span style="font-size:0.6rem;color:var(--text-muted);margin-bottom:2px">${dateStr}</span>
                <span style="font-size:0.7rem;color:var(--text-muted);font-weight:500">${timeStr}</span>
            </div>
        `;
    }

    let predictionBadge = '';
    if (showPrediction && hasPrediction && isFinished) {
        const pts = match.user_prediction.points_awarded;
        const pred = match.user_prediction;
        let badgeClass = 'wrong';
        if (pts === 5) badgeClass = 'exact';
        else if (pts >= 1) badgeClass = 'correct';
        
        const labelText = profileName ? 
            t('match_user_pick', { name: profileName, h: pred.predicted_home_score, a: pred.predicted_away_score }) : 
            t('match_your_pick', { h: pred.predicted_home_score, a: pred.predicted_away_score });
            
        predictionBadge = `
            <div class="match-prediction-badge ${badgeClass}">
                <span class="badge-points">${pts} pts</span>
                <span class="badge-label">${labelText}</span>
            </div>
        `;
    } else if (showPrediction && hasPrediction && !isFinished) {
        const pred = match.user_prediction;
        const labelText = profileName ? 
            t('match_user_pick', { name: profileName, h: pred.predicted_home_score, a: pred.predicted_away_score }) : 
            t('match_your_pick', { h: pred.predicted_home_score, a: pred.predicted_away_score });
        predictionBadge = `
            <div class="match-prediction-badge upcoming">
                <span class="badge-label">${labelText}</span>
            </div>
        `;
    }

    const classes = ['match-card'];
    if (isFinished) classes.push('finished');
    if (hasPrediction) classes.push('predicted');

    const clickAttr = onClick ? `onclick="${onClick}(${match.id})"` : `onclick="location.hash='#/predict/${match.id}'"`;

    return `
        <div class="${classes.join(' ')}" ${clickAttr} id="match-card-${match.id}">
            <div class="match-card-header">
                <span class="match-group-badge">${match.group_letter ? t('stage_group', { group: match.group_letter }) : t('stage_' + match.stage.toLowerCase().replace(/[^a-z0-9]/g, '')) || match.stage}</span>
                ${statusHtml}
            </div>
            <div class="match-teams">
                <div class="match-team">
                    ${match.home_team ? `
                        <img src="${getFlagURL(match.home_team.code)}" alt="${match.home_team.code}" class="match-team-flag-svg" />
                        <span class="match-team-name">${t(match.home_team.name)}</span>
                    ` : `
                        <span class="match-team-name" style="color:var(--text-muted);font-style:italic;font-size:0.7rem">${match.home_slot || t('common_tbd')}</span>
                    `}
                </div>
                <div class="match-vs">
                    ${scoreHtml}
                </div>
                <div class="match-team">
                    ${match.away_team ? `
                        <img src="${getFlagURL(match.away_team.code)}" alt="${match.away_team.code}" class="match-team-flag-svg" />
                        <span class="match-team-name">${t(match.away_team.name)}</span>
                    ` : `
                        <span class="match-team-name" style="color:var(--text-muted);font-style:italic;font-size:0.7rem">${match.away_slot || t('common_tbd')}</span>
                    `}
                </div>
            </div>
            ${predictionBadge ? `
                <div class="match-card-footer">
                    ${predictionBadge}
                </div>
            ` : ''}
        </div>
    `;
}
