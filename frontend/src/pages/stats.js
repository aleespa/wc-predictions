import { renderMatchCard } from '../components/matchCard.js';
import { getFlagURL } from '../components/flags.js';
import { classifyPrediction, stagePointsFor, normalizeStageKey } from '../scoring.js';
import { t } from '../i18n.js';

// Canonical stage order + the i18n key used to label each stage.
const STAGE_ORDER = [
    'Group Stage', 'Round of 32', 'Round of 16',
    'Quarter-finals', 'Semi-finals', 'Third-place', 'Final',
];
const STAGE_LABEL_KEY = {
    'Group Stage': 'group_stage',
    'Round of 32': 'matches_filter_r32',
    'Round of 16': 'matches_filter_r16',
    'Quarter-finals': 'matches_filter_qf',
    'Semi-finals': 'matches_filter_sf',
    'Third-place': 'matches_filter_thirdplace',
    'Final': 'matches_filter_final',
};

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0);
const fmt1 = (n) => (Math.round(n * 10) / 10).toFixed(1);

function teamChip(team, size = 22) {
    if (!team) return `<span style="color:var(--text-muted)">${t('stats_team_none')}</span>`;
    return `
        <span style="display:inline-flex;align-items:center;gap:8px">
            <img src="${getFlagURL(team.code)}" alt="${team.code}" style="width:${size}px;height:${Math.round(size * 0.68)}px;object-fit:contain;border-radius:2px;box-shadow:0 1px 2px rgba(0,0,0,0.25)">
            <span style="font-weight:700">${t(team.name)}</span>
        </span>`;
}

function teamCard(icon, title, entry, hintKey, hintValueFn) {
    const hint = entry ? t(hintKey, hintValueFn(entry)) : '';
    return `
        <div class="stats-team-card">
            <div class="stats-team-role">${icon} ${title}</div>
            <div class="stats-team-name">${teamChip(entry ? entry.team : null, 26)}</div>
            <div class="stats-team-hint">${hint}</div>
        </div>`;
}

/**
 * Builds the logged-in "season wrapped" dashboard.
 * @param matches      all matches with the authed user's prediction overlaid
 * @param leaderboard  global leaderboard (for rank)
 * @param me           current user ({ username, ... })
 */
export function renderStatsDashboard(matches, leaderboard, me) {
    const name = (me && me.username) || '';
    const predicted = matches.filter(m => m.user_prediction);
    const scored = predicted.filter(m => m.is_finished && m.user_prediction.points_awarded != null);

    // ── Empty state ──────────────────────────────────────────
    if (predicted.length === 0) {
        return {
            html: `
                <div class="fade-in" style="max-width:760px;margin:0 auto">
                    <div class="hero" style="text-align:center">
                        <div class="hero-badge">${t('stats_header_badge')}</div>
                        <h1>${t('stats_header_title')}</h1>
                    </div>
                    <div class="card" style="text-align:center;padding:var(--space-2xl)">
                        <div class="empty-state-icon" style="font-size:3rem">📭</div>
                        <h2 style="margin:var(--space-md) 0 var(--space-sm)">${t('stats_empty_title')}</h2>
                        <p style="color:var(--text-secondary);margin-bottom:var(--space-lg)">${t('stats_empty_desc')}</p>
                        <a href="#/community" class="btn btn-primary">${t('stats_empty_cta')}</a>
                    </div>
                </div>`,
        };
    }

    // ── Core counts ──────────────────────────────────────────
    const totalPoints = scored.reduce((s, m) => s + (m.user_prediction.points_awarded || 0), 0);
    const totalMatches = matches.length;

    const cls = { exact: 0, gd: 0, outcome: 0, miss: 0 };
    scored.forEach(m => { const c = classifyPrediction(m); if (c) cls[c]++; });
    const correct = cls.exact + cls.gd + cls.outcome;
    const accuracy = pct(correct, scored.length);

    // ── Rank ─────────────────────────────────────────────────
    const realEntries = (leaderboard || []).filter(e => !e.is_community);
    const myEntry = realEntries.find(e => e.username === name);
    const rankHtml = myEntry
        ? `<span class="stat-number">${t('stats_rank_value', { rank: myEntry.rank })}</span>`
        : `<span class="stat-number" style="font-size:1.4rem">${t('stats_rank_unranked')}</span>`;
    const rankSub = myEntry ? t('stats_rank_of', { total: realEntries.length }) : '';

    // ── Scoring efficiency ───────────────────────────────────
    const avgPoints = scored.length ? totalPoints / scored.length : 0;
    const maxPossible = scored.reduce((s, m) => s + stagePointsFor(m.stage).exact, 0);
    const capturedPct = pct(totalPoints, maxPossible);
    const bestMatch = scored.reduce((best, m) =>
        (m.user_prediction.points_awarded > (best ? best.user_prediction.points_awarded : -1) ? m : best), null);
    const bestHaulPts = bestMatch ? bestMatch.user_prediction.points_awarded : 0;
    const bestHaulLabel = (bestMatch && bestMatch.home_team && bestMatch.away_team)
        ? `${bestMatch.home_team.code} ${bestMatch.home_score}–${bestMatch.away_score} ${bestMatch.away_team.code}`
        : '';

    // ── Goals & tendency ─────────────────────────────────────
    let goalsPred = 0, goalsActual = 0, leanHome = 0, leanDraw = 0, leanAway = 0;
    scored.forEach(m => {
        const p = m.user_prediction;
        goalsPred += (p.predicted_home_score || 0) + (p.predicted_away_score || 0);
        goalsActual += (m.home_score || 0) + (m.away_score || 0);
        if (p.predicted_home_score > p.predicted_away_score) leanHome++;
        else if (p.predicted_home_score < p.predicted_away_score) leanAway++;
        else leanDraw++;
    });
    const avgGoalsPred = scored.length ? goalsPred / scored.length : 0;
    const avgGoalsActual = scored.length ? goalsActual / scored.length : 0;
    const goalDelta = avgGoalsPred - avgGoalsActual;
    const tendencyKey = goalDelta > 0.3 ? 'stats_tendency_optimist'
        : goalDelta < -0.3 ? 'stats_tendency_cautious'
        : 'stats_tendency_spoton';

    // ── Per-stage performance ────────────────────────────────
    const stageStats = {};
    scored.forEach(m => {
        const k = normalizeStageKey(m.stage);
        const s = stageStats[k] || (stageStats[k] = { pred: 0, pts: 0, correct: 0, exact: 0 });
        s.pred++;
        s.pts += m.user_prediction.points_awarded || 0;
        const c = classifyPrediction(m);
        if (c && c !== 'miss') s.correct++;
        if (c === 'exact') s.exact++;
    });
    const stageRows = STAGE_ORDER.filter(k => stageStats[k]);
    let bestStageKey = null, bestStageAcc = -1;
    stageRows.forEach(k => {
        const acc = pct(stageStats[k].correct, stageStats[k].pred);
        if (acc > bestStageAcc || (acc === bestStageAcc && stageStats[k].pts > (stageStats[bestStageKey]?.pts || 0))) {
            bestStageAcc = acc; bestStageKey = k;
        }
    });

    // ── Team highlights ──────────────────────────────────────
    const teamAgg = {};
    scored.forEach(m => {
        const c = classifyPrediction(m);
        [m.home_team, m.away_team].forEach(team => {
            if (!team) return;
            const e = teamAgg[team.id] || (teamAgg[team.id] = { team, count: 0, points: 0, misses: 0 });
            e.count++;
            e.points += m.user_prediction.points_awarded || 0;
            if (c === 'miss') e.misses++;
        });
    });
    const teamList = Object.values(teamAgg);
    const favourite = teamList.slice().sort((a, b) => b.count - a.count || b.points - a.points)[0] || null;
    const lucky = teamList.slice().sort((a, b) => b.points - a.points || b.count - a.count)[0] || null;
    const nemesisCand = teamList.filter(e => e.misses > 0).sort((a, b) => b.misses - a.misses || a.points - b.points);
    const nemesis = nemesisCand[0] || null;

    // ── Best predictions showcase ────────────────────────────
    const bestPreds = scored.slice()
        .filter(m => m.user_prediction.points_awarded > 0)
        .sort((a, b) => b.user_prediction.points_awarded - a.user_prediction.points_awarded)
        .slice(0, 4);

    // ── Accuracy segmented bar segments ──────────────────────
    const accSegs = [
        { key: 'exact', color: 'var(--accent-gold)', label: t('stats_exact'), count: cls.exact },
        { key: 'gd', color: 'var(--accent-green)', label: t('stats_gd'), count: cls.gd },
        { key: 'outcome', color: 'var(--accent-blue)', label: t('stats_outcome'), count: cls.outcome },
        { key: 'miss', color: 'var(--accent-red)', label: t('stats_miss'), count: cls.miss },
    ];
    const accBar = accSegs.map(s =>
        `<div class="stats-acc-seg" data-fill="${pct(s.count, scored.length)}%" style="background:${s.color}"></div>`
    ).join('');
    const accLegend = accSegs.map(s => `
        <div class="stats-legend-row">
            <span class="stats-dot" style="background:${s.color}"></span>
            <span class="stats-legend-label">${s.label}</span>
            <span class="stats-legend-val">${t('stats_count_pct', { count: s.count, pct: pct(s.count, scored.length) })}</span>
        </div>`).join('');

    // ── Lean segmented bar ───────────────────────────────────
    const leanSegs = [
        { color: 'var(--accent-green)', label: t('stats_lean_home'), count: leanHome },
        { color: 'var(--text-muted)', label: t('stats_lean_draw'), count: leanDraw },
        { color: 'var(--accent-purple)', label: t('stats_lean_away'), count: leanAway },
    ];
    const leanBar = leanSegs.map(s =>
        `<div class="stats-acc-seg" data-fill="${pct(s.count, scored.length)}%" style="background:${s.color}"></div>`
    ).join('');
    const leanLegend = leanSegs.map(s => `
        <div class="stats-legend-row">
            <span class="stats-dot" style="background:${s.color}"></span>
            <span class="stats-legend-label">${s.label}</span>
            <span class="stats-legend-val">${t('stats_count_pct', { count: s.count, pct: pct(s.count, scored.length) })}</span>
        </div>`).join('');

    // ── HTML ─────────────────────────────────────────────────
    const html = `
        <div class="fade-in stats-dashboard">
            <div class="stats-hero">
                <div class="hero-badge">${t('stats_header_badge')}</div>
                <h1 style="margin:var(--space-sm) 0">${t('stats_header_title')}</h1>
                <p style="color:var(--text-secondary)">${t('stats_header_sub', { name })}</p>
            </div>

            <!-- Headline tiles -->
            <div class="profile-stats" style="margin-top:var(--space-xl)">
                <div class="profile-stat-card">
                    <div class="profile-stat-value"><span class="stat-number">${totalPoints}</span></div>
                    <div class="profile-stat-label">${t('stats_tile_points')}</div>
                </div>
                <div class="profile-stat-card">
                    <div class="profile-stat-value">${rankHtml}</div>
                    <div class="profile-stat-label">${t('stats_tile_rank')}${rankSub ? ` · ${rankSub}` : ''}</div>
                </div>
                <div class="profile-stat-card">
                    <div class="profile-stat-value">🔮 <span class="stat-number">${predicted.length}</span></div>
                    <div class="profile-stat-label">${t('stats_tile_predicted')} · ${t('stats_coverage', { pct: pct(predicted.length, totalMatches) })}</div>
                </div>
                <div class="profile-stat-card">
                    <div class="profile-stat-value">🎯 <span class="stat-number">${accuracy}%</span></div>
                    <div class="profile-stat-label">${t('stats_tile_accuracy')} · ${t('stats_accuracy_hint', { correct, total: scored.length })}</div>
                </div>
            </div>

            <!-- Accuracy breakdown -->
            <div class="card stats-section">
                <h3 class="stats-section-title">${t('stats_section_accuracy')}</h3>
                <div class="stats-acc-bar">${accBar}</div>
                <div class="stats-legend">${accLegend}</div>
            </div>

            <!-- Efficiency + Goals side by side -->
            <div class="stats-two-col">
                <div class="card stats-section">
                    <h3 class="stats-section-title">${t('stats_section_efficiency')}</h3>
                    <div class="stats-metric">
                        <span class="stats-metric-label">${t('stats_avg_points')}</span>
                        <span class="stats-metric-val">${fmt1(avgPoints)}</span>
                    </div>
                    <div class="stats-metric">
                        <span class="stats-metric-label">${t('stats_captured')}</span>
                        <span class="stats-metric-val">${capturedPct}%</span>
                    </div>
                    <div class="status-bar" style="margin-bottom:var(--space-sm)"><div class="status-bar-fill" data-fill="${capturedPct}%"></div></div>
                    <div class="stats-metric-hint">${t('stats_captured_hint', { points: totalPoints, max: maxPossible })}</div>
                    <div class="stats-metric" style="margin-top:var(--space-md)">
                        <span class="stats-metric-label">${t('stats_best_haul')}</span>
                        <span class="stats-metric-val" style="color:var(--accent-gold)">${t('stats_pts', { pts: bestHaulPts })}</span>
                    </div>
                    ${bestHaulLabel ? `<div class="stats-metric-hint">${bestHaulLabel}</div>` : ''}
                </div>

                <div class="card stats-section">
                    <h3 class="stats-section-title">${t('stats_section_goals')}</h3>
                    <div class="stats-metric">
                        <span class="stats-metric-label">${t('stats_goals_predicted')}</span>
                        <span class="stats-metric-val">${goalsPred}</span>
                    </div>
                    <div class="stats-metric">
                        <span class="stats-metric-label">${t('stats_avg_goals')}</span>
                        <span class="stats-metric-val">${fmt1(avgGoalsPred)}</span>
                    </div>
                    <div class="stats-metric">
                        <span class="stats-metric-label">${t('stats_actual_avg_goals')}</span>
                        <span class="stats-metric-val" style="color:var(--text-muted)">${fmt1(avgGoalsActual)}</span>
                    </div>
                    <div class="stats-tendency">${t(tendencyKey)}</div>
                    <div class="stats-metric-label" style="margin-top:var(--space-md);margin-bottom:6px">${t('stats_lean')}</div>
                    <div class="stats-acc-bar">${leanBar}</div>
                    <div class="stats-legend">${leanLegend}</div>
                </div>
            </div>

            <!-- Per-stage table -->
            <div class="card stats-section" style="overflow-x:auto">
                <h3 class="stats-section-title">${t('stats_section_stages')}</h3>
                <table class="stats-stage-table">
                    <thead>
                        <tr>
                            <th style="text-align:left">${t('stats_stage_th_stage')}</th>
                            <th>${t('stats_stage_th_pred')}</th>
                            <th>${t('stats_stage_th_pts')}</th>
                            <th>${t('stats_stage_th_acc')}</th>
                            <th>${t('stats_stage_th_exact')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${stageRows.map(k => {
                            const s = stageStats[k];
                            const acc = pct(s.correct, s.pred);
                            const isBest = k === bestStageKey && s.pred > 0;
                            return `
                                <tr${isBest ? ' class="stats-best-stage"' : ''}>
                                    <td style="text-align:left">${t(STAGE_LABEL_KEY[k]) || k}${isBest ? ` <span class="stats-best-badge">${t('stats_best_stage_badge')}</span>` : ''}</td>
                                    <td>${s.pred}</td>
                                    <td style="font-weight:800;color:var(--accent-gold)">${s.pts}</td>
                                    <td>${acc}%</td>
                                    <td>${s.exact}</td>
                                </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>

            <!-- Team highlights -->
            <div class="card stats-section">
                <h3 class="stats-section-title">${t('stats_section_teams')}</h3>
                <div class="stats-team-grid">
                    ${teamCard('⭐', t('stats_team_favourite'), favourite, 'stats_team_favourite_hint', e => ({ count: e.count }))}
                    ${teamCard('🍀', t('stats_team_lucky'), lucky, 'stats_team_lucky_hint', e => ({ pts: e.points }))}
                    ${teamCard('💀', t('stats_team_nemesis'), nemesis, 'stats_team_nemesis_hint', e => ({ count: e.misses }))}
                </div>
            </div>

            <!-- Best predictions -->
            ${bestPreds.length > 0 ? `
                <div class="stats-section">
                    <h3 class="stats-section-title" style="padding:0 4px">${t('stats_section_best')}</h3>
                    <div class="matches-grid" id="stats-best-grid">
                        ${bestPreds.map(m => renderMatchCard(m)).join('')}
                    </div>
                </div>
            ` : ''}
        </div>`;

    return {
        html,
        init: () => {
            // Grow the segmented / status bars from 0 → target for a subtle reveal.
            requestAnimationFrame(() => {
                document.querySelectorAll('.stats-dashboard [data-fill]').forEach(el => {
                    el.style.width = el.dataset.fill;
                });
            });
            // Best-prediction cards are read-only (not clickable to /predict).
            document.querySelectorAll('#stats-best-grid .match-card').forEach(el => {
                el.removeAttribute('onclick');
                el.style.cursor = 'default';
            });
        },
    };
}
