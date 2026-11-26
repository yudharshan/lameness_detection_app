import { View } from 'react-native';

import { cn } from '@/lib/cn';

interface RangeBarProps {
  value: number;
  domain: [number, number];
  normal: [number, number];
  color: string;
  className?: string;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/**
 * Horizontal measurement track: muted track, emerald sound band, and a marker
 * for the observed value.
 */
export function RangeBar({
  value,
  domain,
  normal,
  color,
  className,
}: RangeBarProps) {
  const span = domain[1] - domain[0];
  const position = clampPercent(((value - domain[0]) / span) * 100);
  const bandStart = clampPercent(((normal[0] - domain[0]) / span) * 100);
  const bandEnd = clampPercent(((normal[1] - domain[0]) / span) * 100);

  return (
    <View
      className={cn('justify-center', className)}
      style={{ height: 14 }}
      accessibilityRole="image"
      accessibilityLabel={`Measured ${value}; sound range ${normal[0]} to ${normal[1]}`}
    >
      <View className="h-[5px] w-full overflow-hidden rounded-full bg-line">
        <View
          className="h-full rounded-full bg-forest-200"
          style={{
            marginLeft: `${bandStart}%`,
            width: `${Math.max(0, bandEnd - bandStart)}%`,
          }}
        />
      </View>
      <View
        style={{
          position: 'absolute',
          left: `${position}%`,
          marginLeft: -4,
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: color,
          borderWidth: 2,
          borderColor: '#FFFFFF',
        }}
      />
    </View>
  );
}
