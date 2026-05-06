import { getFlagURL } from './flags.js';
import { t } from '../i18n.js';

export function renderMatchCard(match, options = {}) {
    const { onClick, showPrediction = true } = options;
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
        scoreHtml = `<span class="match-score">${match.home_score} — ${match.away_score}</span>`;
    } else {
        scoreHtml = `
            <span class="match-vs-label">VS</span>
            <span style="font-size:0.7rem;color:var(--text-muted)">${timeStr}</span>
        `;
    }

    let predictionBadge = '';
    if (showPrediction && hasPrediction && isFinished) {
        const pts = match.user_prediction.points_awarded;
        const pred = match.user_prediction;
        let badgeClass = 'wrong';
        let badgeText = t('match_badge_0pts', { h: pred.predicted_home_score, a: pred.predicted_away_score });
        if (pts === 5) {
            badgeClass = 'exact';
            badgeText = t('match_badge_exact', { h: pred.predicted_home_score, a: pred.predicted_away_score });
        } else if (pts === 3) {
            badgeClass = 'correct';
            badgeText = t('match_badge_3pts', { h: pred.predicted_home_score, a: pred.predicted_away_score });
        } else if (pts === 1) {
            badgeClass = 'correct';
            badgeText = t('match_badge_1pt', { h: pred.predicted_home_score, a: pred.predicted_away_score });
        }
        predictionBadge = `<span class="match-prediction-badge ${badgeClass}">${badgeText}</span>`;
    } else if (showPrediction && hasPrediction && !isFinished) {
        const pred = match.user_prediction;
        predictionBadge = `<span class="match-prediction-badge correct">${t('match_your_pick', { h: pred.predicted_home_score, a: pred.predicted_away_score })}</span>`;
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
                        <span class="match-team-name">${match.home_team.name}</span>
                    ` : `
                        <span class="match-team-name" style="color:var(--text-muted);font-style:italic;font-size:0.7rem">${match.home_slot || 'TBD'}</span>
                    `}
                </div>
                <div class="match-vs">
                    ${scoreHtml}
                </div>
                <div class="match-team">
                    ${match.away_team ? `
                        <img src="${getFlagURL(match.away_team.code)}" alt="${match.away_team.code}" class="match-team-flag-svg" />
                        <span class="match-team-name">${match.away_team.name}</span>
                    ` : `
                        <span class="match-team-name" style="color:var(--text-muted);font-style:italic;font-size:0.7rem">${match.away_slot || 'TBD'}</span>
                    `}
                </div>
            </div>
            <div class="match-card-footer">
                <span class="match-venue">📍 ${match.venue || 'TBD'}</span>
                ${predictionBadge}
            </div>
        </div>
    `;
}
