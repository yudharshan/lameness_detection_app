import { ChevronRight } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { RiskBadge } from '@/components/ui/risk-badge';
import { ScorePips } from '@/components/ui/score-pips';
import { StatusBadge } from '@/components/ui/status-badge';
import { COLORS } from '@/constants/theme';
import { cn } from '@/lib/cn';
import { formatClock, RISK_META, SCORE_LABELS } from '@/lib/herd';
import { getMetricDefinition } from '@/lib/metrics';
import type { CattlePassage } from '@/types/cattle';

interface PassageCardProps {
  passage: CattlePassage;
  onPress: () => void;
  isLast?: boolean;
  isSelected?: boolean;
}

interface MiniMetricProps {
  label: string;
  value: string;
  tone: 'normal' | 'watch' | 'flag';
  last?: boolean;
}

function MiniMetric({ label, value, tone, last }: MiniMetricProps) {
  const tones = {
    normal: { text: 'text-forest-700', dot: 'bg-forest-600' },
    watch: { text: 'text-amber-700', dot: 'bg-amber-500' },
    flag: { text: 'text-crimson-700', dot: 'bg-crimson-600' },
  }[tone];

  return (
    <View className={cn('flex-1', !last && 'border-r border-line pr-2')}>
      <Text className="text-[8.5px] font-bold uppercase tracking-[0.9px] text-ink-faint">
        {label}
      </Text>
      <View className="mt-0.5 flex-row items-center gap-1">
        <View
          className={tones.dot}
          style={{ width: 4, height: 4, borderRadius: 2 }}
        />
        <Text className={cn('text-[12px] font-bold', tones.text)}>{value}</Text>
      </View>
    </View>
  );
}

/** Full timeline card used in the sequential passage stream. */
export function PassageCard({
  passage,
  onPress,
  isLast = false,
  isSelected = false,
}: PassageCardProps) {
  const risk = RISK_META[passage.riskLevel];
  const flexion = getMetricDefinition('triJointFlexionAngle');
  const asymmetry = getMetricDefinition('asymmetryIndex');
  const curvature = getMetricDefinition('spineCurvatureRatio');

  const { metrics } = passage;

  return (
    <View className="flex-row gap-3">
      <View className="w-8 items-center">
        <View
          className={cn(
            'h-8 w-8 items-center justify-center rounded-full border',
            isSelected
              ? 'border-forest-900 bg-forest-900'
              : 'border-line bg-surface',
          )}
        >
          <Text
            className={cn(
              'text-[11px] font-bold',
              isSelected ? 'text-white' : 'text-ink-muted',
            )}
          >
            {passage.entryOrder}
          </Text>
        </View>
        {!isLast ? (
          <View className="mt-1.5 w-px flex-1 bg-line" />
        ) : (
          <View className="mt-1.5 w-px flex-1 bg-transparent" />
        )}
      </View>

      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Passage ${passage.tagId}, locomotion score ${passage.locomotionScore}, ${passage.riskLevel}. Open explainability detail.`}
        className={cn(
          'mb-3 flex-1 rounded-3xl border bg-surface p-4',
          isSelected ? 'border-forest-700' : 'border-line',
        )}
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
      >
        <View className="flex-row items-center justify-between gap-2">
          <View className="flex-row items-center gap-2">
            <View
              className={cn(
                'rounded-lg border px-1.5 py-0.5',
                risk.badge,
              )}
            >
              <Text className={cn('text-[11px] font-bold', risk.text)}>
                {passage.tagId}
              </Text>
            </View>
            <Text className="text-[10.5px] text-ink-faint">
              {formatClock(passage.passageTime)}
            </Text>
          </View>
          <StatusBadge status={passage.status} />
        </View>

        <View className="mt-3 flex-row items-center justify-between gap-2">
          <View className="flex-row items-center gap-2.5">
            <ScorePips score={passage.locomotionScore} />
            <Text className="text-[11px] font-medium text-ink-muted">
              {SCORE_LABELS[passage.locomotionScore]}
            </Text>
          </View>
          <RiskBadge risk={passage.riskLevel} compact />
        </View>

        <View className="mt-3 flex-row rounded-2xl bg-canvas px-3 py-2.5">
          <MiniMetric
            label="Asym"
            value={`${metrics.asymmetryIndex.toFixed(1)}%`}
            tone={asymmetry.getStatus(metrics.asymmetryIndex)}
          />
          <MiniMetric
            label="Flexion"
            value={`${metrics.triJointFlexionAngle}°`}
            tone={flexion.getStatus(metrics.triJointFlexionAngle)}
          />
          <MiniMetric
            label="R_arch"
            value={metrics.spineCurvatureRatio.toFixed(2)}
            tone={curvature.getStatus(metrics.spineCurvatureRatio)}
            last
          />
        </View>

        <View className="mt-3 flex-row items-center justify-between">
          <Text className="text-[10px] text-ink-faint">
            {passage.clipDurationSec.toFixed(1)}s clip ·{' '}
            {Math.round(passage.detectionConfidence * 100)}% confidence
          </Text>
          <View className="flex-row items-center gap-0.5">
            <Text className="text-[10.5px] font-semibold text-forest-700">
              Explain
            </Text>
            <ChevronRight size={13} color={COLORS.forest[700]} strokeWidth={2.4} />
          </View>
        </View>
      </Pressable>
    </View>
  );
}

interface PassageRowProps {
  passage: CattlePassage;
  onPress: () => void;
}

/** Compact row used for “recent passages” on the dashboard. */
export function PassageRow({ passage, onPress }: PassageRowProps) {
  const risk = RISK_META[passage.riskLevel];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${passage.tagId}, score ${passage.locomotionScore}, ${passage.riskLevel}`}
      className="flex-row items-center gap-3 py-3"
      style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
    >
      <View
        className={cn(
          'h-10 w-10 items-center justify-center rounded-2xl border',
          risk.badge,
        )}
      >
        <Text className={cn('text-[12px] font-bold', risk.text)}>
          {passage.tagId}
        </Text>
      </View>

      <View className="flex-1">
        <View className="flex-row items-center gap-1.5">
          <Text className="text-[12.5px] font-semibold text-ink">
            Passage #{passage.entryOrder}
          </Text>
          <Text className="text-[10px] text-ink-faint">
            {formatClock(passage.passageTime)}
          </Text>
        </View>
        <Text className="mt-0.5 text-[10.5px] text-ink-muted">
          {SCORE_LABELS[passage.locomotionScore]} ·{' '}
          {passage.metrics.asymmetryIndex.toFixed(1)}% asymmetry
        </Text>
      </View>

      <ScorePips score={passage.locomotionScore} />
      <ChevronRight size={15} color={COLORS.inkFaint} strokeWidth={2} />
    </Pressable>
  );
}
