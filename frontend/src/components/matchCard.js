import { getFlagURL } from './flags.js';
import { t, getLanguage } from '../i18n.js';

function getRemainingTimeStr(matchDate) {
    const now = new Date();
    const diffMs = matchDate - now;

    if (diffMs <= 0) {
        return null;
    }

    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    const mins = diffMins % 60;
    const hours = diffHours % 24;

    if (diffDays > 0) {
        return `${diffDays}d ${hours}h`;
    } else if (diffHours > 0) {
        return `${diffHours}h ${mins}m`;
    } else {
        return `${diffMins}m`;
    }
}

export function renderMatchCard(match, options = {}) {
    const { onClick, showPrediction = true, profileName } = options;
    const isFinished = match.is_finished;
    const hasPrediction = match.user_prediction != null;
    const matchDate = new Date(match.match_date);

    const now = new Date();
    const matchStartTime = matchDate.getTime();
    const matchEndTime = matchStartTime + 2 * 60 * 60 * 1000;
    const currentTime = now.getTime();

    const isLive = !isFinished && currentTime >= matchStartTime && currentTime < matchEndTime;
    const isWaiting = !isFinished && currentTime >= matchEndTime;

    // Determine if match is confirmed (teams resolved)
    const isConfirmed = match.home && match.home.team && match.away && match.away.team;


    const dateStr = matchDate.toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric'
    });
    const timeStr = matchDate.toLocaleTimeString(undefined, {
        hour: '2-digit', minute: '2-digit'
    });

    let statusHtml = '';
    if (isFinished) {
        statusHtml = `<span class="match-status finished">${t('match_status_finished')}</span>`;
    } else if (isLive) {
        statusHtml = `<span class="match-status live">${t('match_status_live')}</span>`;
    } else if (isWaiting) {
        statusHtml = `<span class="match-status waiting">${t('match_status_waiting')}</span>`;
    } else {
        const remainingTimeStr = getRemainingTimeStr(matchDate);
        const timeChipHtml = remainingTimeStr ? `<span class="match-time-remaining">🕒 ${remainingTimeStr}</span>` : '';
        
        if (hasPrediction) {
            statusHtml = `
                <div style="display:flex; gap:6px; align-items:center">
                    ${timeChipHtml}
                    <span class="match-status predicted">${t('match_status_predicted')}</span>
                </div>
            `;
        } else if (!match.is_confirmed) {
            statusHtml = `
                <div style="display:flex; gap:6px; align-items:center">
                    ${timeChipHtml}
                    <span class="match-status waiting">${t('match_status_not_confirmed')}</span>
                </div>
            `;
        } else {
            statusHtml = `
                <div style="display:flex; gap:6px; align-items:center">
                    ${timeChipHtml}
                    <span class="match-status upcoming">${t('match_status_upcoming')}</span>
                </div>
            `;
        }
    }

    const homeTeamHtml = match.home_team ? `
        <div class="team-meta home" style="display:flex; align-items:center; gap:8px; justify-content:flex-end">
            <span class="match-team-name">${t(match.home_team.name)}</span>
            <img src="${getFlagURL(match.home_team.code)}" alt="${match.home_team.code}" class="match-team-flag-svg" />
        </div>
    ` : `
        <span class="match-team-name TBD" style="color:var(--text-muted);font-style:italic;font-size:0.8rem">${match.home_slot || t('common_tbd')}</span>
    `;

    const awayTeamHtml = match.away_team ? `
        <div class="team-meta away" style="display:flex; align-items:center; gap:8px; justify-content:flex-start">
            <img src="${getFlagURL(match.away_team.code)}" alt="${match.away_team.code}" class="match-team-flag-svg" />
            <span class="match-team-name">${t(match.away_team.name)}</span>
        </div>
    ` : `
        <span class="match-team-name TBD" style="color:var(--text-muted);font-style:italic;font-size:0.8rem">${match.away_slot || t('common_tbd')}</span>
    `;

    let actualScoreHtml = '';
    if (isFinished) {
        let pkWinnerHtml = '';
        if (match.stage !== 'Group Stage' && match.home_score === match.away_score && match.penalty_winner_id) {
            let winTeam = null;
            if (match.home_team && match.penalty_winner_id === match.home_team.id) {
                winTeam = match.home_team;
            } else if (match.away_team && match.penalty_winner_id === match.away_team.id) {
                winTeam = match.away_team;
            }
            if (winTeam) {
                const winsText = getLanguage() === 'es' ? `(${winTeam.code} gana en penales)` : `(${winTeam.code} wins on penalties)`;
                pkWinnerHtml = `<div class="pk-winner-label" style="grid-column: 1 / -1; text-align:center; font-size:0.6rem; font-weight:700; color:var(--accent-purple); margin-top:2px">${winsText}</div>`;
            }
        }
        actualScoreHtml = `
            <div class="score-value actual home-side" style="text-align:right; font-size:1.55rem; font-weight:800; color:var(--text-primary); padding-right:6px">${match.home_score}</div>
            <div class="score-divider actual" style="text-align:center; font-size:1.55rem; font-weight:800; color:var(--text-muted)">—</div>
            <div class="score-value actual away-side" style="text-align:left; font-size:1.55rem; font-weight:800; color:var(--text-primary); padding-left:6px">${match.away_score}</div>
            ${pkWinnerHtml}
        `;
    } else {
        actualScoreHtml = `
            <div style="grid-column: 1 / -1; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.25; margin: 4px 0;">
                <span style="font-size:0.7rem; color:var(--text-muted); font-weight:600">${dateStr}</span>
                <span style="font-size:0.75rem; color:var(--text-muted); font-weight:500; opacity:0.8">${timeStr}</span>
            </div>
        `;
    }

    let predictionScoreHtml = '';
    if (showPrediction && hasPrediction) {
        const pred = match.user_prediction;
    const pts = pred.points_awarded;
        const stage = match.stage || "Group Stage";
        
        // Define points per stage
        const POINTS_TABLE = {
            "Group Stage": { exact: 3, gd: 2, outcome: 1 },
            "Round of 32": { exact: 6, gd: 4, outcome: 2 },
            "Round of 16": { exact: 8, gd: 6, outcome: 3 },
            "Round of 8": { exact: 10, gd: 7, outcome: 4 },
            "Quarter-finals": { exact: 12, gd: 8, outcome: 4 },
            "Semi-finals": { exact: 16, gd: 12, outcome: 5 },
            "Final": { exact: 25, gd: 20, outcome: 15 },
            "Third Place Match": { exact: 25, gd: 20, outcome: 15 },
        };

        const stageKey = stage.includes("Quarter") ? "Quarter-finals" :
                         stage.includes("Semi") ? "Semi-finals" :
                         stage.includes("Final") ? "Final" :
                         stage.includes("Third") ? "Third Place Match" : stage;

        const stagePts = POINTS_TABLE[stageKey] || POINTS_TABLE["Group Stage"];

        let badgeClass = 'upcoming';
        let ptsText = '';
        if (isFinished) {
            if (pts === stagePts.exact) badgeClass = 'exact';
            else if (pts >= 1) badgeClass = 'correct';
            else badgeClass = 'wrong';
            ptsText = `${pts} pts`;
        } else {
            // Show potential max points
            ptsText = `max ${stagePts.exact} pts`;
            badgeClass = 'potential';
        }

        let pkWinnerPredHtml = '';
        const isKnockout = match.stage !== 'Group Stage';
        if (isKnockout && pred.predicted_home_score === pred.predicted_away_score && pred.penalty_winner_id) {
            let winTeam = null;
            if (match.home_team && pred.penalty_winner_id === match.home_team.id) {
                winTeam = match.home_team;
            } else if (match.away_team && pred.penalty_winner_id === match.away_team.id) {
                winTeam = match.away_team;
            }
            if (winTeam) {
                const winsText = getLanguage() === 'es' ? `(${winTeam.code} gana)` : `(${winTeam.code} wins)`;
                pkWinnerPredHtml = `<div class="pk-pred-label" style="grid-column: 1 / -1; text-align:center; font-size:0.6rem; font-weight:700; color:var(--accent-purple-light); margin-top:2px">${winsText}</div>`;
            }
        }

        const predColor = isFinished ? 'var(--text-muted)' : 'var(--accent-purple-light)';
        
        const labelTitle = profileName ? 
            t('predict_user_pred', { name: profileName }) : 
            t('predict_your_pred');

        let centerDividerHtml = '';
        if (isFinished) {
            centerDividerHtml = `<span class="match-prediction-badge-chip ${badgeClass}">${ptsText}</span>`;
        } else {
            centerDividerHtml = `<span style="font-size:1.35rem; font-weight:700; color:${predColor}">—</span>`;
        }

        predictionScoreHtml = `
            <div class="match-card-prediction-box" style="grid-column: 1 / -1; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: var(--radius-lg); padding: 8px var(--space-sm) var(--space-sm); position: relative; margin-top: var(--space-xs); box-shadow: inset 0 1px 1px rgba(255,255,255,0.02);">
                <!-- Subtle Top Header Label -->
                <div style="grid-column: 1 / -1; text-align: center; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); opacity: 0.8; margin-bottom: 6px; font-weight: 700;">
                    🔮 ${labelTitle}
                </div>
                
                <div class="score-value predicted home-side" style="text-align:right; font-size:1.35rem; font-weight:700; color:${predColor}; padding-right:6px">${pred.predicted_home_score}</div>
                <div class="score-divider predicted" style="text-align:center; display: flex; align-items: center; justify-content: center;">
                    ${centerDividerHtml}
                </div>
                <div class="score-value predicted away-side" style="text-align:left; font-size:1.35rem; font-weight:700; color:${predColor}; padding-left:6px">${pred.predicted_away_score}</div>
                ${pkWinnerPredHtml}
            </div>
        `;
    } else if (showPrediction && !hasPrediction) {
        const labelTitle = profileName ? 
            t('predict_user_pred', { name: profileName }) : 
            t('predict_your_pred');

        predictionScoreHtml = `
            <div class="match-card-prediction-box" style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; background: rgba(255, 255, 255, 0.01); border: 1px dashed rgba(255, 255, 255, 0.08); border-radius: var(--radius-lg); padding: 8px var(--space-sm); margin-top: var(--space-xs);">
                <div style="text-align: center; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); opacity: 0.6; margin-bottom: 4px; font-weight: 700;">
                    🔮 ${labelTitle}
                </div>
                <div style="text-align: center; font-size: 0.75rem; color: var(--text-muted); font-style: italic;">
                    ${profileName ? t('match_user_no_prediction', { name: profileName }) : t('match_no_prediction')}
                </div>
            </div>
        `;
    }

    const classes = ['match-card'];
    if (isFinished) classes.push('finished');
    if (hasPrediction) classes.push('predicted');
    
    const isLocked = !match.is_confirmed && !isFinished;
    if (isLocked) {
        classes.push('locked');
    }

    const clickAttr = isLocked 
        ? '' 
        : (onClick ? `onclick="${onClick}(${match.id})"` : `onclick="location.hash='#/predict/${match.id}'"`);

    return `
        <div class="${classes.join(' ')}" ${clickAttr} id="match-card-${match.id}">
            <div class="match-card-header">
                <span class="match-group-badge">${match.group_letter ? t('stage_group', { group: match.group_letter }) : t('stage_' + match.stage.toLowerCase().replace(/[^a-z0-9]/g, '')) || match.stage}</span>
                ${statusHtml}
            </div>
            <div class="match-card-grid">
                <!-- Row 1: Teams (Flags and Names) -->
                <div class="match-card-grid-column home-side">
                    ${homeTeamHtml}
                </div>
                <div class="match-card-grid-column vs-side"></div>
                <div class="match-card-grid-column away-side">
                    ${awayTeamHtml}
                </div>
                
                <!-- Row 2: Actual Score -->
                ${actualScoreHtml}
                
                <!-- Row 3: User Prediction -->
                ${predictionScoreHtml}
            </div>
        </div>
    `;
}
