import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { SCORE_HEX } from '@/lib/herd';
import type { LocomotionScore } from '@/types/cattle';

interface ScoreDialProps {
  score: LocomotionScore;
  size?: number;
  trackColor?: string;
}

/** Circular 1–5 locomotion score dial. */
export function ScoreDial({
  score,
  size = 116,
  trackColor = '#1B3B2C',
}: ScoreDialProps) {
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 5) * circumference;

  return (
    <View
      style={{ width: size, height: size }}
      accessibilityRole="image"
      accessibilityLabel={`Locomotion score ${score} out of 5`}
    >
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={SCORE_HEX[score]}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${progress} ${circumference}`}
        />
      </Svg>
      <View className="absolute inset-0 items-center justify-center">
        <Text className="text-[38px] font-bold leading-[42px] tracking-[-1.5px] text-white">
          {score}
        </Text>
        <Text className="text-[9px] font-semibold uppercase tracking-[1.6px] text-forest-300">
          of 5
        </Text>
      </View>
    </View>
  );
}
