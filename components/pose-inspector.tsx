import { LinearGradient } from 'expo-linear-gradient';
import {
  Activity,
  GitBranch,
  Route,
  ScanLine,
  type LucideIcon,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, {
  Circle,
  G,
  Line,
  Path,
  Rect,
  Text as SvgText,
} from 'react-native-svg';

import { Card } from '@/components/ui/card';
import { COLORS } from '@/constants/theme';
import { cn } from '@/lib/cn';
import type { CattlePassage } from '@/types/cattle';

interface PoseInspectorProps {
  passage: CattlePassage;
}

type ToggleKey = 'labels' | 'spine' | 'joints' | 'trails';

const TOGGLES: { key: ToggleKey; label: string; icon: LucideIcon }[] = [
  { key: 'labels', label: 'Labels', icon: ScanLine },
  { key: 'spine', label: 'Spine arc', icon: GitBranch },
  { key: 'joints', label: 'Joint vectors', icon: Activity },
  { key: 'trails', label: 'Trails', icon: Route },
];

const STAGE_WIDTH = 360;
const STAGE_HEIGHT = 230;
const PLOT_LEFT = 34;
const PLOT_RIGHT = 308;
const PLOT_TOP = 12;
const PLOT_BOTTOM = 86;
const CHART_WIDTH = 320;
const CHART_HEIGHT = 112;

interface Point {
  x: number;
  y: number;
}

interface SpineNode extends Point {
  label: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function angleAt(origin: Point, first: Point, second: Point): number {
  const ax = first.x - origin.x;
  const ay = first.y - origin.y;
  const bx = second.x - origin.x;
  const by = second.y - origin.y;
  const magnitude = Math.hypot(ax, ay) * Math.hypot(bx, by);
  if (magnitude === 0) return 0;
  return (Math.acos(clamp((ax * bx + ay * by) / magnitude, -1, 1)) * 180) /
    Math.PI;
}

function pointAlong(origin: Point, target: Point, length: number): Point {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const magnitude = Math.hypot(dx, dy) || 1;
  return {
    x: origin.x + (dx / magnitude) * length,
    y: origin.y + (dy / magnitude) * length,
  };
}

function angleArc(
  origin: Point,
  first: Point,
  second: Point,
  radius: number,
): string {
  const startAngle = Math.atan2(first.y - origin.y, first.x - origin.x);
  const targetAngle = Math.atan2(second.y - origin.y, second.x - origin.x);
  const rawDelta = targetAngle - startAngle;
  const delta = Math.atan2(Math.sin(rawDelta), Math.cos(rawDelta));
  const start = {
    x: origin.x + Math.cos(startAngle) * radius,
    y: origin.y + Math.sin(startAngle) * radius,
  };
  const end = {
    x: origin.x + Math.cos(startAngle + delta) * radius,
    y: origin.y + Math.sin(startAngle + delta) * radius,
  };
  const sweep = delta > 0 ? 1 : 0;
  const largeArc = Math.abs(delta) > Math.PI ? 1 : 0;
  return `M ${origin.x} ${origin.y} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${end.x} ${end.y} Z`;
}

function det3(matrix: number[][]): number {
  return (
    matrix[0][0] * (matrix[1][1] * matrix[2][2] - matrix[1][2] * matrix[2][1]) -
    matrix[0][1] * (matrix[1][0] * matrix[2][2] - matrix[1][2] * matrix[2][0]) +
    matrix[0][2] * (matrix[1][0] * matrix[2][1] - matrix[1][1] * matrix[2][0])
  );
}

/** Least-squares fit of y = ax² + bx + c through the five spine nodes. */
function fitQuadratic(points: Point[]): (x: number) => number {
  let sx = 0;
  let sx2 = 0;
  let sx3 = 0;
  let sx4 = 0;
  let sy = 0;
  let sxy = 0;
  let sx2y = 0;

  for (const point of points) {
    sx += point.x;
    sx2 += point.x ** 2;
    sx3 += point.x ** 3;
    sx4 += point.x ** 4;
    sy += point.y;
    sxy += point.x * point.y;
    sx2y += point.x ** 2 * point.y;
  }

  const matrix = [
    [sx4, sx3, sx2],
    [sx3, sx2, sx],
    [sx2, sx, points.length],
  ];
  const determinant = det3(matrix);
  if (Math.abs(determinant) < 1e-9) {
    const first = points[0];
    const last = points[points.length - 1];
    return (x) =>
      first.y + ((x - first.x) / (last.x - first.x)) * (last.y - first.y);
  }

  const a = det3([
    [sx2y, sx3, sx2],
    [sxy, sx2, sx],
    [sy, sx, points.length],
  ]) / determinant;
  const b = det3([
    [sx4, sx2y, sx2],
    [sx3, sxy, sx],
    [sx2, sy, points.length],
  ]) / determinant;
  const c = det3([
    [sx4, sx3, sx2y],
    [sx3, sx2, sxy],
    [sx2, sx, sy],
  ]) / determinant;

  return (x) => a * x ** 2 + b * x + c;
}

function buildSpine(curvature: number) {
  const arch = clamp((curvature - 1) * 40, 0, 20);
  const labels = ['Hip', 'Sacrum', 'Lumbar', 'Thoracic', 'Withers'];
  const nodes: SpineNode[] = labels.map((label, index) => {
    const x = 100 + index * 37.5;
    const t = (x - 100) / 150;
    const baseline = 88 - t * 14;
    const y = baseline - arch * 4 * t * (1 - t);
    return { x, y, label };
  });

  const fit = fitQuadratic(nodes);
  const samples = Array.from({ length: 28 }, (_, index) => {
    const x = 100 + (index / 27) * 150;
    return { x, y: fit(x) };
  });
  const path = samples
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');

  return { nodes, path, arch };
}

function affectedSide(passage: CattlePassage): 'left' | 'right' {
  const match = passage.analysisNote?.match(/\b(left|right)\b/i);
  if (match) return match[1].toLowerCase() as 'left' | 'right';
  return passage.entryOrder % 2 === 0 ? 'right' : 'left';
}

function liftAt(phase: number, swingStart: number, swingLength: number) {
  let relative = phase - swingStart;
  if (relative < 0) relative += 1;
  if (relative >= swingLength) return 0;
  return Math.sin((relative / swingLength) * Math.PI) ** 1.15;
}

function buildTrails(passage: CattlePassage) {
  const asymmetry = clamp(passage.metrics.asymmetryIndex / 100, 0, 0.95);
  const phaseRatio = clamp(passage.metrics.limbPhaseShift, 0.9, 1.6);
  const baseSwing = 1 / (1 + phaseRatio);
  const affected = affectedSide(passage);

  const swingLeft =
    affected === 'left' ? baseSwing * (1 - asymmetry * 0.35) : baseSwing;
  const swingRight =
    affected === 'right' ? baseSwing * (1 - asymmetry * 0.35) : baseSwing;

  const rawLeft: number[] = [];
  const rawRight: number[] = [];
  for (let index = 0; index <= 64; index += 1) {
    const phase = (index / 32) % 1;
    rawLeft.push(liftAt(phase, 0.08, swingLeft));
    rawRight.push(liftAt(phase, 0.58, swingRight));
  }

  const sumLeft = rawLeft.reduce((sum, value) => sum + value, 0) || 1;
  const sumRight = rawRight.reduce((sum, value) => sum + value, 0) || 1;
  const high = 1 + asymmetry;
  const low = 1 - asymmetry;
  const targetLeft = affected === 'left' ? low : high;
  const targetRight = affected === 'right' ? low : high;

  const left = rawLeft.map((value) => (value / sumLeft) * targetLeft);
  const right = rawRight.map((value) => (value / sumRight) * targetRight);
  const max = Math.max(...left, ...right, 0.001);

  const toPath = (values: number[]) =>
    values
      .map((value, index) => {
        const x = PLOT_LEFT + (index / (values.length - 1)) * (PLOT_RIGHT - PLOT_LEFT);
        const y =
          PLOT_BOTTOM -
          (value / max) * (PLOT_BOTTOM - PLOT_TOP) * 0.92;
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');

  return {
    leftAuc: targetLeft,
    rightAuc: targetRight,
    leftPath: toPath(left),
    rightPath: toPath(right),
    affected,
    asymmetry: passage.metrics.asymmetryIndex,
  };
}

export function PoseInspector({ passage }: PoseInspectorProps) {
  const [visible, setVisible] = useState<Record<ToggleKey, boolean>>({
    labels: true,
    spine: true,
    joints: true,
    trails: true,
  });

  const spine = useMemo(
    () => buildSpine(passage.metrics.spineCurvatureRatio),
    [passage.metrics.spineCurvatureRatio],
  );

  const joints = useMemo(() => {
    const flexion = passage.metrics.triJointFlexionAngle;
    const bend = clamp((142 - flexion) / 45, 0, 1);
    const hip = { x: 102, y: 112 };
    const knee = { x: 88 - 14 * bend, y: 146 };
    const hoof = { x: 98 + 10 * bend, y: 182 };
    const pastern = { x: hoof.x + 11, y: hoof.y + 7 };
    const sacrum = spine.nodes[1];

    return {
      hip,
      knee,
      hoof,
      pastern,
      sacrum,
      hipAngle: angleAt(hip, sacrum, knee),
      kneeAngle: angleAt(knee, hip, hoof),
      hoofAngle: angleAt(hoof, knee, pastern),
    };
  }, [passage.metrics.triJointFlexionAngle, spine.nodes]);

  const trails = useMemo(() => buildTrails(passage), [passage]);
  const affectedColor =
    trails.asymmetry > 15 ? COLORS.crimson[600] : COLORS.amber[500];
  const leftColor =
    trails.affected === 'left' && trails.asymmetry > 15
      ? affectedColor
      : COLORS.forest[600];
  const rightColor =
    trails.affected === 'right' && trails.asymmetry > 15
      ? affectedColor
      : COLORS.amber[500];

  const jointReadouts = [
    {
      key: 'A',
      angle: joints.hipAngle,
      color: '#FCD34D',
      label: { x: joints.hip.x + 30, y: joints.hip.y - 4 },
    },
    {
      key: 'B',
      angle: joints.kneeAngle,
      color: '#67E8F9',
      label: { x: joints.knee.x - 29, y: joints.knee.y + 2 },
    },
    {
      key: 'C',
      angle: joints.hoofAngle,
      color: '#6EE7B7',
      label: { x: joints.hoof.x - 27, y: joints.hoof.y - 9 },
    },
  ];

  const toggle = (key: ToggleKey) =>
    setVisible((current) => ({ ...current, [key]: !current[key] }));

  return (
    <Card padded={false} className="overflow-hidden">
      <View style={{ width: '100%', aspectRatio: STAGE_WIDTH / STAGE_HEIGHT }}>
        <LinearGradient
          colors={['#071F17', '#04231A', '#02150F']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        />

        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${STAGE_WIDTH} ${STAGE_HEIGHT}`}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
          }}
        >
          <Rect
            x={0}
            y={188}
            width={STAGE_WIDTH}
            height={42}
            fill="#02150F"
            opacity={0.65}
          />
          <Line
            x1={22}
            y1={198}
            x2={338}
            y2={198}
            stroke="#1D4B39"
            strokeWidth={0.8}
            strokeDasharray="3 5"
          />

          {/* Faint side-view silhouette */}
          <Path
            d="M58 116 C60 98 78 88 100 86 L248 72 C266 70 284 76 298 86 L324 94 L330 108 L314 116 L302 118 L300 126 L288 126 L284 120 L122 120 L116 130 L104 130 L100 120 L76 124 Z"
            fill="#0C3B2B"
            fillOpacity={0.66}
            stroke="#2C6D53"
            strokeWidth={1}
          />
          <Path
            d="M62 102 C52 108 50 126 56 140"
            fill="none"
            stroke="#2C6D53"
            strokeWidth={1}
            strokeLinecap="round"
          />
          <Line
            x1={116}
            y1={120}
            x2={110}
            y2={174}
            stroke="#245944"
            strokeWidth={2.4}
            strokeLinecap="round"
          />
          <Line
            x1={110}
            y1={174}
            x2={103}
            y2={190}
            stroke="#245944"
            strokeWidth={2.2}
            strokeLinecap="round"
          />
          <Line
            x1={220}
            y1={120}
            x2={216}
            y2={174}
            stroke="#2C6D53"
            strokeWidth={2.6}
            strokeLinecap="round"
          />
          <Line
            x1={216}
            y1={174}
            x2={209}
            y2={190}
            stroke="#2C6D53"
            strokeWidth={2.4}
            strokeLinecap="round"
          />
          <Line
            x1={238}
            y1={120}
            x2={234}
            y2={176}
            stroke="#2C6D53"
            strokeWidth={2.8}
            strokeLinecap="round"
          />
          <Line
            x1={234}
            y1={176}
            x2={227}
            y2={192}
            stroke="#2C6D53"
            strokeWidth={2.6}
            strokeLinecap="round"
          />

          {/* Near hind limb — the measured tri-joint chain */}
          <Path
            d={`M ${joints.hip.x} ${joints.hip.y} L ${joints.knee.x} ${joints.knee.y} L ${joints.hoof.x} ${joints.hoof.y} L ${joints.pastern.x} ${joints.pastern.y}`}
            fill="none"
            stroke="#4BA678"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Circle cx={joints.hip.x} cy={joints.hip.y} r={3.2} fill="#FCD34D" />
          <Circle cx={joints.knee.x} cy={joints.knee.y} r={3} fill="#67E8F9" />
          <Circle cx={joints.hoof.x} cy={joints.hoof.y} r={2.6} fill="#6EE7B7" />

          {visible.spine ? (
            <G>
              <Path
                d={spine.path}
                fill="none"
                stroke="#34D399"
                strokeOpacity={0.2}
                strokeWidth={7}
                strokeLinecap="round"
              />
              <Path
                d={spine.path}
                fill="none"
                stroke="#6EE7B7"
                strokeWidth={2.1}
                strokeLinecap="round"
              />
              <SvgText
                x={22}
                y={30}
                fontSize={6.2}
                fill="#7FC49E"
                fontWeight="600"
              >
                2ND-DEGREE SPINE FIT
              </SvgText>
            </G>
          ) : null}

          {spine.nodes.map((node) => (
            <G key={node.label}>
              <Circle
                cx={node.x}
                cy={node.y}
                r={3.4}
                fill="#22D3EE"
                stroke="#A5F3FC"
                strokeWidth={1}
              />
              <Circle cx={node.x} cy={node.y} r={1.1} fill="#04231A" />
              {visible.labels ? (
                <SvgText
                  x={node.x}
                  y={node.y - 10}
                  fontSize={6.8}
                  fill="#A7D9C0"
                  fontWeight="600"
                  textAnchor="middle"
                >
                  {node.label}
                </SvgText>
              ) : null}
            </G>
          ))}

          {visible.joints
            ? jointReadouts.map((readout) => {
                const vectors =
                  readout.key === 'A'
                    ? [joints.sacrum, joints.knee]
                    : readout.key === 'B'
                      ? [joints.hip, joints.hoof]
                      : [joints.knee, joints.pastern];
                const origin =
                  readout.key === 'A'
                    ? joints.hip
                    : readout.key === 'B'
                      ? joints.knee
                      : joints.hoof;
                const first = pointAlong(origin, vectors[0], 24);
                const second = pointAlong(origin, vectors[1], 24);

                return (
                  <G key={readout.key}>
                    <Path
                      d={angleArc(origin, first, second, 16)}
                      fill={readout.color}
                      fillOpacity={0.13}
                      stroke={readout.color}
                      strokeOpacity={0.78}
                      strokeWidth={1}
                    />
                    <Line
                      x1={origin.x}
                      y1={origin.y}
                      x2={first.x}
                      y2={first.y}
                      stroke={readout.color}
                      strokeWidth={1.2}
                      strokeOpacity={0.9}
                    />
                    <Line
                      x1={origin.x}
                      y1={origin.y}
                      x2={second.x}
                      y2={second.y}
                      stroke={readout.color}
                      strokeWidth={1.2}
                      strokeOpacity={0.9}
                    />
                    <Circle cx={first.x} cy={first.y} r={1.8} fill={readout.color} />
                    <Circle
                      cx={second.x}
                      cy={second.y}
                      r={1.8}
                      fill={readout.color}
                    />
                  </G>
                );
              })
            : null}

          {visible.labels
            ? jointReadouts.map((readout) => (
                <G key={`readout-${readout.key}`}>
                  <Rect
                    x={readout.label.x - 18}
                    y={readout.label.y - 8}
                    width={36}
                    height={12}
                    rx={4}
                    fill="#04231A"
                    fillOpacity={0.9}
                    stroke={readout.color}
                    strokeOpacity={0.35}
                    strokeWidth={0.7}
                  />
                  <SvgText
                    x={readout.label.x}
                    y={readout.label.y + 1}
                    fontSize={7.1}
                    fill={readout.color}
                    fontWeight="700"
                    textAnchor="middle"
                  >
                    {`${readout.key} ${Math.round(readout.angle)}°`}
                  </SvgText>
                </G>
              ))
            : null}

          <SvgText
            x={22}
            y={217}
            fontSize={6.4}
            fill="#4E7A67"
            fontWeight="600"
          >
            CAM 01 · SIDE VIEW
          </SvgText>
          <SvgText
            x={338}
            y={217}
            fontSize={6.4}
            fill="#4E7A67"
            fontWeight="600"
            textAnchor="end"
          >
            FRAME 14 / 20
          </SvgText>
        </Svg>

        <View className="absolute left-3 top-3 flex-row items-center gap-1.5 rounded-full border border-white/15 bg-black/25 px-2 py-1">
          <ScanLine size={9} color="#7FC49E" strokeWidth={2.2} />
          <Text className="text-[7.5px] font-bold uppercase tracking-[0.8px] text-forest-200">
            YOLOv8 pose
          </Text>
        </View>
        <View className="absolute right-3 top-3 flex-row items-center gap-1.5 rounded-full border border-white/15 bg-black/25 px-2 py-1">
          <View className="h-1.5 w-1.5 rounded-full bg-forest-300" />
          <Text className="text-[7.5px] font-bold tracking-[0.4px] text-forest-200">
            17/17 · {Math.round(passage.detectionConfidence * 100)}%
          </Text>
        </View>
      </View>

      <View className="p-3.5">
        <View className="flex-row items-center justify-between">
          <Text className="text-[9px] font-bold uppercase tracking-[1.2px] text-ink-faint">
            Keypoint overlays
          </Text>
          <Text className="text-[9px] font-medium text-ink-faint">
            stride 2 of 2
          </Text>
        </View>

        <View className="mt-2 flex-row flex-wrap gap-1.5">
          {TOGGLES.map(({ key, label, icon: Icon }) => {
            const active = visible[key];
            return (
              <Pressable
                key={key}
                onPress={() => toggle(key)}
                accessibilityRole="switch"
                accessibilityState={{ checked: active }}
                accessibilityLabel={`Toggle ${label}`}
                className={cn(
                  'flex-row items-center gap-1.5 rounded-full border px-2.5 py-1.5',
                  active
                    ? 'border-forest-200 bg-forest-50'
                    : 'border-line bg-canvas',
                )}
                style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
              >
                <Icon
                  size={11}
                  color={active ? COLORS.forest[700] : COLORS.inkFaint}
                  strokeWidth={2.2}
                />
                <Text
                  className={cn(
                    'text-[9px] font-semibold',
                    active ? 'text-forest-700' : 'text-ink-faint',
                  )}
                >
                  {label}
                </Text>
                <View
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    active ? 'bg-forest-500' : 'bg-line',
                  )}
                />
              </Pressable>
            );
          })}
        </View>

        {visible.trails ? (
          <View className="mt-3 rounded-2xl border border-line bg-canvas p-3">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-[10.5px] font-bold text-ink">
                  Hoof trajectory trails
                </Text>
                <Text className="mt-0.5 text-[9px] text-ink-faint">
                  Vertical displacement y(t) · two stride cycles
                </Text>
              </View>
              <View
                className={cn(
                  'rounded-full border px-2 py-1',
                  trails.asymmetry > 15
                    ? 'border-crimson-200 bg-crimson-50'
                    : trails.asymmetry > 8
                      ? 'border-amber-200 bg-amber-50'
                      : 'border-forest-200 bg-forest-50',
                )}
              >
                <Text
                  className={cn(
                    'text-[8.5px] font-bold',
                    trails.asymmetry > 15
                      ? 'text-crimson-700'
                      : trails.asymmetry > 8
                        ? 'text-amber-700'
                        : 'text-forest-700',
                  )}
                >
                  Δ AUC {trails.asymmetry.toFixed(1)}%
                </Text>
              </View>
            </View>

            <Svg
              width="100%"
              height={112}
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              style={{ marginTop: 6 }}
            >
              {[0, 1, 2, 3].map((line) => {
                const y =
                  PLOT_TOP + (line / 3) * (PLOT_BOTTOM - PLOT_TOP);
                return (
                  <Line
                    key={`grid-${line}`}
                    x1={PLOT_LEFT}
                    y1={y}
                    x2={PLOT_RIGHT}
                    y2={y}
                    stroke="#DFE6E0"
                    strokeWidth={0.8}
                    strokeDasharray="2 4"
                  />
                );
              })}
              <Line
                x1={PLOT_LEFT}
                y1={PLOT_BOTTOM}
                x2={PLOT_RIGHT}
                y2={PLOT_BOTTOM}
                stroke="#C7D2CB"
                strokeWidth={1}
              />
              <Line
                x1={(PLOT_LEFT + PLOT_RIGHT) / 2}
                y1={PLOT_TOP}
                x2={(PLOT_LEFT + PLOT_RIGHT) / 2}
                y2={PLOT_BOTTOM}
                stroke="#C7D2CB"
                strokeWidth={0.8}
                strokeDasharray="3 4"
              />
              <SvgText x={4} y={14} fontSize={5.8} fill="#84938D" fontWeight="600">
                HOOF LIFT
              </SvgText>
              <SvgText
                x={PLOT_LEFT}
                y={99}
                fontSize={5.8}
                fill="#84938D"
                fontWeight="600"
              >
                0
              </SvgText>
              <SvgText
                x={(PLOT_LEFT + PLOT_RIGHT) / 2}
                y={99}
                fontSize={5.8}
                fill="#84938D"
                fontWeight="600"
                textAnchor="middle"
              >
                CYCLE 1
              </SvgText>
              <SvgText
                x={PLOT_RIGHT}
                y={99}
                fontSize={5.8}
                fill="#84938D"
                fontWeight="600"
                textAnchor="end"
              >
                CYCLE 2
              </SvgText>
              <Path
                d={trails.leftPath}
                fill="none"
                stroke={leftColor}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Path
                d={trails.rightPath}
                fill="none"
                stroke={rightColor}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>

            <View className="mt-1 flex-row flex-wrap items-center justify-between gap-2">
              <View className="flex-row items-center gap-3">
                <View className="flex-row items-center gap-1.5">
                  <View
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: leftColor }}
                  />
                  <Text className="text-[8.5px] font-semibold text-ink-muted">
                    Left · AUC {trails.leftAuc.toFixed(2)}
                  </Text>
                </View>
                <View className="flex-row items-center gap-1.5">
                  <View
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: rightColor }}
                  />
                  <Text className="text-[8.5px] font-semibold text-ink-muted">
                    Right · AUC {trails.rightAuc.toFixed(2)}
                  </Text>
                </View>
              </View>
              <Text className="text-[8px] font-medium text-ink-faint">
                {trails.affected === 'left' ? 'Left' : 'Right'} hind off-load
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </Card>
  );
}
