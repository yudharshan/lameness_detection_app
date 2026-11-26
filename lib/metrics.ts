import type {
  BiomechanicalMetrics,
  CattlePassage,
  LocomotionScore,
  RiskLevel,
} from '@/types/cattle';

export type MetricKey = Exclude<keyof BiomechanicalMetrics, 'velocityLog'>;

export type MetricStatus = 'normal' | 'watch' | 'flag';

export interface MetricDefinition {
  key: MetricKey;
  label: string;
  shortLabel: string;
  unit: string;
  decimals: number;
  /** Axis bounds for the range visual. */
  domain: [number, number];
  /** Sound reference band. */
  normal: [number, number];
  baseline: string;
  getStatus: (value: number) => MetricStatus;
  interpret: (value: number) => string;
}

export const STATUS_META: Record<
  MetricStatus,
  { label: string; text: string; badge: string; hex: string; marker: string }
> = {
  normal: {
    label: 'Within range',
    text: 'text-forest-700',
    badge: 'bg-forest-50 border-forest-200',
    hex: '#146B45',
    marker: 'bg-forest-600',
  },
  watch: {
    label: 'Watch',
    text: 'text-amber-700',
    badge: 'bg-amber-50 border-amber-200',
    hex: '#D97706',
    marker: 'bg-amber-500',
  },
  flag: {
    label: 'Outside range',
    text: 'text-crimson-700',
    badge: 'bg-crimson-50 border-crimson-200',
    hex: '#BE123C',
    marker: 'bg-crimson-600',
  },
};

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    key: 'triJointFlexionAngle',
    label: 'Tri-joint flexion',
    shortLabel: 'Flexion',
    unit: '°',
    decimals: 0,
    domain: [105, 150],
    normal: [130, 145],
    baseline: 'Healthy 130–145°',
    getStatus: (v) => (v >= 130 ? 'normal' : v >= 120 ? 'watch' : 'flag'),
    interpret: (v) =>
      v >= 130
        ? 'Full carpal, tarsal and fetlock extension through the swing phase.'
        : v >= 120
          ? `Flexion is ${Math.round(130 - v)}° below the healthy floor — the limb is guarding through swing.`
          : 'Stiff / reduced flexion; the carpus, tarsus and fetlock cannot fully extend.',
  },
  {
    key: 'spineCurvatureRatio',
    label: 'Spine-to-hip curvature',
    shortLabel: 'R_arch',
    unit: '',
    decimals: 2,
    domain: [0.95, 1.8],
    normal: [0.98, 1.25],
    baseline: 'Normal <1.25',
    getStatus: (v) => (v <= 1.25 ? 'normal' : v <= 1.35 ? 'watch' : 'flag'),
    interpret: (v) =>
      v <= 1.25
        ? 'Topline stays level; the spine-to-hip arch ratio is within the normal band.'
        : v <= 1.35
          ? 'A mild spinal arch is developing through mid-stance.'
          : 'Arched posture; spinal compensation is likely easing the loaded limb.',
  },
  {
    key: 'asymmetryIndex',
    label: 'Hoof trajectory asymmetry',
    shortLabel: 'AUC asym',
    unit: '%',
    decimals: 1,
    domain: [0, 40],
    normal: [0, 8],
    baseline: 'Symmetric <8%',
    getStatus: (v) => (v <= 8 ? 'normal' : v <= 15 ? 'watch' : 'flag'),
    interpret: (v) =>
      v <= 8
        ? 'Left and right hoof AUC are balanced across the stride.'
        : v <= 15
          ? 'Hoof trajectory is drifting away from symmetry; recheck the next pass.'
          : 'Lame / asymmetric hoof trajectory — the dominant lameness signal in this passage.',
  },
  {
    key: 'limbPhaseShift',
    label: 'Limb phase shift',
    shortLabel: 'Phase',
    unit: '×',
    decimals: 2,
    domain: [0.85, 1.65],
    normal: [0.95, 1.1],
    baseline: 'Normal 1.00–1.10×',
    getStatus: (v) =>
      v >= 0.95 && v <= 1.1 ? 'normal' : v > 1.25 || v < 0.88 ? 'flag' : 'watch',
    interpret: (v) =>
      v >= 0.95 && v <= 1.1
        ? 'Stance and swing are evenly timed across the paired limbs.'
        : v > 1.25
          ? 'Reluctant weight-bearing: stance is prolonged relative to swing.'
          : v > 1.1
            ? 'Stance timing is lengthening; watch for pain avoidance.'
            : 'Swing is unusually long relative to stance; check for a compensatory gait.',
  },
];

export function getMetricValue(
  metrics: BiomechanicalMetrics,
  key: MetricKey,
): number {
  return metrics[key];
}

const METRIC_MAP = METRIC_DEFINITIONS.reduce(
  (map, definition) => {
    map[definition.key] = definition;
    return map;
  },
  {} as Record<MetricKey, MetricDefinition>,
);

export function getMetricDefinition(key: MetricKey): MetricDefinition {
  return METRIC_MAP[key];
}

export interface DiagnosticSummary {
  headline: string;
  body: string;
  drivers: string[];
  limb: string | null;
  tone: 'forest' | 'amber' | 'crimson';
}

const SUMMARY_HEADLINE: Record<LocomotionScore, string> = {
  1: 'No lameness signal',
  2: 'Early gait deviation',
  3: 'Moderate lameness pattern',
  4: 'Severe lameness pattern',
  5: 'Critical lameness pattern',
};

function extractLimb(
  note: string | undefined,
  asymmetry: number,
  entryOrder: number,
): string | null {
  if (note) {
    const match = note.match(/(left|right)[\s-]*(fore|hind|front|rear)?/i);
    if (match) {
      const side = match[1].toLowerCase();
      const rawSegment = (match[2] ?? '').toLowerCase();
      let segment = rawSegment;
      if (!segment) {
        if (/rear|hind|hoof|hock/i.test(note)) segment = 'hind';
        else if (/fore|front|knee/i.test(note)) segment = 'fore';
      } else if (segment === 'front') {
        segment = 'fore';
      } else if (segment === 'rear') {
        segment = 'hind';
      }
      return `${side}${segment ? ` ${segment}` : ''} limb`;
    }
  }

  if (asymmetry > 12) {
    return entryOrder % 2 === 0 ? 'right hind limb' : 'left hind limb';
  }
  return null;
}

/**
 * Plain-language explanation of a locomotion score, built from the four
 * biomechanical indicators. Keeps the score, evidence and limb together so
 * the explain screen can present a single coherent narrative.
 */
export function buildDiagnosticSummary(
  passage: CattlePassage,
): DiagnosticSummary {
  const { metrics, locomotionScore: score, riskLevel, analysisNote } = passage;
  const flexion = getMetricDefinition('triJointFlexionAngle');
  const curvature = getMetricDefinition('spineCurvatureRatio');
  const asymmetry = getMetricDefinition('asymmetryIndex');
  const phase = getMetricDefinition('limbPhaseShift');

  const flexValue = `${metrics.triJointFlexionAngle}°`;
  const archValue = metrics.spineCurvatureRatio.toFixed(2);
  const asymValue = `${metrics.asymmetryIndex.toFixed(1)}%`;
  const phaseValue = `${metrics.limbPhaseShift.toFixed(2)}×`;

  const flexStatus = flexion.getStatus(metrics.triJointFlexionAngle);
  const archStatus = curvature.getStatus(metrics.spineCurvatureRatio);
  const asymStatus = asymmetry.getStatus(metrics.asymmetryIndex);
  const phaseStatus = phase.getStatus(metrics.limbPhaseShift);

  const limb = extractLimb(
    analysisNote,
    metrics.asymmetryIndex,
    passage.entryOrder,
  );
  const limbText = limb ?? 'affected limb';

  const drivers: string[] = [];
  if (asymStatus !== 'normal') drivers.push(`AUC ${asymValue}`);
  if (archStatus !== 'normal') drivers.push(`R_arch ${archValue}`);
  if (flexStatus !== 'normal') drivers.push(`Flexion ${flexValue}`);
  if (phaseStatus !== 'normal') drivers.push(`Phase ${phaseValue}`);
  if (drivers.length === 0) {
    drivers.push(
      `Flexion ${flexValue}`,
      `R_arch ${archValue}`,
      `AUC ${asymValue}`,
    );
  }

  let body: string;
  switch (score) {
    case 1:
      body = `Clean gait read. Tri-joint flexion is ${flexValue} (healthy 130–145°), R_arch is ${archValue} (normal <1.25) and hoof AUC asymmetry is ${asymValue} (symmetric <8%). The ${phaseValue} stance/swing ratio confirms even weight-bearing with no guarding.`;
      break;
    case 2:
      body = `Mild risk. The ${asymValue} hoof AUC asymmetry is above the 8% symmetric ceiling${archStatus !== 'normal' ? ` and R_arch has risen to ${archValue}` : ''}. Flexion is ${flexValue}${flexStatus === 'normal' ? ' and remains in the healthy band' : ', below the 130–145° healthy band'}. The ${limbText} is beginning to off-load; recheck the next passage.`;
      break;
    case 3:
      body = `Moderate lameness. Flexion is reduced to ${flexValue}, R_arch is ${archValue}${archStatus === 'flag' ? ' (above the 1.35 arch threshold)' : ''}, and hoof AUC asymmetry is ${asymValue}. A ${phaseValue} stance/swing ratio points to weight-bearing reluctance on the ${limbText}.`;
      break;
    case 4:
      body = `Flagged for ${asymValue} hoof AUC asymmetry and an elevated back arch (R_arch = ${archValue}). Flexion is reduced to ${flexValue} and stance/swing is ${phaseValue}, indicating weight-bearing reluctance on the ${limbText}.`;
      break;
    default:
      body = `Critical gait deviation. All four indicators are outside the sound band: ${asymValue} AUC asymmetry, R_arch ${archValue}, flexion ${flexValue} and a ${phaseValue} stance/swing ratio. The ${limbText} is severely off-loaded; urgent veterinary review is required.`;
      break;
  }

  const tone: DiagnosticSummary['tone'] =
    riskLevel === 'Healthy'
      ? 'forest'
      : riskLevel === 'Mild Risk' || riskLevel === 'Moderate Lame'
        ? 'amber'
        : 'crimson';

  return {
    headline: SUMMARY_HEADLINE[score],
    body,
    drivers: drivers.slice(0, 4),
    limb,
    tone,
  };
}

export interface Insight {
  id: string;
  tone: 'positive' | 'watch' | 'alert';
  title: string;
  detail: string;
}

const TONE_META = {
  positive: {
    title: 'text-forest-700',
    border: 'border-forest-200',
    badge: 'bg-forest-100',
  },
  watch: {
    title: 'text-amber-700',
    border: 'border-amber-200',
    badge: 'bg-amber-100',
  },
  alert: {
    title: 'text-crimson-700',
    border: 'border-crimson-200',
    badge: 'bg-crimson-100',
  },
} as const;

export function insightTone(tone: Insight['tone']) {
  return TONE_META[tone];
}

/** Plain-language evidence trail used by the explainability screen. */
export function buildInsights(passage: CattlePassage): Insight[] {
  const { metrics } = passage;
  const insights: Insight[] = [];

  const asymmetry = METRIC_DEFINITIONS.find((m) => m.key === 'asymmetryIndex')!;
  const flexion = METRIC_DEFINITIONS.find((m) => m.key === 'triJointFlexionAngle')!;
  const curvature = METRIC_DEFINITIONS.find((m) => m.key === 'spineCurvatureRatio')!;
  const phase = METRIC_DEFINITIONS.find((m) => m.key === 'limbPhaseShift')!;

  const asymmetryStatus = asymmetry.getStatus(metrics.asymmetryIndex);
  insights.push({
    id: 'asymmetry',
    tone:
      asymmetryStatus === 'flag'
        ? 'alert'
        : asymmetryStatus === 'watch'
          ? 'watch'
          : 'positive',
    title:
      asymmetryStatus === 'flag'
        ? 'Asymmetry is the strongest signal'
        : asymmetryStatus === 'watch'
          ? 'Asymmetry is trending upward'
          : 'Symmetric limb loading',
    detail:
      asymmetryStatus === 'normal'
        ? `${metrics.asymmetryIndex.toFixed(1)}% left/right stance difference is inside the 8% sound ceiling.`
        : `${metrics.asymmetryIndex.toFixed(1)}% left/right stance difference — ${(metrics.asymmetryIndex - 8).toFixed(1)} pts above the 8% sound ceiling.`,
  });

  const flexionStatus = flexion.getStatus(metrics.triJointFlexionAngle);
  insights.push({
    id: 'flexion',
    tone:
      flexionStatus === 'flag'
        ? 'alert'
        : flexionStatus === 'watch'
          ? 'watch'
          : 'positive',
    title:
      flexionStatus === 'normal'
        ? 'Joint flexion is unrestricted'
        : 'Reduced tri-joint flexion',
    detail:
      flexionStatus === 'normal'
        ? `${metrics.triJointFlexionAngle}° at the carpus, tarsus and fetlock — above the 140° sound floor.`
        : `${metrics.triJointFlexionAngle}° peak flexion, ${Math.round(140 - metrics.triJointFlexionAngle)}° below the 140° sound floor.`,
  });

  const curvatureStatus = curvature.getStatus(metrics.spineCurvatureRatio);
  insights.push({
    id: 'spine',
    tone:
      curvatureStatus === 'flag'
        ? 'alert'
        : curvatureStatus === 'watch'
          ? 'watch'
          : 'positive',
    title:
      curvatureStatus === 'normal'
        ? 'Level topline through stance'
        : 'Spinal arch detected',
    detail:
      curvatureStatus === 'normal'
        ? `R_arch ${metrics.spineCurvatureRatio.toFixed(2)} — the spine stays flat through the stance phase.`
        : `R_arch ${metrics.spineCurvatureRatio.toFixed(2)} versus the 1.12 ceiling, indicating a compensating arch.`,
  });

  const retained = metrics.velocityLog.filter((sample) => !sample.purged).length;
  const purged = metrics.velocityLog.length - retained;
  const meanVelocity =
    retained === 0
      ? 0
      : metrics.velocityLog
          .filter((sample) => !sample.purged)
          .reduce((sum, sample) => sum + sample.v, 0) / retained;

  insights.push({
    id: 'velocity',
    tone: phase.getStatus(metrics.limbPhaseShift) === 'normal' ? 'positive' : 'watch',
    title: 'Stride timing and velocity',
    detail: `${meanVelocity.toFixed(2)} m/s mean velocity with a ${metrics.limbPhaseShift.toFixed(2)}× stance/swing ratio. ${retained}/${metrics.velocityLog.length} frames retained${purged > 0 ? ` (${purged} purged for blur/occlusion)` : ''}.`,
  });

  return insights;
}

interface Recommendation {
  title: string;
  body: string;
  action: string;
  tone: 'forest' | 'amber' | 'crimson';
}

export function buildRecommendation(risk: RiskLevel): Recommendation {
  switch (risk) {
    case 'Healthy':
      return {
        title: 'No intervention required',
        body: 'Gait is within the sound band. Keep the weekly automated screening cadence and review the next passage for drift.',
        action: 'Continue routine monitoring',
        tone: 'forest',
      };
    case 'Mild Risk':
      return {
        title: 'Recheck on the next passage',
        body: 'Early gait deviation without a severe asymmetry signal. Inspect the hooves if the score stays at 2 or above for two consecutive passes.',
        action: 'Schedule 24-hour recheck',
        tone: 'amber',
      };
    case 'Moderate Lame':
      return {
        title: 'Book a lameness exam',
        body: 'A moderate load shift and reduced joint flexion are present. Arrange a hoof and limb exam within 48 hours and keep the cow under observation.',
        action: 'Schedule exam · 48h',
        tone: 'amber',
      };
    case 'Severe Lame':
      return {
        title: 'Flag for veterinary review',
        body: 'Asymmetry and spinal arch both exceed severe thresholds. Isolate for hoof inspection and follow the herd vet protocol within 24 hours.',
        action: 'Raise vet task · 24h',
        tone: 'crimson',
      };
    case 'Critically Lame':
      return {
        title: 'Urgent veterinary review',
        body: 'Multiple indicators are past the critical threshold. Restrict movement, provide a soft standing surface and contact the herd vet today.',
        action: 'Raise urgent vet task',
        tone: 'crimson',
      };
  }
}
