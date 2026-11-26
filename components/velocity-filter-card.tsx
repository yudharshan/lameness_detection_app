import { useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Stop,
} from 'react-native-svg';

import { Card } from '@/components/ui/card';
import { LiveDot } from '@/components/ui/live-dot';
import { COLORS } from '@/constants/theme';
import { cn } from '@/lib/cn';

type FilterMode = 'stride' | 'pause' | 'slip';

const CHART_HEIGHT = 64;
const PAD_X = 3;
const PAD_TOP = 8;
const PAD_BOTTOM = 6;

const MODE_STYLE: Record<
  FilterMode,
  {
    label: string;
    badge: string;
    text: string;
    dot: string;
    hex: string;
    detail: (threshold: number) => string;
  }
> = {
  stride: {
    label: 'Active Stride',
    badge: 'bg-forest-50 border-forest-200',
    text: 'text-forest-700',
    dot: 'bg-forest-600',
    hex: COLORS.forest[600],
    detail: (threshold) =>
      `v_t ≥ ${threshold.toFixed(2)} m/s — keypoints saved to frame buffer S_k.`,
  },
  pause: {
    label: 'Purging Pause',
    badge: 'bg-amber-50 border-amber-200',
    text: 'text-amber-700',
    dot: 'bg-amber-400',
    hex: COLORS.amber[400],
    detail: (threshold) =>
      `v_t < ${threshold.toFixed(2)} m/s — cow paused; frame purged to avoid false positives.`,
  },
  slip: {
    label: 'Purging Turn / Slip',
    badge: 'bg-crimson-50 border-crimson-200',
    text: 'text-crimson-700',
    dot: 'bg-crimson-500',
    hex: COLORS.crimson[500],
    detail: () =>
      'High lateral variance detected — non-walking frame discarded.',
  },
};

interface VelocityFilterCardProps {
  /** Current horizontal spine velocity in m/s. */
  velocity: number;
  /** Minimum forward velocity that counts as an active stride. */
  threshold?: number;
  /** Lateral keypoint variance, 0–1. Values above 0.4 flag a turn / slip. */
  lateralVariance?: number;
  /** Recent velocity samples, oldest → newest. */
  history: number[];
  /** Frames retained in buffer S_k. */
  retained: number;
  /** Frames discarded as pauses or turns. */
  purged: number;
  busy?: boolean;
}

/**
 * Live keypoint-velocity panel. Derives the frame disposition from the
 * horizontal spine velocity and the lateral variance, then plots the recent
 * filtering history with the stride threshold overlaid.
 */
export function VelocityFilterCard({
  velocity,
  threshold = 0.35,
  lateralVariance = 0,
  history,
  retained,
  purged,
  busy = false,
}: VelocityFilterCardProps) {
  const [width, setWidth] = useState(0);

  const mode: FilterMode =
    lateralVariance > 0.4 ? 'slip' : velocity < threshold ? 'pause' : 'stride';
  const style = MODE_STYLE[mode];
  const series =
    history.length >= 2
      ? history
      : [Math.max(0, velocity - 0.08), velocity];
  const max = Math.max(1.4, ...series) * 1.02;

  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  const xFor = (index: number) =>
    PAD_X +
    (index / (series.length - 1)) * Math.max(0, width - PAD_X * 2);
  const yFor = (value: number) =>
    PAD_TOP +
    (1 - Math.min(value, max) / max) * (CHART_HEIGHT - PAD_TOP - PAD_BOTTOM);

  const linePath = series
    .map(
      (value, index) =>
        `${index === 0 ? 'M' : 'L'}${xFor(index).toFixed(1)} ${yFor(value).toFixed(1)}`,
    )
    .join(' ');
  const baseline = CHART_HEIGHT - PAD_BOTTOM;
  const areaPath = `${linePath} L${xFor(series.length - 1).toFixed(1)} ${baseline} L${PAD_X} ${baseline} Z`;

  return (
    <Card padded={false} className="mt-3 overflow-hidden">
      <View className="p-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <View className="flex-row items-center gap-1.5">
              <Text className="text-[8.5px] font-bold uppercase tracking-[1.4px] text-ink-faint">
                Keypoint filter
              </Text>
              <LiveDot
                size={2.5}
                color={busy ? COLORS.forest[500] : COLORS.inkFaint}
              />
              <Text
                className={cn(
                  'text-[8px] font-bold uppercase tracking-[0.8px]',
                  busy ? 'text-forest-700' : 'text-ink-faint',
                )}
              >
                {busy ? 'Live' : 'Standby'}
              </Text>
            </View>
            <Text className="mt-0.5 text-[13px] font-bold text-ink">
              Spine velocity & noise purge
            </Text>
          </View>
          <View className="rounded-lg border border-line bg-canvas px-2 py-1">
            <Text className="text-[9.5px] font-semibold text-ink-muted">
              v_t = Δx / Δt
            </Text>
          </View>
        </View>

        <View className="mt-3 flex-row items-end justify-between gap-2">
          <View>
            <Text className="text-[8.5px] font-bold uppercase tracking-[1.1px] text-ink-faint">
              Spine velocity
            </Text>
            <Text
              className="text-[31px] font-bold leading-[35px] text-ink"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {velocity.toFixed(2)}
              <Text className="text-[11px] font-semibold text-ink-faint">
                {' '}
                m/s
              </Text>
            </Text>
          </View>
          <View
            className={cn(
              'mb-1 flex-row items-center gap-1.5 rounded-full border px-2.5 py-1',
              style.badge,
            )}
          >
            <View className={cn('h-1.5 w-1.5 rounded-full', style.dot)} />
            <Text className={cn('text-[9.5px] font-bold', style.text)}>
              {style.label}
            </Text>
          </View>
        </View>

        <View
          className="mt-2 overflow-hidden"
          onLayout={onLayout}
          style={{ height: CHART_HEIGHT }}
        >
          {width > 0 ? (
            <Svg width={width} height={CHART_HEIGHT}>
              <Defs>
                <LinearGradient
                  id="velocity-filter-fill"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <Stop offset="0" stopColor={COLORS.forest[500]} stopOpacity={0.2} />
                  <Stop offset="1" stopColor={COLORS.forest[500]} stopOpacity={0} />
                </LinearGradient>
              </Defs>

              {[0.33, 0.66].map((fraction) => (
                <Line
                  key={fraction}
                  x1={PAD_X}
                  x2={width - PAD_X}
                  y1={PAD_TOP + (baseline - PAD_TOP) * fraction}
                  y2={PAD_TOP + (baseline - PAD_TOP) * fraction}
                  stroke={COLORS.line}
                  strokeWidth={1}
                />
              ))}

              <Line
                x1={PAD_X}
                x2={width - PAD_X}
                y1={yFor(threshold)}
                y2={yFor(threshold)}
                stroke={COLORS.amber[500]}
                strokeWidth={1}
                strokeDasharray="4 4"
                opacity={0.7}
              />

              <Path d={areaPath} fill="url(#velocity-filter-fill)" />
              <Path
                d={linePath}
                stroke={COLORS.forest[600]}
                strokeWidth={1.8}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {series.map((value, index) => {
                const isLast = index === series.length - 1;
                const below = value < threshold;
                return (
                  <Circle
                    key={`${index}-${value.toFixed(2)}`}
                    cx={xFor(index)}
                    cy={yFor(value)}
                    r={isLast ? 3.2 : 1.5}
                    fill={
                      isLast
                        ? style.hex
                        : below
                          ? COLORS.amber[500]
                          : COLORS.forest[300]
                    }
                    opacity={isLast ? 1 : 0.8}
                    stroke={isLast ? '#FFFFFF' : 'none'}
                    strokeWidth={isLast ? 1.4 : 0}
                  />
                );
              })}
            </Svg>
          ) : null}
        </View>

        <Text className="mt-1 text-[10px] leading-[15px] text-ink-muted">
          {style.detail(threshold)}
        </Text>
      </View>

      <View className="flex-row border-t border-line bg-canvas px-4 py-2.5">
        <View className="flex-1">
          <Text className="text-[8px] font-bold uppercase tracking-[0.9px] text-ink-faint">
            Retained · S_k
          </Text>
          <Text className="mt-0.5 text-[12px] font-bold text-forest-700">
            {retained}
          </Text>
        </View>
        <View className="flex-1 border-l border-line pl-3">
          <Text className="text-[8px] font-bold uppercase tracking-[0.9px] text-ink-faint">
            Purged
          </Text>
          <Text className="mt-0.5 text-[12px] font-bold text-amber-700">
            {purged}
          </Text>
        </View>
        <View className="flex-1 border-l border-line pl-3">
          <Text className="text-[8px] font-bold uppercase tracking-[0.9px] text-ink-faint">
            Threshold
          </Text>
          <Text className="mt-0.5 text-[12px] font-bold text-ink">
            {threshold.toFixed(2)} m/s
          </Text>
        </View>
      </View>
    </Card>
  );
}
