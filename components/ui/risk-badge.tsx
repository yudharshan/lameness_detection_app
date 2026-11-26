import { Text, View } from 'react-native';

import { RISK_META } from '@/lib/herd';
import { cn } from '@/lib/cn';
import type { RiskLevel } from '@/types/cattle';

interface RiskBadgeProps {
  risk: RiskLevel;
  compact?: boolean;
  className?: string;
}

export function RiskBadge({ risk, compact = false, className }: RiskBadgeProps) {
  const meta = RISK_META[risk];

  return (
    <View
      className={cn(
        'flex-row items-center gap-1.5 rounded-full border px-2.5 py-1',
        meta.badge,
        className,
      )}
    >
      <View className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
      <Text
        className={cn('text-[11px] font-semibold tracking-[0.2px]', meta.text)}
      >
        {compact ? meta.short : meta.label}
      </Text>
    </View>
  );
}
