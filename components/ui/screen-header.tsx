import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ScreenHeaderProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}

/**
 * Shared, safe-area aware screen header. Keeps the type hierarchy consistent
 * across the four tabs and avoids the platform default header styling.
 */
export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  right,
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="border-b border-line bg-canvas px-5 pb-4"
      style={{ paddingTop: insets.top + 12 }}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <View className="mb-1.5 flex-row items-center gap-2">
            <View className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            <Text className="text-[9.5px] font-bold uppercase tracking-[1.8px] text-ink-faint">
              {eyebrow}
            </Text>
          </View>
          <Text
            className="text-[26px] font-bold leading-[31px] tracking-[-0.7px] text-ink"
            accessibilityRole="header"
          >
            {title}
          </Text>
          {subtitle ? (
            <Text className="mt-1.5 text-[12.5px] leading-[19px] text-ink-muted">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
    </View>
  );
}
