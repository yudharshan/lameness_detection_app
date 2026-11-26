import type {
  CattlePassage,
  LocomotionScore,
  RiskLevel,
} from '@/types/cattle';
import { riskFromScore } from '@/lib/herd';
import { makeVelocityLog } from '@/lib/velocity';

const FLEXION_BASE: Record<LocomotionScore, number> = {
  1: 142,
  2: 136,
  3: 129,
  4: 121,
  5: 114,
};

const CURVATURE_BASE: Record<LocomotionScore, number> = {
  1: 1.05,
  2: 1.16,
  3: 1.3,
  4: 1.48,
  5: 1.66,
};

const ASYMMETRY_BASE: Record<LocomotionScore, number> = {
  1: 4.5,
  2: 11,
  3: 18,
  4: 26,
  5: 31,
};

const PHASE_BASE: Record<LocomotionScore, number> = {
  1: 1.01,
  2: 1.08,
  3: 1.2,
  4: 1.36,
  5: 1.54,
};

const VELOCITY_BASE: Record<LocomotionScore, number> = {
  1: 1.28,
  2: 1.18,
  3: 1.05,
  4: 0.9,
  5: 0.76,
};

/** Weighted so a simulated herd still reads mostly sound. */
const SCORE_WEIGHTS: LocomotionScore[] = [1, 1, 1, 1, 2, 2, 3, 3, 4, 5];

const NOTES: Record<RiskLevel, string> = {
  Healthy: 'Stride is symmetric; no lameness signal detected.',
  'Mild Risk': 'Early gait deviation detected; recheck recommended.',
  'Moderate Lame': 'Moderate load shift; schedule a lameness exam.',
  'Severe Lame': 'Severe asymmetry detected; flagged for review.',
  'Critically Lame': 'Critical gait deviation; urgent review required.',
};

function jitter(spread: number): number {
  return (Math.random() * 2 - 1) * spread;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export interface SimulatedCapture {
  videoUri?: string;
  durationSec?: number;
}

/**
 * Builds a plausible new passage for a cow crossing the virtual trigger.
 * Scores are weighted toward sound animals so the stream feels like a real
 * herd rather than a demo of only lame cows.
 */
export function createSimulatedPassage(
  existing: CattlePassage[],
  capture: SimulatedCapture = {},
): CattlePassage {
  const score =
    SCORE_WEIGHTS[Math.floor(Math.random() * SCORE_WEIGHTS.length)];
  const risk = riskFromScore(score);
  const entryOrder =
    existing.reduce((max, passage) => Math.max(max, passage.entryOrder), 0) + 1;
  const tagId = `C${entryOrder}`;
  const now = new Date();

  const purgedCount = score >= 5 ? 3 : score >= 4 ? 2 : score >= 3 ? 1 : 0;
  const purgedFrames = Array.from({ length: purgedCount }, (_, index) =>
    Math.max(2, Math.round(((index + 1) * 19) / (purgedCount + 1))),
  );

  return {
    id: `psg-${now.getTime()}-${entryOrder}`,
    tagId,
    entryOrder,
    passageTime: now.toISOString(),
    locomotionScore: score,
    riskLevel: risk,
    videoUri:
      capture.videoUri ??
      `mock://herdsight/barn-3/${now.toISOString().slice(0, 10)}/${tagId}.mp4`,
    status: 'Processing',
    detectionConfidence: round(0.86 + Math.random() * 0.12, 2),
    clipDurationSec: round(capture.durationSec ?? 6.4 + Math.random() * 2.4, 1),
    analysisNote: NOTES[risk],
    metrics: {
      triJointFlexionAngle: Math.round(
        Math.min(145, Math.max(110, FLEXION_BASE[score] + jitter(3))),
      ),
      spineCurvatureRatio: round(
        Math.min(1.75, Math.max(1.0, CURVATURE_BASE[score] + jitter(0.03))),
        2,
      ),
      asymmetryIndex: round(
        Math.min(32, Math.max(2, ASYMMETRY_BASE[score] + jitter(2.2))),
        1,
      ),
      limbPhaseShift: round(
        Math.min(1.6, Math.max(0.9, PHASE_BASE[score] + jitter(0.025))),
        2,
      ),
      velocityLog: makeVelocityLog(
        VELOCITY_BASE[score],
        purgedFrames,
        20,
        score >= 4 ? 0.08 : 0.05,
      ),
    },
  };
}
