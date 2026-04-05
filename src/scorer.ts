/**
 * scorer.ts
 * Pure scoring engine — no VS Code API dependencies.
 * Calculates a "chaos score" from error/warning counts and maps it to a stage (1–9).
 */

export interface ScoreResult {
  errors: number;
  warnings: number;
  chaosScore: number;
  stage: number;
  stageName: string;
}

/** Human-readable names for each stage. */
export const STAGE_NAMES: readonly string[] = [
  'All Good',         // 1
  'Slight Concern',   // 2
  'Mild Errors',      // 3
  'Noticeable Issues',// 4
  'Disturbing Errors',// 5
  'Serious Problems', // 6
  'Critical Errors',  // 7
  'Extreme Failure',  // 8
  'Full Uncanny',     // 9
];

/**
 * Default chaos score thresholds for each stage.
 * Index i corresponds to stage (i+1).
 * A score >= thresholds[8] maps to stage 9, etc.
 */
export const DEFAULT_STAGE_THRESHOLDS: readonly number[] = [
  0,   // stage 1: score 0
  1,   // stage 2: score 1–2
  3,   // stage 3: score 3–4
  5,   // stage 4: score 5–6
  7,   // stage 5: score 7–8
  9,   // stage 6: score 9–10
  11,  // stage 7: score 11–13
  14,  // stage 8: score 14–16
  17,  // stage 9: score 17+
];

/**
 * Calculate the chaos score from raw diagnostic counts.
 * @param errors   Number of error-severity diagnostics
 * @param warnings Number of warning-severity diagnostics
 * @param errorWeight  Weight multiplier for errors (default 2)
 * @param warningWeight Weight multiplier for warnings (default 1)
 */
export function calculateScore(
  errors: number,
  warnings: number,
  errorWeight = 2,
  warningWeight = 1,
): number {
  return Math.max(0, errors * errorWeight + warnings * warningWeight);
}

/**
 * Map a chaos score to a stage number 1–9.
 * @param score       The chaos score
 * @param thresholds  Array of 9 ascending threshold values
 */
export function scoreToStage(
  score: number,
  thresholds: readonly number[] = DEFAULT_STAGE_THRESHOLDS,
): number {
  // Walk from the highest threshold down to find the matching stage
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (score >= thresholds[i]) {
      return i + 1; // stages are 1-indexed
    }
  }
  return 1;
}

/**
 * Produce a full ScoreResult object from raw counts.
 */
export function buildScoreResult(
  errors: number,
  warnings: number,
  thresholds: readonly number[] = DEFAULT_STAGE_THRESHOLDS,
  errorWeight = 2,
  warningWeight = 1,
): ScoreResult {
  const chaosScore = calculateScore(errors, warnings, errorWeight, warningWeight);
  const stage = scoreToStage(chaosScore, thresholds);
  return {
    errors,
    warnings,
    chaosScore,
    stage,
    stageName: STAGE_NAMES[stage - 1],
  };
}
