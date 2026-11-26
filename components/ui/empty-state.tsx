import type { LucideIcon } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { COLORS } from '@/constants/theme';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  body: string;
}

export function EmptyState({ icon: Icon, title, body }: EmptyStateProps) {
  return (
    <View className="items-center rounded-3xl border border-dashed border-line bg-white/60 px-6 py-10">
      <View className="mb-3 h-12 w-12 items-center justify-center rounded-2xl bg-forest-50">
        <Icon size={22} color={COLORS.forest[600]} strokeWidth={2} />
      </View>
      <Text className="text-[14px] font-semibold text-ink">{title}</Text>
      <Text className="mt-1 max-w-[260px] text-center text-[12px] leading-[18px] text-ink-muted">
        {body}
      </Text>
    </View>
  );
}
