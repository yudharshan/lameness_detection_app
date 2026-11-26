import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { COLORS } from '@/constants/theme';

interface LiveDotProps {
  color?: string;
  size?: number;
}

/** Pulsing indicator for a live virtual-trigger feed. */
export function LiveDot({ color = COLORS.amber[400], size = 7 }: LiveDotProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.55);

  useEffect(() => {
    scale.value = withRepeat(withTiming(2.4, { duration: 1600 }), -1, false);
    opacity.value = withRepeat(withTiming(0, { duration: 1600 }), -1, false);
  }, [opacity, scale]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View
      className="items-center justify-center"
      style={{ width: size * 2.6, height: size * 2.6 }}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: size * 1.8,
            height: size * 1.8,
            borderRadius: size,
            backgroundColor: color,
          },
          ringStyle,
        ]}
      />
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}
