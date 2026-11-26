import { StyleSheet, View, type ViewProps } from 'react-native';

import { cn } from '@/lib/cn';

interface CardProps extends ViewProps {
  className?: string;
  /** Tighter padding for compact list rows. */
  padded?: boolean;
}

export function Card({ className, padded = true, style, ...rest }: CardProps) {
  return (
    <View
      {...rest}
      className={cn(
        'rounded-3xl border border-line bg-surface',
        padded && 'p-5',
        className,
      )}
      style={[styles.card, style]}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    shadowColor: '#0F1F1A',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
});
