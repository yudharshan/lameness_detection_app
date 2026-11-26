import type {
  CattlePassage,
  HerdSummary,
  LocomotionScore,
  PassageStatus,
  RiskLevel,
} from '@/types/cattle';

export const RISK_ORDER: RiskLevel[] = [
  'Healthy',
  'Mild Risk',
  'Moderate Lame',
  'Severe Lame',
  'Critically Lame',
];

interface RiskMeta {
  label: RiskLevel;
  short: string;
  /** Solid hex used by SVG / icon props. */
  hex: string;
  badge: string;
  text: string;
  dot: string;
  soft: string;
  border: string;
  bar: string;
}

export const RISK_META: Record<RiskLevel, RiskMeta> = {
  Healthy: {
    label: 'Healthy',
    short: 'Sound',
    hex: '#146B45',
    badge: 'bg-forest-100 border-forest-200',
    text: 'text-forest-700',
    dot: 'bg-forest-600',
    soft: 'bg-forest-50',
    border: 'border-forest-200',
    bar: 'bg-forest-600',
  },
  'Mild Risk': {
    label: 'Mild Risk',
    short: 'Watch',
    hex: '#F59E0B',
    badge: 'bg-amber-50 border-amber-200',
    text: 'text-amber-700',
    dot: 'bg-amber-400',
    soft: 'bg-amber-50',
    border: 'border-amber-200',
    bar: 'bg-amber-400',
  },
  'Moderate Lame': {
    label: 'Moderate Lame',
    short: 'Moderate',
    hex: '#B45309',
    badge: 'bg-amber-100 border-amber-300',
    text: 'text-amber-700',
    dot: 'bg-amber-600',
    soft: 'bg-amber-50',
    border: 'border-amber-300',
    bar: 'bg-amber-600',
  },
  'Severe Lame': {
    label: 'Severe Lame',
    short: 'Lame',
    hex: '#DC2626',
    badge: 'bg-crimson-50 border-crimson-200',
    text: 'text-crimson-700',
    dot: 'bg-crimson-500',
    soft: 'bg-crimson-50',
    border: 'border-crimson-200',
    bar: 'bg-crimson-500',
  },
  'Critically Lame': {
    label: 'Critically Lame',
    short: 'Critical',
    hex: '#9F1239',
    badge: 'bg-crimson-100 border-crimson-700',
    text: 'text-crimson-700',
    dot: 'bg-crimson-700',
    soft: 'bg-crimson-100',
    border: 'border-crimson-300',
    bar: 'bg-crimson-700',
  },
};

interface StatusMeta {
  label: PassageStatus;
  badge: string;
  text: string;
  hex: string;
}

export const STATUS_META: Record<PassageStatus, StatusMeta> = {
  Processing: {
    label: 'Processing',
    badge: 'bg-canvas border-line',
    text: 'text-ink-muted',
    hex: '#84938D',
  },
  Analyzed: {
    label: 'Analyzed',
    badge: 'bg-forest-50 border-forest-200',
    text: 'text-forest-700',
    hex: '#146B45',
  },
  Flagged: {
    label: 'Flagged',
    badge: 'bg-crimson-50 border-crimson-200',
    text: 'text-crimson-700',
    hex: '#BE123C',
  },
};

export const SCORE_LABELS: Record<LocomotionScore, string> = {
  1: 'Sound gait',
  2: 'Slight arch',
  3: 'Moderate lame',
  4: 'Lame',
  5: 'Critically lame',
};

export const SCORE_HEX: Record<LocomotionScore, string> = {
  1: '#146B45',
  2: '#D97706',
  3: '#B45309',
  4: '#BE123C',
  5: '#9F1239',
};

export function riskFromScore(score: LocomotionScore): RiskLevel {
  switch (score) {
    case 1:
      return 'Healthy';
    case 2:
      return 'Mild Risk';
    case 3:
      return 'Moderate Lame';
    case 4:
      return 'Severe Lame';
    default:
      return 'Critically Lame';
  }
}

export function statusFromScore(score: LocomotionScore): PassageStatus {
  return score >= 4 ? 'Flagged' : 'Analyzed';
}

export function computeHerdSummary(passages: CattlePassage[]): HerdSummary {
  const distribution: Record<RiskLevel, number> = {
    Healthy: 0,
    'Mild Risk': 0,
    'Moderate Lame': 0,
    'Severe Lame': 0,
    'Critically Lame': 0,
  };

  let flagged = 0;
  let processing = 0;
  let scoreTotal = 0;

  for (const passage of passages) {
    distribution[passage.riskLevel] += 1;
    scoreTotal += passage.locomotionScore;
    if (passage.status === 'Flagged') flagged += 1;
    if (passage.status === 'Processing') processing += 1;
  }

  const total = passages.length;
  const averageScore = total === 0 ? 0 : scoreTotal / total;
  const soundnessIndex =
    total === 0 ? 0 : Math.round(100 - ((averageScore - 1) / 4) * 100);
  const healthy = distribution.Healthy;

  const latestPassage =
    passages.length === 0
      ? null
      : [...passages].sort((a, b) => b.entryOrder - a.entryOrder)[0];

  return {
    total,
    analyzed: total - processing,
    processing,
    flagged,
    healthy,
    atRisk: total - healthy,
    averageScore: Number(averageScore.toFixed(1)),
    soundnessIndex,
    distribution,
    latestPassage,
  };
}

export function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDayStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Risk label for a 0–100 herd soundness value. */
export function soundnessLabel(score: number): string {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Fair';
  if (score >= 50) return 'Watch';
  return 'Critical';
}
