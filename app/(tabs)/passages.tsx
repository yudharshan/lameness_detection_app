import { useRouter } from 'expo-router';
import { Info, ListOrdered } from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { PassageCard } from '@/components/passage-card';
import { EmptyState } from '@/components/ui/empty-state';
import { ScreenHeader } from '@/components/ui/screen-header';
import { COLORS } from '@/constants/theme';
import { cn } from '@/lib/cn';
import { RISK_ORDER } from '@/lib/herd';
import { useHerdStore } from '@/store/herdStore';
import type { RiskFilter } from '@/types/cattle';

const FILTERS: RiskFilter[] = ['All', ...RISK_ORDER];

export default function PassagesScreen() {
  const router = useRouter();
  const passages = useHerdStore((state) => state.passages);
  const riskFilter = useHerdStore((state) => state.riskFilter);
  const filterByRisk = useHerdStore((state) => state.filterByRisk);
  const selectedPassageId = useHerdStore((state) => state.selectedPassageId);
  const selectPassage = useHerdStore((state) => state.selectPassage);

  const ordered = useMemo(
    () => [...passages].sort((a, b) => a.entryOrder - b.entryOrder),
    [passages],
  );

  const filtered = useMemo(
    () =>
      riskFilter === 'All'
        ? ordered
        : ordered.filter((passage) => passage.riskLevel === riskFilter),
    [ordered, riskFilter],
  );

  const counts = useMemo(() => {
    const base: Record<RiskFilter, number> = {
      All: ordered.length,
      Healthy: 0,
      'Mild Risk': 0,
      'Moderate Lame': 0,
      'Severe Lame': 0,
      'Critically Lame': 0,
    };
    for (const passage of ordered) {
      base[passage.riskLevel] += 1;
    }
    return base;
  }, [ordered]);

  const maxOrder = ordered.length > 0 ? ordered[ordered.length - 1].entryOrder : 0;

  const openPassage = (passageId: string) => {
    selectPassage(passageId);
    router.push('/analytics');
  };

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader
        eyebrow="Sequential capture"
        title="Passage Stream"
        right={
          <View className="mt-0.5 items-center rounded-2xl border border-line bg-surface px-3 py-2">
            <Text className="text-[8px] font-bold tracking-[1.1px] text-ink-faint">
              SEQUENCE
            </Text>
            <Text className="text-[12px] font-bold leading-5 text-ink">
              C1 → C{maxOrder}
            </Text>
          </View>
        }
      />

      <View className="border-b border-line">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingVertical: 11,
            gap: 8,
          }}
        >
          {FILTERS.map((filter) => {
            const active = filter === riskFilter;
            return (
              <Pressable
                key={filter}
                onPress={() => filterByRisk(filter)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Filter passages by ${filter}`}
                className={cn(
                  'min-h-[38px] flex-row items-center gap-1.5 rounded-full border px-3.5',
                  active
                    ? 'border-forest-900 bg-forest-900'
                    : 'border-line bg-surface',
                )}
                style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
              >
                <Text
                  className={cn(
                    'text-[11.5px] font-semibold',
                    active ? 'text-white' : 'text-ink-muted',
                  )}
                >
                  {filter}
                </Text>
                <View
                  className={cn(
                    'min-w-[18px] items-center rounded-full px-1 py-0.5',
                    active ? 'bg-white/15' : 'bg-canvas',
                  )}
                >
                  <Text
                    className={cn(
                      'text-[9px] font-bold',
                      active ? 'text-amber-200' : 'text-ink-faint',
                    )}
                  >
                    {counts[filter]}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      >
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="text-[11.5px] text-ink-muted">
            Showing{' '}
            <Text className="font-semibold text-ink">{filtered.length}</Text> of{' '}
            {ordered.length} passages
          </Text>
          <View className="flex-row items-center gap-1.5">
            <Info size={11} color={COLORS.inkFaint} strokeWidth={2} />
            <Text className="text-[10px] text-ink-faint">
              Tap to inspect evidence
            </Text>
          </View>
        </View>

        {filtered.length === 0 ? (
          <EmptyState
            icon={ListOrdered}
            title="No passages in this band"
            body="Nothing has been scored in this risk band yet. Reset the filter to see the full sequential run."
          />
        ) : (
          filtered.map((passage, index) => (
            <Animated.View
              key={passage.id}
              entering={FadeInDown.duration(320).delay(
                Math.min(index, 6) * 45,
              )}
            >
              <PassageCard
                passage={passage}
                isLast={index === filtered.length - 1}
                isSelected={passage.id === selectedPassageId}
                onPress={() => openPassage(passage.id)}
              />
            </Animated.View>
          ))
        )}

        <View className="mt-2 rounded-3xl border border-forest-100 bg-forest-50 p-5">
          <View className="flex-row gap-2.5">
            <View className="mt-0.5 h-7 w-7 items-center justify-center rounded-xl bg-forest-100">
              <Info size={14} color={COLORS.forest[700]} strokeWidth={2.2} />
            </View>
            <View className="flex-1">
              <Text className="text-[12px] font-bold text-forest-800">
                How the stream is built
              </Text>
              <Text className="mt-1 text-[11px] leading-[17px] text-forest-700">
                A crossing at the virtual line increments the entry order and
                opens a clip. Frames are sampled at the stride cycle, then
                motion-blurred or occluded frames are purged before the
                locomotion score is computed.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
