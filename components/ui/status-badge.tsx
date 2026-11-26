import { Check, Flag, Loader } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { STATUS_META } from '@/lib/herd';
import { cn } from '@/lib/cn';
import type { PassageStatus } from '@/types/cattle';

interface StatusBadgeProps {
  status: PassageStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const meta = STATUS_META[status];
  const Icon = status === 'Flagged' ? Flag : status === 'Processing' ? Loader : Check;

  return (
    <View
      className={cn(
        'flex-row items-center gap-1.5 rounded-full border px-2 py-1',
        meta.badge,
        className,
      )}
    >
      <Icon size={11} color={meta.hex} strokeWidth={2.4} />
      <Text className={cn('text-[10px] font-semibold', meta.text)}>
        {meta.label}
      </Text>
    </View>
  );
}

export function StatusDot({
  status,
  size = 7,
}: {
  status: PassageStatus;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: STATUS_META[status].hex,
      }}
    />
  );
}
