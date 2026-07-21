// Shared scoring helpers.
// Single source of truth for how many points a prediction is worth per stage,
// and how to classify a finished prediction. Used by the match card badge and by
// the personal stats dashboard so both agree on the numbers.

// Points per stage: exact scoreline, correct result + goal-difference, correct outcome.
export const POINTS_TABLE = {
    "Group Stage": { exact: 3, gd: 2, outcome: 1 },
    "Round of 32": { exact: 6, gd: 4, outcome: 2 },
    "Round of 16": { exact: 10, gd: 7, outcome: 4 },
    "Quarter-finals": { exact: 12, gd: 8, outcome: 4 },
    "Semi-finals": { exact: 16, gd: 12, outcome: 5 },
    "Final": { exact: 25, gd: 20, outcome: 15 },
    "Third-place": { exact: 16, gd: 12, outcome: 5 },
};

/** Map any stage label to a canonical POINTS_TABLE key. */
export function normalizeStageKey(stage) {
    const s = stage || "Group Stage";
    return s.includes("Quarter") ? "Quarter-finals" :
           s.includes("Semi") ? "Semi-finals" :
           s.includes("Final") ? "Final" :
           s.includes("Third") ? "Third-place" : s;
}

/** Points breakdown for a match's stage (falls back to Group Stage). */
export function stagePointsFor(stage) {
    return POINTS_TABLE[normalizeStageKey(stage)] || POINTS_TABLE["Group Stage"];
}

/**
 * Classify a finished, predicted match by how good the prediction was.
 * Returns 'exact' | 'gd' | 'outcome' | 'miss', or null when the match is not
 * finished or has no user prediction.
 */
export function classifyPrediction(match) {
    if (!match || !match.is_finished || !match.user_prediction) return null;
    const pts = match.user_prediction.points_awarded;
    if (pts == null) return null;
    const sp = stagePointsFor(match.stage);
    if (pts === sp.exact) return 'exact';
    if (pts === sp.gd) return 'gd';
    if (pts === sp.outcome) return 'outcome';
    return 'miss';
}
