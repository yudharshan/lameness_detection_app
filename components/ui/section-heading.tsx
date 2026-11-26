import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

interface SectionHeadingProps {
  title: string;
  meta?: string;
  right?: ReactNode;
}

export function SectionHeading({ title, meta, right }: SectionHeadingProps) {
  return (
    <View className="mb-3 flex-row items-center justify-between gap-3">
      <View className="flex-1">
        <Text className="text-[15px] font-bold tracking-[-0.2px] text-ink">
          {title}
        </Text>
        {meta ? (
          <Text className="mt-0.5 text-[11.5px] text-ink-faint">{meta}</Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function Eyebrow({ children }: { children: string }) {
  return (
    <Text className="text-[9.5px] font-bold uppercase tracking-[1.6px] text-ink-faint">
      {children}
    </Text>
  );
}
