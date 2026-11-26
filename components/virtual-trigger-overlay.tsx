import { useEffect, useState } from 'react';
import { Text, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { LiveDot } from '@/components/ui/live-dot';

const VIEW_W = 132;
const VIEW_H = 92;

const CORNERS: ViewStyle[] = [
  { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2 },
  { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2 },
  { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2 },
  { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2 },
];

interface VirtualTriggerOverlayProps {
  /** Persistent ByteTrack ID shown above the detection box. */
  tagId: string;
  /** Detection confidence, 0–1. */
  confidence?: number;
  /** 0 = entry edge, 1 = passage edge. The box eases toward this point. */
  crossing?: number;
  className?: string;
}

/**
 * Mid-stream virtual trigger overlay. A dashed emerald boundary splits the
 * entry and passage zones, while the tracked bounding box and 2D pose skeleton
 * ease across the feed as the pipeline follows a cow.
 */
export function VirtualTriggerOverlay({
  tagId,
  confidence = 0.97,
  crossing = 0.1,
  className,
}: VirtualTriggerOverlayProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const travel = useSharedValue(crossing);

  const boxW = Math.round(Math.min(168, Math.max(116, size.width * 0.3)));
  const boxH = Math.round((boxW * VIEW_H) / VIEW_W);
  const boxTop = Math.max(0, (size.height - boxH) / 2);
  const lineX = Math.round(size.width * 0.46);

  useEffect(() => {
    travel.value = withTiming(Math.min(1, Math.max(0, crossing)), {
      duration: 850,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [crossing, travel]);

  const boxStyle = useAnimatedStyle(() => {
    const span = Math.max(0, size.width - boxW - 16);
    return { transform: [{ translateX: 8 + travel.value * span }] };
  });

  const onLayout = (event: LayoutChangeEvent) => {
    setSize(event.nativeEvent.layout);
  };

  return (
    <View
      className={className ? `absolute inset-0 ${className}` : 'absolute inset-0'}
      onLayout={onLayout}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {size.width > 0 ? (
        <>
          <Svg width={size.width} height={size.height}>
            <Rect
              x={lineX}
              y={0}
              width={Math.max(0, size.width - lineX)}
              height={size.height}
              fill="rgba(45, 212, 191, 0.06)"
            />
            {[0.26, 0.52, 0.78].map((fraction) => (
              <Line
                key={fraction}
                x1={0}
                x2={size.width}
                y1={size.height * fraction}
                y2={size.height * fraction}
                stroke="rgba(255, 255, 255, 0.05)"
                strokeWidth={1}
              />
            ))}
            <Line
              x1={lineX}
              x2={lineX}
              y1={0}
              y2={size.height}
              stroke="#2DD4BF"
              strokeWidth={6}
              opacity={0.14}
            />
            <Line
              x1={lineX}
              x2={lineX}
              y1={0}
              y2={size.height}
              stroke="#2DD4BF"
              strokeWidth={1.4}
              strokeDasharray="7 6"
            />
          </Svg>

          <View className="absolute left-3 top-2 flex-row items-center gap-1">
            <View
              style={{
                width: 3,
                height: 3,
                borderRadius: 2,
                backgroundColor: '#34D399',
              }}
            />
            <Text
              style={{
                fontSize: 8,
                fontWeight: '700',
                letterSpacing: 1.1,
                color: '#6EE7B7',
              }}
            >
              ENTRY
            </Text>
          </View>

          <View className="absolute right-3 top-2 flex-row items-center gap-1">
            <Text
              style={{
                fontSize: 8,
                fontWeight: '700',
                letterSpacing: 1.1,
                color: '#5EEAD4',
              }}
            >
              PASSAGE
            </Text>
            <View
              style={{
                width: 3,
                height: 3,
                borderRadius: 2,
                backgroundColor: '#5EEAD4',
              }}
            />
          </View>

          <View
            className="absolute flex-row items-center justify-center gap-1 rounded-full border px-2 py-1"
            style={{
              left: lineX - 32,
              top: 4,
              width: 64,
              borderColor: 'rgba(45, 212, 191, 0.45)',
              backgroundColor: 'rgba(4, 35, 26, 0.88)',
            }}
          >
            <LiveDot size={2.5} color="#2DD4BF" />
            <Text
              style={{
                fontSize: 7.5,
                fontWeight: '700',
                letterSpacing: 0.7,
                color: '#99F6E4',
              }}
            >
              TRIGGER
            </Text>
          </View>

          <Animated.View
            style={[
              {
                position: 'absolute',
                top: boxTop,
                left: 0,
                width: boxW,
                height: boxH,
              },
              boxStyle,
            ]}
          >
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                borderWidth: 1,
                borderColor: 'rgba(34, 211, 238, 0.45)',
                borderRadius: 10,
              }}
            />
            {CORNERS.map((corner, index) => (
              <View
                key={index}
                style={[
                  {
                    position: 'absolute',
                    width: 12,
                    height: 12,
                    borderColor: '#22D3EE',
                  },
                  corner,
                ]}
              />
            ))}

            <View
              style={{
                position: 'absolute',
                top: -20,
                left: -1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                borderRadius: 6,
                backgroundColor: '#22D3EE',
                paddingHorizontal: 6,
                paddingVertical: 2,
              }}
            >
              <Text
                style={{ fontSize: 9, fontWeight: '800', color: '#04231A' }}
              >
                {tagId}
              </Text>
              <Text
                style={{ fontSize: 8, fontWeight: '700', color: '#0F5136' }}
              >
                {Math.round(confidence * 100)}%
              </Text>
            </View>

            <Svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              preserveAspectRatio="xMidYMid meet"
            >
              <Path
                d="M10 42 C11 34 18 30 30 29 L80 27 C90 26 98 28 104 32 L116 35 L116 41 L108 44 L104 45 L104 62 L99 62 L99 50 L46 50 L44 62 L39 62 L39 49 L28 47 L12 47 Z"
                fill="rgba(16, 185, 129, 0.11)"
                stroke="rgba(125, 211, 252, 0.32)"
                strokeWidth={1}
              />

              {/* Motion cue for the spine keypoints. */}
              <Path
                d="M52 15 H88 M84 12 L88 15 L84 18"
                stroke="#22D3EE"
                strokeWidth={1.2}
                opacity={0.75}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Spine chain, shoulder to hip. */}
              <Path
                d="M105 36 L96 35 L84 34 L72 32 L60 31 L48 31 L36 33 L28 36"
                stroke="#22D3EE"
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Near limbs. */}
              <Path
                d="M89 39 L91 53 L89 68"
                stroke="#34D399"
                strokeWidth={1.9}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Path
                d="M30 39 L27 53 L25 68"
                stroke="#34D399"
                strokeWidth={1.9}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Far limbs, dimmed for depth. */}
              <Path
                d="M81 40 L83 54 L81 68"
                stroke="#34D399"
                strokeWidth={1.6}
                opacity={0.45}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Path
                d="M38 40 L41 54 L39 68"
                stroke="#34D399"
                strokeWidth={1.6}
                opacity={0.45}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Spine nodes. */}
              {[
                [96, 35],
                [84, 34],
                [72, 32],
                [60, 31],
                [48, 31],
                [36, 33],
              ].map(([cx, cy]) => (
                <Circle
                  key={`${cx}-${cy}`}
                  cx={cx}
                  cy={cy}
                  r={1.9}
                  fill="#A7F3D0"
                />
              ))}

              {/* Head, hip, knees, hooves. */}
              <Circle cx={105} cy={36} r={2.6} fill="#22D3EE" />
              <Circle cx={28} cy={36} r={2.9} fill="#FBBF24" />
              <Circle cx={91} cy={53} r={2.2} fill="#34D399" />
              <Circle cx={27} cy={53} r={2.2} fill="#34D399" />
              <Circle cx={89} cy={68} r={2.4} fill="#F59E0B" />
              <Circle cx={25} cy={68} r={2.4} fill="#F59E0B" />
            </Svg>
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}
