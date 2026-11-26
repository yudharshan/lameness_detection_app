import { Pressable, Text, View, type PressableProps } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

import { cn } from '@/lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'amber';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  label: string;
  icon?: LucideIcon;
  variant?: ButtonVariant;
  className?: string;
}

const VARIANT_STYLES: Record<
  ButtonVariant,
  { container: string; label: string; icon: string }
> = {
  primary: {
    container: 'bg-forest-900 border-forest-900',
    label: 'text-white',
    icon: '#FFFFFF',
  },
  secondary: {
    container: 'bg-surface border-line',
    label: 'text-ink',
    icon: '#0F1F1A',
  },
  amber: {
    container: 'bg-amber-500 border-amber-500',
    label: 'text-forest-950',
    icon: '#04231A',
  },
};

export function Button({
  label,
  icon: Icon,
  variant = 'primary',
  className,
  disabled,
  ...rest
}: ButtonProps) {
  const tone = VARIANT_STYLES[variant];

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={rest.accessibilityLabel ?? label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      className={cn(
        'min-h-[48px] flex-row items-center justify-center gap-2 rounded-2xl border px-4 py-3',
        tone.container,
        disabled && 'opacity-45',
        className,
      )}
      style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}
    >
      {Icon ? (
        <View className="h-5 w-5 items-center justify-center">
          <Icon size={18} color={tone.icon} strokeWidth={2.2} />
        </View>
      ) : null}
      <Text className={cn('text-[14px] font-semibold', tone.label)}>
        {label}
      </Text>
    </Pressable>
  );
}
