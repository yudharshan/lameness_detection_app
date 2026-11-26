import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight, ArrowUpRight, ScanLine, ShieldAlert } from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { PassageRow } from '@/components/passage-card';
import { Card } from '@/components/ui/card';
import { LiveDot } from '@/components/ui/live-dot';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SectionHeading } from '@/components/ui/section-heading';
import { COLORS } from '@/constants/theme';
import {
  computeHerdSummary,
  formatClock,
  RISK_META,
  RISK_ORDER,
  soundnessLabel,
} from '@/lib/herd';
import { useHerdStore } from '@/store/herdStore';

export default function DashboardScreen() {
  const router = useRouter();
  const passages = useHerdStore((state) => state.passages);
  const selectPassage = useHerdStore((state) => state.selectPassage);

  const summary = useMemo(() => computeHerdSummary(passages), [passages]);
  const recent = useMemo(
    () =>
      [...passages]
        .sort((a, b) => b.entryOrder - a.entryOrder)
        .slice(0, 3),
    [passages],
  );
  const flagged = useMemo(
    () =>
      passages
        .filter((passage) => passage.status === 'Flagged')
        .sort((a, b) => b.locomotionScore - a.locomotionScore)[0] ?? null,
    [passages],
  );

  const openPassage = (passageId: string) => {
    selectPassage(passageId);
    router.push('/analytics');
  };

  const latest = summary.latestPassage;
  const sessionDate = latest ? new Date(latest.passageTime) : new Date();
  const dayLabel = sessionDate.toLocaleDateString('en-GB', { day: '2-digit' });
  const monthLabel = sessionDate
    .toLocaleDateString('en-GB', { month: 'short' })
    .toUpperCase();

  const totalForBars = Math.max(1, summary.total);

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader
        eyebrow="HerdSight · Barn 3"
        title="Herd Dashboard"
        right={
          <View className="mt-0.5 items-center rounded-2xl border border-line bg-surface px-3 py-2">
            <Text className="text-[8px] font-bold tracking-[1.2px] text-ink-faint">
              {monthLabel}
            </Text>
            <Text className="text-[15px] font-bold leading-5 text-ink">
              {dayLabel}
            </Text>
          </View>
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      >
        <LinearGradient
          colors={['#04231A', '#06301F', '#0F5136']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 28, padding: 20, overflow: 'hidden' }}
        >
          <View className="absolute -right-12 -top-16 h-44 w-44 rounded-full border border-white/10" />
          <View className="absolute -right-2 -top-6 h-24 w-24 rounded-full border border-white/10" />

          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1">
              <LiveDot size={5} />
              <Text className="text-[8.5px] font-bold tracking-[1.4px] text-amber-200">
                LIVE TRIGGER
              </Text>
            </View>
            <Text className="text-[9.5px] font-medium text-forest-300">
              Chute A · 4.2 m line
            </Text>
          </View>

          <Text className="mt-5 text-[9.5px] font-bold uppercase tracking-[1.7px] text-forest-300">
            Herd soundness index
          </Text>

          <View className="mt-0.5 flex-row items-end gap-1.5">
            <Text className="text-[54px] font-bold leading-[58px] tracking-[-2.5px] text-white">
              {summary.soundnessIndex}
            </Text>
            <Text className="mb-2.5 text-[13px] font-semibold text-forest-300">
              / 100
            </Text>
            <View className="mb-3 ml-auto rounded-full border border-amber-400/30 bg-amber-400/15 px-2.5 py-1">
              <Text className="text-[9.5px] font-bold text-amber-200">
                {soundnessLabel(summary.soundnessIndex)}
              </Text>
            </View>
          </View>

          <View className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <View
              className="h-full rounded-full bg-amber-400"
              style={{ width: `${summary.soundnessIndex}%` }}
            />
          </View>

          <View className="mt-2 flex-row items-center justify-between">
            <Text className="text-[9.5px] text-forest-300">
              {summary.total} cows this session
            </Text>
            <Text className="text-[9.5px] text-forest-300">
              {summary.atRisk} at risk · {summary.flagged} flagged
            </Text>
          </View>

          <View className="mt-4 flex-row border-t border-white/10 pt-3.5">
            <View className="flex-1">
              <Text className="text-[8px] font-bold uppercase tracking-[1px] text-forest-300">
                Avg score
              </Text>
              <Text className="mt-1 text-[16px] font-bold text-white">
                {summary.averageScore}
                <Text className="text-[10px] font-medium text-forest-300">
                  {' '}
                  / 5
                </Text>
              </Text>
            </View>
            <View className="w-px bg-white/10" />
            <View className="flex-1 pl-3">
              <Text className="text-[8px] font-bold uppercase tracking-[1px] text-forest-300">
                At risk
              </Text>
              <Text className="mt-1 text-[16px] font-bold text-white">
                {summary.atRisk}
              </Text>
            </View>
            <View className="w-px bg-white/10" />
            <View className="flex-1 pl-3">
              <Text className="text-[8px] font-bold uppercase tracking-[1px] text-forest-300">
                Analyzed
              </Text>
              <Text className="mt-1 text-[16px] font-bold text-white">
                {summary.analyzed}
              </Text>
            </View>
            <View className="w-px bg-white/10" />
            <View className="flex-1 pl-3">
              <Text className="text-[8px] font-bold uppercase tracking-[1px] text-forest-300">
                Processing
              </Text>
              <Text className="mt-1 text-[16px] font-bold text-white">
                {summary.processing}
              </Text>
            </View>
          </View>
        </LinearGradient>

        <Card className="mt-4">
          <SectionHeading
            title="Risk distribution"
            meta={`${summary.total} sequential passages · C1 → C${summary.total}`}
            right={
              <View className="flex-row items-center gap-1.5">
                <LiveDot size={4} color={COLORS.forest[500]} />
                <Text className="text-[9.5px] font-semibold text-forest-700">
                  Live
                </Text>
              </View>
            }
          />

          <View className="h-2.5 flex-row overflow-hidden rounded-full bg-line">
            {RISK_ORDER.map((risk) => {
              const count = summary.distribution[risk];
              if (count === 0) return null;
              return (
                <View
                  key={risk}
                  className={RISK_META[risk].bar}
                  style={{ flex: count }}
                />
              );
            })}
          </View>

          <View className="mt-4 gap-3">
            {RISK_ORDER.map((risk) => {
              const meta = RISK_META[risk];
              const count = summary.distribution[risk];
              return (
                <View key={risk} className="flex-row items-center gap-2.5">
                  <View className={`h-2 w-2 rounded-full ${meta.dot}`} />
                  <Text className="flex-1 text-[12px] font-medium text-ink">
                    {risk}
                  </Text>
                  <Text className="text-[10.5px] text-ink-faint">
                    {((count / totalForBars) * 100).toFixed(1)}%
                  </Text>
                  <Text className="w-5 text-right text-[12px] font-bold text-ink">
                    {count}
                  </Text>
                </View>
              );
            })}
          </View>

          <Pressable
            onPress={() => router.push('/passages')}
            accessibilityRole="button"
            accessibilityLabel="Open the sequential passage stream"
            className="mt-4 flex-row items-center justify-center gap-1.5 border-t border-line pt-3.5"
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Text className="text-[11px] font-semibold text-forest-700">
              Open sequential stream
            </Text>
            <ArrowRight size={13} color={COLORS.forest[700]} strokeWidth={2.4} />
          </Pressable>
        </Card>

        <Card className="mt-3 p-4">
          <View className="flex-row items-center gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-2xl border border-forest-100 bg-forest-50">
              <ScanLine size={20} color={COLORS.forest[700]} strokeWidth={2} />
            </View>
            <View className="flex-1">
              <View className="flex-row items-center gap-1.5">
                <LiveDot size={4.5} />
                <Text className="text-[8.5px] font-bold tracking-[1.4px] text-forest-700">
                  VIRTUAL TRIGGER ARMED
                </Text>
              </View>
              <Text className="mt-0.5 text-[12.5px] font-semibold text-ink">
                {latest
                  ? `Last crossing ${latest.tagId} at ${formatClock(latest.passageTime)}`
                  : 'Waiting for the first crossing'}
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-[8.5px] font-bold uppercase tracking-[1px] text-ink-faint">
                In queue
              </Text>
              <Text className="text-[19px] font-bold text-ink">
                {summary.processing}
              </Text>
            </View>
          </View>
        </Card>

        {flagged ? (
          <Pressable
            onPress={() => openPassage(flagged.id)}
            accessibilityRole="button"
            accessibilityLabel={`Review flagged passage ${flagged.tagId}`}
            className="mt-3 flex-row items-center gap-3 rounded-3xl bg-forest-950 p-4"
            style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
          >
            <View className="h-11 w-11 items-center justify-center rounded-2xl border border-crimson-400/30 bg-crimson-500/20">
              <ShieldAlert size={20} color="#FCA5A5" strokeWidth={2} />
            </View>
            <View className="flex-1">
              <Text className="text-[8.5px] font-bold tracking-[1.4px] text-crimson-300">
                NEEDS ATTENTION
              </Text>
              <Text className="mt-0.5 text-[13.5px] font-semibold text-white">
                {flagged.tagId} flagged · score {flagged.locomotionScore}/5
              </Text>
              <Text className="mt-0.5 text-[10.5px] text-forest-300">
                Asymmetry {flagged.metrics.asymmetryIndex.toFixed(1)}% · review
                the evidence trail
              </Text>
            </View>
            <ArrowUpRight size={18} color={COLORS.amber[400]} strokeWidth={2.2} />
          </Pressable>
        ) : null}

        <View className="mt-6">
          <SectionHeading
            title="Recent passages"
            meta="Newest crossings first"
            right={
              <Pressable
                onPress={() => router.push('/passages')}
                accessibilityRole="button"
                accessibilityLabel="View all passages"
                hitSlop={8}
              >
                <Text className="text-[10.5px] font-semibold text-forest-700">
                  View all
                </Text>
              </Pressable>
            }
          />
          <Card className="px-4 py-0">
            {recent.map((passage, index) => (
              <View
                key={passage.id}
                className={index > 0 ? 'border-t border-line' : undefined}
              >
                <PassageRow
                  passage={passage}
                  onPress={() => openPassage(passage.id)}
                />
              </View>
            ))}
          </Card>
        </View>

        <Text className="mt-5 px-1 text-center text-[9.5px] leading-4 text-ink-faint">
          Hardware-free pipeline · monocular RGB → pose estimation → gait
          kinematics. Scores are decision support, not a veterinary diagnosis.
        </Text>
      </ScrollView>
    </View>
  );
}
