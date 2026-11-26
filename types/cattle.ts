/**
 * Core domain model for the hardware-free sequential cattle lameness platform.
 *
 * A "passage" is one cow walking past a fixed virtual trigger line. Clips are
 * captured continuously and split into sequential passages by entry order,
 * rather than by wearable sensors.
 */

export type RiskLevel =
  | 'Healthy'
  | 'Mild Risk'
  | 'Moderate Lame'
  | 'Severe Lame'
  | 'Critically Lame';

export type PassageStatus = 'Processing' | 'Analyzed' | 'Flagged';

export type LocomotionScore = 1 | 2 | 3 | 4 | 5;

export type RiskFilter = 'All' | RiskLevel;

/** One sampled stride velocity, in metres per second, at a video frame. */
export interface VelocitySample {
  /** 1-based frame index within the passage clip. */
  frame: number;
  /** Estimated forward velocity (m/s). */
  v: number;
  /** True when the frame was discarded before scoring (blur / occlusion). */
  purged: boolean;
}

/**
 * Pose-derived measurements that explain a locomotion score.
 * All values are computed from a single monocular camera feed.
 */
export interface BiomechanicalMetrics {
  /** Triple-joint (carpal, tarsal, fetlock) flexion angle in degrees. */
  triJointFlexionAngle: number;
  /** Spinal arch ratio R_arch — topline chord vs. withers pin distance. */
  spineCurvatureRatio: number;
  /** Left/right stance asymmetry as a percentage of stride duration. */
  asymmetryIndex: number;
  /** Stance-to-swing duration ratio for the affected limb. */
  limbPhaseShift: number;
  /** Per-frame velocity trace, including any purged samples. */
  velocityLog: VelocitySample[];
}

export interface CattlePassage {
  id: string;
  /** Visual ear tag / herd identifier, e.g. "C1". */
  tagId: string;
  /** 1-based order in which the cow crossed the trigger. */
  entryOrder: number;
  /** ISO 8601 local timestamp of the trigger crossing. */
  passageTime: string;
  locomotionScore: LocomotionScore;
  riskLevel: RiskLevel;
  videoUri: string;
  status: PassageStatus;
  /** Pose-derived evidence behind the score. */
  metrics: BiomechanicalMetrics;
  /** Model confidence, 0–1. */
  detectionConfidence: number;
  /** Length of the captured clip in seconds. */
  clipDurationSec: number;
  /** Optional short, human-readable finding. */
  analysisNote?: string;
}

export interface HerdSummary {
  total: number;
  analyzed: number;
  processing: number;
  flagged: number;
  /** Cows scored 1 — no lameness signal. */
  healthy: number;
  /** Cows scored 2–5 — any lameness signal. */
  atRisk: number;
  averageScore: number;
  /** 0–100 score where 100 is a fully sound herd. */
  soundnessIndex: number;
  distribution: Record<RiskLevel, number>;
  latestPassage: CattlePassage | null;
}
