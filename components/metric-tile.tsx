import type { LucideIcon } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { RangeBar } from '@/components/ui/range-bar';
import { STATUS_META, type MetricDefinition } from '@/lib/metrics';

interface MetricTileProps {
  definition: MetricDefinition;
  value: number;
  icon: LucideIcon;
}

/** Compact evidence tile used in the 2×2 biomechanics grid. */
export function MetricTile({ definition, value, icon: Icon }: MetricTileProps) {
  const status = definition.getStatus(value);
  const meta = STATUS_META[status];
  const formatted = value.toFixed(definition.decimals);

  return (
    <Card padded={false} className="flex-1 p-4">
      <View className="flex-row items-center gap-1.5">
        <Icon size={12} color={meta.hex} strokeWidth={2.2} />
        <Text className="flex-1 text-[9px] font-bold uppercase tracking-[0.9px] text-ink-faint">
          {definition.shortLabel}
        </Text>
        <View
          className={meta.marker}
          style={{ width: 5, height: 5, borderRadius: 2.5 }}
        />
      </View>

      <View className="mt-2 flex-row items-baseline gap-0.5">
        <Text className="text-[26px] font-bold leading-[30px] tracking-[-1px] text-ink">
          {formatted}
        </Text>
        <Text className="text-[11px] font-medium text-ink-muted">
          {definition.unit}
        </Text>
      </View>

      <RangeBar
        className="mt-1.5"
        value={value}
        domain={definition.domain}
        normal={definition.normal}
        color={meta.hex}
      />

      <Text className={`mt-1.5 text-[9.5px] font-semibold ${meta.text}`}>
        {meta.label}
      </Text>
    </Card>
  );
}
