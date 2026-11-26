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

import { COLORS } from '@/constants/theme';
import type { VelocitySample } from '@/types/cattle';

interface VelocityChartProps {
  samples: VelocitySample[];
  height?: number;
}

const PADDING_X = 4;
const PADDING_TOP = 12;
const PADDING_BOTTOM = 8;

/** Stride-velocity trace with purged samples called out explicitly. */
export function VelocityChart({ samples, height = 148 }: VelocityChartProps) {
  const [width, setWidth] = useState(0);

  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  const retained = samples.filter((sample) => !sample.purged);
  const purged = samples.length - retained.length;
  const values = samples.map((sample) => sample.v);
  const rawMax = Math.max(...values, 0);
  const rawMin = Math.min(...values, rawMax);
  const span = Math.max(0.12, rawMax - rawMin);
  const max = rawMax + span * 0.18;
  const min = Math.max(0, rawMin - span * 0.18);

  const usableWidth = Math.max(0, width - PADDING_X * 2);
  const usableHeight = height - PADDING_TOP - PADDING_BOTTOM;

  const xFor = (index: number) =>
    PADDING_X +
    (samples.length <= 1 ? 0 : (index / (samples.length - 1)) * usableWidth);
  const yFor = (value: number) =>
    PADDING_TOP + (1 - (value - min) / Math.max(0.0001, max - min)) * usableHeight;

  const linePath = samples
    .map(
      (sample, index) =>
        `${index === 0 ? 'M' : 'L'}${xFor(index).toFixed(1)},${yFor(sample.v).toFixed(1)}`,
    )
    .join(' ');

  const baseline = PADDING_TOP + usableHeight;
  const areaPath =
    samples.length > 0
      ? `${linePath} L${xFor(samples.length - 1).toFixed(1)},${baseline} L${PADDING_X},${baseline} Z`
      : '';

  const lastRetained =
    retained.length > 0 ? samples.lastIndexOf(retained[retained.length - 1]) : -1;

  return (
    <View>
      <View className="mb-1 flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <View className="h-1.5 w-3 rounded-full bg-forest-600" />
          <Text className="text-[9.5px] font-semibold uppercase tracking-[0.8px] text-ink-faint">
            Velocity · m/s
          </Text>
        </View>
        <Text className="text-[10px] font-medium text-ink-muted">
          {rawMin.toFixed(2)}–{rawMax.toFixed(2)} m/s
        </Text>
      </View>

      <View onLayout={onLayout} style={{ height }}>
        {width > 0 ? (
          <Svg width={width} height={height} pointerEvents="none">
            <Defs>
              <LinearGradient id="velocityFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={COLORS.forest[500]} stopOpacity={0.22} />
                <Stop offset="1" stopColor={COLORS.forest[500]} stopOpacity={0.01} />
              </LinearGradient>
            </Defs>

            {[0.25, 0.5, 0.75].map((fraction) => (
              <Line
                key={fraction}
                x1={PADDING_X}
                x2={width - PADDING_X}
                y1={PADDING_TOP + usableHeight * fraction}
                y2={PADDING_TOP + usableHeight * fraction}
                stroke={COLORS.line}
                strokeWidth={1}
                strokeDasharray="3 5"
              />
            ))}

            <Path d={areaPath} fill="url(#velocityFill)" />
            <Path
              d={linePath}
              stroke={COLORS.forest[600]}
              strokeWidth={2.4}
              strokeLinejoin="round"
              strokeLinecap="round"
              fill="none"
            />

            {samples.map((sample, index) =>
              sample.purged ? (
                <Line
                  key={`purged-line-${sample.frame}`}
                  x1={xFor(index)}
                  x2={xFor(index)}
                  y1={PADDING_TOP - 2}
                  y2={baseline}
                  stroke={COLORS.amber[400]}
                  strokeWidth={1}
                  strokeDasharray="2 4"
                />
              ) : null,
            )}

            {samples.map((sample, index) =>
              sample.purged ? (
                <Circle
                  key={`purged-dot-${sample.frame}`}
                  cx={xFor(index)}
                  cy={yFor(sample.v)}
                  r={3.4}
                  fill={COLORS.surface}
                  stroke={COLORS.amber[500]}
                  strokeWidth={1.8}
                />
              ) : (
                <Circle
                  key={`dot-${sample.frame}`}
                  cx={xFor(index)}
                  cy={yFor(sample.v)}
                  r={1.9}
                  fill={COLORS.forest[600]}
                  opacity={0.55}
                />
              ),
            )}

            {lastRetained >= 0 ? (
              <Circle
                cx={xFor(lastRetained)}
                cy={yFor(samples[lastRetained].v)}
                r={4}
                fill={COLORS.forest[700]}
                stroke={COLORS.surface}
                strokeWidth={2}
              />
            ) : null}
          </Svg>
        ) : null}
      </View>

      <View className="mt-1 flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          <View className="flex-row items-center gap-1">
            <View
              style={{
                width: 5,
                height: 5,
                borderRadius: 2.5,
                backgroundColor: COLORS.forest[600],
              }}
            />
            <Text className="text-[9.5px] text-ink-muted">
              {retained.length} retained
            </Text>
          </View>
          <View className="flex-row items-center gap-1">
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                borderWidth: 1.4,
                borderColor: COLORS.amber[500],
                backgroundColor: COLORS.surface,
              }}
            />
            <Text className="text-[9.5px] text-ink-muted">{purged} purged</Text>
          </View>
        </View>
        <Text className="text-[9.5px] text-ink-faint">
          F1 → F{samples.length}
        </Text>
      </View>
    </View>
  );
}
