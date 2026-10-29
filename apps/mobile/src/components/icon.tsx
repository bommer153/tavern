import { FILLED_ICONS, ICONS, type IconName } from '@tavern/shared';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

export type { IconName };

/** Tavern's own icon set — the same paths the web draws, from @tavern/shared. */
export function Icon({ name, size = 20, color, filled, label }: { name: IconName; size?: number; color: string; filled?: boolean; label?: string }) {
  const fill = filled ?? FILLED_ICONS.has(name);
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessible={!!label}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
    >
      <Path d={ICONS[name]} fill={fill ? color : 'none'} stroke={fill && filled === undefined ? 'none' : color} strokeWidth={1.75} strokeLinecap="square" strokeLinejoin="miter" />
    </Svg>
  );
}

/** Pointy-top hexagon points for a w×h box (Tavern's motif). */
export const hexPoints = (w: number, h: number, inset = 0) =>
  [
    [w / 2, inset],
    [w - w * 0.067 - inset, h * 0.25],
    [w - w * 0.067 - inset, h * 0.75],
    [w / 2, h - inset],
    [w * 0.067 + inset, h * 0.75],
    [w * 0.067 + inset, h * 0.25],
  ]
    .map((p) => p.join(','))
    .join(' ');

/**
 * Rounded surface background (border included). React Native views can round themselves, but this keeps one
 * call site for every plate: place it first inside a container and children render above it.
 */
export function ChamferBg({ fill, stroke, cut = 10 }: { fill: string; stroke?: string; cut?: number }) {
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: fill, borderRadius: Math.round(cut * 1.3), borderWidth: stroke ? 1 : 0, borderColor: stroke }]} />;
}
