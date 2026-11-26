import { View } from 'react-native';

import { SCORE_HEX } from '@/lib/herd';
import { cn } from '@/lib/cn';
import type { LocomotionScore } from '@/types/cattle';

const HEIGHTS = [7, 11, 15, 19, 23];

interface ScorePipsProps {
  score: LocomotionScore;
  className?: string;
}

/**
 * Five ascending bars — one per locomotion score. Active bars use their own
 * score colour so the transition from sound (emerald) to lame (crimson) is
 * legible at a glance.
 */
export function ScorePips({ score, className }: ScorePipsProps) {
  return (
    <View
      className={cn('flex-row items-end gap-1', className)}
      accessibilityRole="image"
      accessibilityLabel={`Locomotion score ${score} out of 5`}
    >
      {[1, 2, 3, 4, 5].map((step) => {
        const active = step <= score;
        return (
          <View
            key={step}
            style={{
              width: 5,
              height: HEIGHTS[step - 1],
              borderRadius: 3,
              backgroundColor: active
                ? SCORE_HEX[step as LocomotionScore]
                : '#DFE6E0',
            }}
          />
        );
      })}
    </View>
  );
}
