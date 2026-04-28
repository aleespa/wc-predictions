import { getFlagURL } from './flags.js';

export function renderMatchCard(match, options = {}) {
    const { onClick, showPrediction = true } = options;
    const isFinished = match.is_finished;
    const hasPrediction = match.user_prediction != null;
    const matchDate = new Date(match.match_date);

    const dateStr = matchDate.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
    });
    const timeStr = matchDate.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit'
    });

    let statusHtml = '';
    if (isFinished) {
        statusHtml = '<span class="match-status finished">✓ Finished</span>';
    } else if (hasPrediction) {
        statusHtml = '<span class="match-status predicted">⚡ Predicted</span>';
    } else {
        statusHtml = '<span class="match-status upcoming">● Upcoming</span>';
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
        let badgeText = `${pred.predicted_home_score}-${pred.predicted_away_score} · 0 pts`;
        if (pts === 5) {
            badgeClass = 'exact';
            badgeText = `${pred.predicted_home_score}-${pred.predicted_away_score} · 5 pts 🎯`;
        } else if (pts === 3) {
            badgeClass = 'correct';
            badgeText = `${pred.predicted_home_score}-${pred.predicted_away_score} · 3 pts`;
        } else if (pts === 1) {
            badgeClass = 'correct';
            badgeText = `${pred.predicted_home_score}-${pred.predicted_away_score} · 1 pt`;
        }
        predictionBadge = `<span class="match-prediction-badge ${badgeClass}">${badgeText}</span>`;
    } else if (showPrediction && hasPrediction && !isFinished) {
        const pred = match.user_prediction;
        predictionBadge = `<span class="match-prediction-badge correct">Your pick: ${pred.predicted_home_score}-${pred.predicted_away_score}</span>`;
    }

    const classes = ['match-card'];
    if (isFinished) classes.push('finished');
    if (hasPrediction) classes.push('predicted');

    const clickAttr = onClick ? `onclick="${onClick}(${match.id})"` : `onclick="location.hash='#/predict/${match.id}'"`;

    return `
        <div class="${classes.join(' ')}" ${clickAttr} id="match-card-${match.id}">
            <div class="match-card-header">
                <span class="match-group-badge">Group ${match.group_letter || match.stage}</span>
                ${statusHtml}
            </div>
            <div class="match-teams">
                <div class="match-team">
                    <img src="${getFlagURL(match.home_team.code)}" alt="${match.home_team.code}" class="match-team-flag-svg" />
                    <span class="match-team-name">${match.home_team.name}</span>
                </div>
                <div class="match-vs">
                    ${scoreHtml}
                </div>
                <div class="match-team">
                    <img src="${getFlagURL(match.away_team.code)}" alt="${match.away_team.code}" class="match-team-flag-svg" />
                    <span class="match-team-name">${match.away_team.name}</span>
                </div>
            </div>
            <div class="match-card-footer">
                <span class="match-venue">📍 ${match.venue || 'TBD'}</span>
                ${predictionBadge}
            </div>
        </div>
    `;
}
