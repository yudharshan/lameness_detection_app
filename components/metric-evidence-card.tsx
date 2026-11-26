import type { LucideIcon } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { RangeBar } from '@/components/ui/range-bar';
import { cn } from '@/lib/cn';
import { STATUS_META, type MetricDefinition } from '@/lib/metrics';

interface MetricEvidenceCardProps {
  letter: 'A' | 'B' | 'C' | 'D';
  title: string;
  subtitle: string;
  formula: string;
  normalLabel: string;
  flagLabel: string;
  statusLabels: Record<'normal' | 'watch' | 'flag', string>;
  definition: MetricDefinition;
  value: number;
  icon: LucideIcon;
  className?: string;
}

/**
 * Full-width explainability card: measured value, sound-vs-observed ranges,
 * the underlying formula and a plain-language interpretation.
 */
export function MetricEvidenceCard({
  letter,
  title,
  subtitle,
  formula,
  normalLabel,
  flagLabel,
  statusLabels,
  definition,
  value,
  icon: Icon,
  className,
}: MetricEvidenceCardProps) {
  const status = definition.getStatus(value);
  const meta = STATUS_META[status];
  const formatted = `${value.toFixed(definition.decimals)}${definition.unit}`;

  return (
    <Card padded={false} className={cn('p-4', className)}>
      <View className="flex-row items-start gap-2.5">
        <View className="h-7 w-7 items-center justify-center rounded-lg bg-forest-900">
          <Text className="text-[12px] font-bold text-white">{letter}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-[12.5px] font-bold leading-4 tracking-[-0.1px] text-ink">
            {title}
          </Text>
          <View className="mt-1 flex-row items-center gap-1.5">
            <Icon size={9.5} color={meta.hex} strokeWidth={2.2} />
            <Text className="flex-1 text-[9px] text-ink-faint">{subtitle}</Text>
          </View>
        </View>
        <View
          className={cn(
            'flex-row items-center gap-1 rounded-full border px-2 py-1',
            meta.badge,
          )}
        >
          <View className={cn('h-1.5 w-1.5 rounded-full', meta.marker)} />
          <Text className={cn('text-[9px] font-bold', meta.text)}>
            {statusLabels[status]}
          </Text>
        </View>
      </View>

      <View className="mt-3 flex-row items-end justify-between">
        <View>
          <Text className="text-[7.5px] font-bold uppercase tracking-[1px] text-ink-faint">
            Measured
          </Text>
          <Text className="mt-0.5 text-[26px] font-bold leading-[30px] tracking-[-0.8px] text-ink">
            {formatted}
          </Text>
        </View>
        <View className="mb-0.5 items-end">
          <Text className="text-[7.5px] font-bold uppercase tracking-[1px] text-ink-faint">
            Normal
          </Text>
          <Text className="mt-0.5 text-[12px] font-bold text-forest-700">
            {normalLabel}
          </Text>
        </View>
      </View>

      <RangeBar
        value={value}
        domain={definition.domain}
        normal={definition.normal}
        color={meta.hex}
        className="mt-2.5"
      />

      <View className="mt-1.5 flex-row items-center justify-between">
        <Text className="text-[8.5px] font-medium text-ink-faint">
          Sound band {normalLabel}
        </Text>
        <Text
          className={cn(
            'text-[8.5px] font-semibold',
            status === 'flag'
              ? 'text-crimson-700'
              : status === 'watch'
                ? 'text-amber-700'
                : 'text-forest-700',
          )}
        >
          {flagLabel}
        </Text>
      </View>

      <View className="mt-3 rounded-xl border border-forest-100 bg-forest-50 px-2.5 py-2">
        <Text className="text-[7px] font-bold uppercase tracking-[1.1px] text-forest-600">
          Formula
        </Text>
        <Text className="mt-1 text-[10px] font-semibold leading-[15px] text-forest-900">
          {formula}
        </Text>
      </View>

      <View className="mt-2.5 flex-row gap-2 border-t border-line pt-2.5">
        <View className={cn('mt-1 h-1.5 w-1.5 rounded-full', meta.marker)} />
        <Text className="flex-1 text-[10px] leading-[15px] text-ink-muted">
          {definition.interpret(value)}
        </Text>
      </View>
    </Card>
  );
}
