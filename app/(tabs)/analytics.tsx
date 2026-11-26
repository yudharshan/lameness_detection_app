import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowUpRight,
  BadgeCheck,
  Bone,
  CalendarClock,
  ChartSpline,
  CircleCheck,
  FileDown,
  Info,
  ListOrdered,
  Loader,
  Scale,
  Scissors,
  Sparkles,
  Stethoscope,
  Timer,
  type LucideIcon,
} from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  type ScrollViewInstance,
} from 'react-native';

import { MetricEvidenceCard } from '@/components/metric-evidence-card';
import { PoseInspector } from '@/components/pose-inspector';
import { ScoreDial } from '@/components/score-dial';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SectionHeading } from '@/components/ui/section-heading';
import { VelocityChart } from '@/components/velocity-chart';
import { COLORS } from '@/constants/theme';
import { cn } from '@/lib/cn';
import {
  formatClock,
  RISK_META,
  SCORE_HEX,
  SCORE_LABELS,
  STATUS_META,
} from '@/lib/herd';
import {
  buildDiagnosticSummary,
  buildRecommendation,
  getMetricDefinition,
  type MetricKey,
  type MetricStatus,
} from '@/lib/metrics';
import { useHerdStore } from '@/store/herdStore';
import type { LocomotionScore } from '@/types/cattle';

const PILL_WIDTH = 76;
const PILL_GAP = 8;

interface EvidenceCardSpec {
  key: MetricKey;
  letter: 'A' | 'B' | 'C' | 'D';
  title: string;
  subtitle: string;
  formula: string;
  normalLabel: string;
  flagLabel: string;
  statusLabels: Record<MetricStatus, string>;
  icon: LucideIcon;
}

const EVIDENCE_CARDS: EvidenceCardSpec[] = [
  {
    key: 'triJointFlexionAngle',
    letter: 'A',
    title: 'Tri-Joint Flexion Angle',
    subtitle: 'Carpus · tarsus · fetlock',
    formula: 'θ = arccos( (BA · BC) / (‖BA‖ ‖BC‖) )',
    normalLabel: '130–145°',
    flagLabel: 'Stiff <120°',
    statusLabels: { normal: 'Healthy', watch: 'Reduced', flag: 'Stiff' },
    icon: Bone,
  },
  {
    key: 'spineCurvatureRatio',
    letter: 'B',
    title: 'Dynamic Spine-to-Hip Curvature',
    subtitle: 'Topline chord / sacrum–hip',
    formula: 'R_arch = h_Spine / d_Sacrum–Hip',
    normalLabel: '<1.25',
    flagLabel: 'Arched >1.35',
    statusLabels: { normal: 'Normal', watch: 'Elevated', flag: 'Arched' },
    icon: ChartSpline,
  },
  {
    key: 'asymmetryIndex',
    letter: 'C',
    title: 'Hoof Trajectory Asymmetry',
    subtitle: 'Left vs right hoof AUC',
    formula: 'Asym = |AUC_Left − AUC_Right| / (AUC_Left + AUC_Right)',
    normalLabel: '<8%',
    flagLabel: 'Lame >15%',
    statusLabels: { normal: 'Symmetric', watch: 'Asymmetric', flag: 'Lame' },
    icon: Scale,
  },
  {
    key: 'limbPhaseShift',
    letter: 'D',
    title: 'Limb Phase-Shift Index',
    subtitle: 'Stance vs swing duration',
    formula: 't_stance / t_swing',
    normalLabel: '1.00–1.10×',
    flagLabel: 'Reluctant >1.25×',
    statusLabels: { normal: 'Normal', watch: 'Guarded', flag: 'Reluctant' },
    icon: Timer,
  },
];

const RECOMMENDATION_STYLES = {
  forest: {
    card: 'bg-forest-50 border-forest-200',
    icon: 'bg-forest-100',
    text: 'text-forest-800',
    hex: COLORS.forest[700],
  },
  amber: {
    card: 'bg-amber-50 border-amber-200',
    icon: 'bg-amber-100',
    text: 'text-amber-700',
    hex: COLORS.amber[600],
  },
  crimson: {
    card: 'bg-crimson-50 border-crimson-200',
    icon: 'bg-crimson-100',
    text: 'text-crimson-700',
    hex: COLORS.crimson[600],
  },
} as const;

const FEEDBACK_STYLES = {
  forest: {
    card: 'border-forest-200 bg-forest-50',
    text: 'text-forest-800',
    hex: COLORS.forest[700],
  },
  amber: {
    card: 'border-amber-200 bg-amber-50',
    text: 'text-amber-700',
    hex: COLORS.amber[600],
  },
  crimson: {
    card: 'border-crimson-200 bg-crimson-50',
    text: 'text-crimson-700',
    hex: COLORS.crimson[600],
  },
} as const;

interface CowActions {
  verified: boolean;
  scheduled: boolean;
  exported: boolean;
}

const EMPTY_ACTIONS: CowActions = {
  verified: false,
  scheduled: false,
  exported: false,
};

interface ActionFeedback {
  tone: 'forest' | 'amber' | 'crimson';
  text: string;
  passageId: string;
}

function pulse() {
  if (Platform.OS !== 'web') {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
      () => undefined,
    );
  }
}

interface WebScrollNode {
  scrollLeft: number;
}

/**
 * RNW exposes either the ScrollView instance or its scrollable DOM node,
 * depending on the React Native version. Handle both so the active passage
 * pill stays visible on every platform.
 */
function scrollSelectorTo(node: ScrollViewInstance | null, x: number) {
  if (!node) return;

  if (Platform.OS === 'web') {
    const webNode =
      (
        node as unknown as {
          getScrollableNode?: () => WebScrollNode | null;
        }
      ).getScrollableNode?.() ?? (node as unknown as WebScrollNode);

    if (webNode) {
      // RNW replaces the host node's native scrollTo with the RN signature,
      // so assign scrollLeft directly on web.
      webNode.scrollLeft = x;
      return;
    }
  }

  node.scrollTo({ x, animated: false });
}

export default function AnalyticsScreen() {
  const passages = useHerdStore((state) => state.passages);
  const selectedPassageId = useHerdStore((state) => state.selectedPassageId);
  const selectPassage = useHerdStore((state) => state.selectPassage);
  const selectorRef = useRef<ScrollViewInstance>(null);
  const [actions, setActions] = useState<Record<string, CowActions>>({});
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);

  const ordered = useMemo(
    () => [...passages].sort((a, b) => a.entryOrder - b.entryOrder),
    [passages],
  );

  const passage = useMemo(() => {
    if (passages.length === 0) return null;
    return (
      passages.find((item) => item.id === selectedPassageId) ??
      passages.find((item) => item.status === 'Flagged') ??
      ordered[ordered.length - 1]
    );
  }, [ordered, passages, selectedPassageId]);

  const recommendation = useMemo(
    () => (passage ? buildRecommendation(passage.riskLevel) : null),
    [passage],
  );

  useEffect(() => {
    if (!passage) return;
    const index = ordered.findIndex((item) => item.id === passage.id);
    if (index < 0) return;
    const timer = setTimeout(() => {
      scrollSelectorTo(
        selectorRef.current,
        Math.max(0, index * (PILL_WIDTH + PILL_GAP) - 8),
      );
    }, 120);
    return () => clearTimeout(timer);
  }, [ordered, passage]);

  if (!passage || !recommendation) {
    return (
      <View className="flex-1 bg-canvas">
        <ScreenHeader
          eyebrow="Explainability"
          title="Biomechanical Detail"
        />
        <View className="p-5">
          <EmptyState
            icon={ListOrdered}
            title="No passage selected"
            body="Capture a walk-through or open a passage from the sequential stream to inspect its biomechanics."
          />
        </View>
      </View>
    );
  }

  const risk = RISK_META[passage.riskLevel];
  const status = STATUS_META[passage.status];
  const summary = buildDiagnosticSummary(passage);
  const recommendationStyle = RECOMMENDATION_STYLES[recommendation.tone];
  const retention = passage.metrics.velocityLog.filter(
    (sample) => !sample.purged,
  );
  const purged = passage.metrics.velocityLog.length - retention.length;
  const currentActions = actions[passage.id] ?? EMPTY_ACTIONS;
  const exportFile = `${passage.tagId}-diagnostic-${passage.passageTime.slice(0, 10)}.pdf`;

  const setCowAction = (patch: Partial<CowActions>) => {
    setActions((current) => ({
      ...current,
      [passage.id]: {
        ...(current[passage.id] ?? EMPTY_ACTIONS),
        ...patch,
      },
    }));
  };

  const handleVerify = () => {
    setCowAction({ verified: true });
    setFeedback({
      tone: 'forest',
      text: `${passage.tagId} marked verified by the herd vet.`,
      passageId: passage.id,
    });
    pulse();
  };

  const handleSchedule = () => {
    setCowAction({ scheduled: true });
    setFeedback({
      tone: 'amber',
      text: `Hoof trimming and isolation task raised for ${passage.tagId} · 48h window.`,
      passageId: passage.id,
    });
    pulse();
  };

  const handleExport = () => {
    setCowAction({ exported: true });
    setFeedback({
      tone: 'forest',
      text: `${exportFile} prepared · 4 metrics and ${passage.metrics.velocityLog.length} pose frames.`,
      passageId: passage.id,
    });
    pulse();
  };

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader
        eyebrow="Explainability"
        title="Biomechanical Detail"
        right={
          <View className="mt-0.5 items-center rounded-2xl border border-line bg-surface px-3 py-2">
            <Text className="text-[8px] font-bold tracking-[1.1px] text-ink-faint">
              MODEL
            </Text>
            <Text className="text-[11px] font-bold leading-5 text-ink">
              v2.4
            </Text>
          </View>
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 44 }}
      >
        {passage.status === 'Processing' ? (
          <View className="mb-3 flex-row items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
            <Loader size={14} color={COLORS.amber[600]} strokeWidth={2.2} />
            <Text className="flex-1 text-[10.5px] leading-4 text-amber-700">
              Provisional result — pose estimation is still refining this
              passage. Values may shift slightly.
            </Text>
          </View>
        ) : null}

        <View className="mb-2 flex-row items-center justify-between">
          <Text className="text-[9px] font-bold uppercase tracking-[1.3px] text-ink-faint">
            Passage under review
          </Text>
          <Text className="text-[9.5px] text-ink-faint">
            {ordered.length} in sequence
          </Text>
        </View>

        <ScrollView
          ref={selectorRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: PILL_GAP, paddingRight: 4 }}
        >
          {ordered.map((item) => {
            const active = item.id === passage.id;
            const itemRisk = RISK_META[item.riskLevel];
            const isProcessing = item.status === 'Processing';
            return (
              <Pressable
                key={item.id}
                onPress={() => selectPassage(item.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Inspect ${item.tagId}, score ${item.locomotionScore}, ${item.status}`}
                className={cn(
                  'rounded-2xl border px-2.5 py-2',
                  active
                    ? 'border-forest-900 bg-forest-900'
                    : 'border-line bg-surface',
                )}
                style={({ pressed }) => ({
                  width: PILL_WIDTH,
                  opacity: pressed ? 0.78 : 1,
                })}
              >
                <View className="flex-row items-center justify-between">
                  <Text
                    className={cn(
                      'text-[12px] font-bold',
                      active ? 'text-white' : 'text-ink',
                    )}
                  >
                    {item.tagId}
                  </Text>
                  <View
                    className={cn(
                      'h-5 min-w-[20px] items-center justify-center rounded-md border px-1',
                      active
                        ? 'border-white/20 bg-white/10'
                        : itemRisk.badge,
                    )}
                  >
                    <Text
                      className={cn(
                        'text-[9px] font-bold',
                        active ? 'text-white' : itemRisk.text,
                      )}
                    >
                      {item.locomotionScore}
                    </Text>
                  </View>
                </View>
                <View className="mt-1.5 flex-row items-center gap-1">
                  <View className={cn('h-1.5 w-1.5 rounded-full', itemRisk.dot)} />
                  <Text
                    numberOfLines={1}
                    className={cn(
                      'flex-1 text-[7.5px] font-semibold uppercase tracking-[0.3px]',
                      active ? 'text-forest-300' : 'text-ink-faint',
                    )}
                  >
                    {isProcessing ? 'Processing' : item.status}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        <LinearGradient
          colors={['#04231A', '#06301F', '#0F5136']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 28,
            padding: 20,
            marginTop: 16,
            overflow: 'hidden',
          }}
        >
          <View className="absolute -right-10 -top-14 h-40 w-40 rounded-full border border-white/10" />

          <View className="flex-row items-center gap-4">
            <View className="items-center">
              <ScoreDial score={passage.locomotionScore} />
              <Text className="mt-1.5 text-[8px] font-bold uppercase tracking-[1.3px] text-forest-300">
                Gait score
              </Text>
            </View>

            <View className="flex-1">
              <View className="flex-row items-center gap-1.5">
                <View
                  className={cn('rounded-lg border px-1.5 py-0.5', risk.badge)}
                >
                  <Text className={cn('text-[10px] font-bold', risk.text)}>
                    {passage.tagId}
                  </Text>
                </View>
                <Text className="text-[9px] text-forest-300">
                  #{passage.entryOrder} · {formatClock(passage.passageTime)}
                </Text>
              </View>

              <Text className="mt-2 text-[19px] font-bold leading-6 tracking-[-0.4px] text-white">
                {SCORE_LABELS[passage.locomotionScore]}
              </Text>
              <Text className="mt-1 text-[10.5px] leading-4 text-forest-300">
                {passage.status === 'Processing'
                  ? 'Provisional gait read'
                  : 'Finalised gait read'}{' '}
                from a {passage.clipDurationSec.toFixed(1)}s monocular clip.
              </Text>

              <View className="mt-3 flex-row flex-wrap gap-1.5">
                <View
                  className={cn('rounded-full border px-2 py-0.5', risk.badge)}
                >
                  <Text className={cn('text-[9px] font-bold', risk.text)}>
                    {passage.riskLevel}
                  </Text>
                </View>
                <View
                  className={cn('rounded-full border px-2 py-0.5', status.badge)}
                >
                  <Text className={cn('text-[9px] font-bold', status.text)}>
                    {passage.status}
                  </Text>
                </View>
                <View className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5">
                  <Text className="text-[9px] font-semibold text-forest-200">
                    {Math.round(passage.detectionConfidence * 100)}% confidence
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View className="mt-4 flex-row items-center justify-between border-t border-white/10 pt-3">
            <Text className="text-[8.5px] text-forest-300">
              1 Sound → 5 Critically lame
            </Text>
            <View className="flex-row gap-1">
              {[1, 2, 3, 4, 5].map((step) => (
                <View
                  key={step}
                  style={{
                    height: 5,
                    width: 15,
                    borderRadius: 3,
                    backgroundColor:
                      step <= passage.locomotionScore
                        ? SCORE_HEX[step as LocomotionScore]
                        : '#27473A',
                  }}
                />
              ))}
            </View>
          </View>
        </LinearGradient>

        <View className="mt-3 rounded-3xl border border-line bg-canvas p-4">
          <View className="flex-row gap-2.5">
            <View className="mt-0.5 h-6 w-6 items-center justify-center rounded-lg bg-surface">
              <Info size={13} color={COLORS.inkMuted} strokeWidth={2.2} />
            </View>
            <Text className="flex-1 text-[11px] leading-[17px] text-ink-muted">
              {passage.analysisNote ??
                'Pose-derived gait read from the monocular trigger clip.'}
            </Text>
          </View>
        </View>

        <LinearGradient
          colors={['#052E1F', '#04231A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 24,
            padding: 16,
            marginTop: 16,
            overflow: 'hidden',
          }}
        >
          <View className="absolute -right-8 -top-10 h-28 w-28 rounded-full border border-white/10" />

          <View className="flex-row items-start gap-2.5">
            <View className="h-8 w-8 items-center justify-center rounded-xl border border-amber-300/30 bg-amber-400/15">
              <Sparkles size={15} color={COLORS.amber[300]} strokeWidth={2.1} />
            </View>
            <View className="flex-1">
              <View className="flex-row items-center justify-between gap-2">
                <Text className="text-[8px] font-bold uppercase tracking-[1.4px] text-forest-300">
                  AI diagnostic summary
                </Text>
                <View className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5">
                  <Text className="text-[8.5px] font-bold text-white">
                    {passage.locomotionScore} / 5
                  </Text>
                </View>
              </View>
              <Text className="mt-1 text-[15px] font-bold leading-5 text-white">
                {summary.headline}
              </Text>
            </View>
          </View>

          <Text className="mt-3 text-[11.5px] leading-[18px] text-forest-200">
            {summary.body}
          </Text>

          <View className="mt-3 flex-row flex-wrap gap-1.5">
            {summary.drivers.map((driver, index) => (
              <View
                key={`${driver}-${index}`}
                className="rounded-full border border-white/12 bg-white/8 px-2 py-1"
              >
                <Text className="text-[8.5px] font-semibold text-forest-200">
                  {driver}
                </Text>
              </View>
            ))}
          </View>

          <View className="mt-3 flex-row items-center justify-between border-t border-white/10 pt-2.5">
            <Text className="text-[8px] text-forest-400">
              Built from 4 pose metrics · {retention.length} frame trace
            </Text>
            <Text className="text-[8px] font-semibold text-forest-300">
              Model v2.4
            </Text>
          </View>
        </LinearGradient>

        <View className="mt-6">
          <SectionHeading
            title="Pose & keypoint inspector"
            meta="Quadratic spine fit · live joint readouts"
            right={
              <View className="rounded-full border border-line bg-canvas px-2 py-1">
                <Text className="text-[9px] font-semibold text-ink-muted">
                  2D POSE
                </Text>
              </View>
            }
          />
          <PoseInspector passage={passage} />
        </View>

        <View className="mt-6">
          <SectionHeading
            title="Biomechanical evidence"
            meta="Formula · normal vs measured · status"
          />
          <View className="gap-2.5">
            {EVIDENCE_CARDS.map((card) => (
              <MetricEvidenceCard
                key={card.key}
                letter={card.letter}
                title={card.title}
                subtitle={card.subtitle}
                formula={card.formula}
                normalLabel={card.normalLabel}
                flagLabel={card.flagLabel}
                statusLabels={card.statusLabels}
                definition={getMetricDefinition(card.key)}
                value={passage.metrics[card.key]}
                icon={card.icon}
              />
            ))}
          </View>
        </View>

        <Card className="mt-3">
          <SectionHeading
            title="Velocity trace"
            meta={`${retention.length} retained · ${purged} purged`}
            right={
              <View className="rounded-full border border-line bg-canvas px-2 py-1">
                <Text className="text-[9px] font-semibold text-ink-muted">
                  m/s · 20 frames
                </Text>
              </View>
            }
          />
          <VelocityChart samples={passage.metrics.velocityLog} />
          <View className="mt-3 flex-row gap-2 rounded-2xl bg-canvas p-3">
            <Info
              size={13}
              color={COLORS.inkFaint}
              strokeWidth={2.1}
              style={{ marginTop: 1 }}
            />
            <Text className="flex-1 text-[10px] leading-[15px] text-ink-muted">
              Purged frames are blurred or occluded samples. They remain in the
              audit log but are excluded from the mean velocity and the
              locomotion score.
            </Text>
          </View>
        </Card>

        <View className="mt-6">
          <SectionHeading
            title="Decision support"
            meta="Caretaker / vet actions"
          />
          <Card padded={false} className="overflow-hidden">
            <View className={cn('border-b p-4', recommendationStyle.card)}>
              <View className="flex-row items-center gap-2.5">
                <View
                  className={cn(
                    'h-9 w-9 items-center justify-center rounded-xl',
                    recommendationStyle.icon,
                  )}
                >
                  <Stethoscope
                    size={17}
                    color={recommendationStyle.hex}
                    strokeWidth={2.1}
                  />
                </View>
                <Text
                  className={cn(
                    'flex-1 text-[13px] font-bold',
                    recommendationStyle.text,
                  )}
                >
                  {recommendation.title}
                </Text>
              </View>
              <Text className="mt-2.5 text-[11.5px] leading-[17px] text-ink-muted">
                {recommendation.body}
              </Text>
              <View className="mt-3 flex-row items-center justify-between border-t border-black/5 pt-2.5">
                <Text
                  className={cn(
                    'text-[10.5px] font-semibold',
                    recommendationStyle.text,
                  )}
                >
                  {recommendation.action}
                </Text>
                <ArrowUpRight
                  size={14}
                  color={recommendationStyle.hex}
                  strokeWidth={2.2}
                />
              </View>
            </View>

            <View className="p-4">
              {currentActions.verified ||
              currentActions.scheduled ||
              currentActions.exported ? (
                <View className="mb-3 flex-row flex-wrap gap-1.5">
                  {currentActions.verified ? (
                    <View className="flex-row items-center gap-1 rounded-full border border-forest-200 bg-forest-50 px-2 py-1">
                      <BadgeCheck
                        size={10}
                        color={COLORS.forest[700]}
                        strokeWidth={2.2}
                      />
                      <Text className="text-[8.5px] font-bold text-forest-700">
                        Vet verified
                      </Text>
                    </View>
                  ) : null}
                  {currentActions.scheduled ? (
                    <View className="flex-row items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1">
                      <CalendarClock
                        size={10}
                        color={COLORS.amber[600]}
                        strokeWidth={2.2}
                      />
                      <Text className="text-[8.5px] font-bold text-amber-700">
                        Isolation scheduled
                      </Text>
                    </View>
                  ) : null}
                  {currentActions.exported ? (
                    <View className="flex-row items-center gap-1 rounded-full border border-forest-200 bg-forest-50 px-2 py-1">
                      <FileDown
                        size={10}
                        color={COLORS.forest[700]}
                        strokeWidth={2.2}
                      />
                      <Text className="text-[8.5px] font-bold text-forest-700">
                        PDF prepared
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              <View className="gap-2">
                <Button
                  label={
                    currentActions.verified
                      ? 'Verified by Vet'
                      : 'Mark Verified by Vet'
                  }
                  icon={BadgeCheck}
                  variant="secondary"
                  disabled={currentActions.verified}
                  onPress={handleVerify}
                />
                <Button
                  label={
                    currentActions.scheduled
                      ? 'Isolation Scheduled'
                      : 'Schedule Hoof Trimming / Isolation'
                  }
                  icon={Scissors}
                  variant="amber"
                  disabled={currentActions.scheduled}
                  onPress={handleSchedule}
                />
                <Button
                  label="Export Diagnostic PDF Summary"
                  icon={FileDown}
                  variant="primary"
                  onPress={handleExport}
                />
              </View>

              {feedback && feedback.passageId === passage.id ? (
                <View
                  className={cn(
                    'mt-3 flex-row items-start gap-2 rounded-2xl border px-3 py-2.5',
                    FEEDBACK_STYLES[feedback.tone].card,
                  )}
                >
                  <CircleCheck
                    size={13}
                    color={FEEDBACK_STYLES[feedback.tone].hex}
                    strokeWidth={2.2}
                    style={{ marginTop: 1 }}
                  />
                  <Text
                    className={cn(
                      'flex-1 text-[10px] leading-[15px]',
                      FEEDBACK_STYLES[feedback.tone].text,
                    )}
                  >
                    {feedback.text}
                  </Text>
                </View>
              ) : null}

              {currentActions.exported ? (
                <View className="mt-2 flex-row items-center gap-1.5">
                  <FileDown
                    size={10}
                    color={COLORS.inkFaint}
                    strokeWidth={2}
                  />
                  <Text className="flex-1 text-[8.5px] text-ink-faint">
                    Last export · {exportFile}
                  </Text>
                </View>
              ) : null}
            </View>
          </Card>
        </View>

        <View className="mt-5 rounded-2xl border border-line bg-white/50 p-3.5">
          <Text className="text-[9px] font-bold uppercase tracking-[1.2px] text-ink-faint">
            Measurement notes
          </Text>
          <Text className="mt-1.5 text-[9.5px] leading-4 text-ink-faint">
            Tri-joint flexion is measured at the carpus, tarsus and fetlock.
            R_arch compares topline chord height to the sacrum–hip distance.
            AUC asymmetry integrates left and right hoof lift across complete
            stride cycles. Phase shift is the stance/swing ratio for the loaded
            limb.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
