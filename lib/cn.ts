/** Tiny class-name joiner for conditional NativeWind classes. */
export function cn(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(' ');
}
