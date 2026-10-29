import { FILLED_ICONS, ICONS, type IconName } from '@tavern/shared';
import type { CSSProperties } from 'react';

export type { IconName };

/** Tavern's own icon set (paths live in @tavern/shared so mobile draws the same shapes). Decorative unless `label` is given. */
export function Icon({ name, size = 20, label, className, style, filled: fill }: { name: IconName; size?: number; label?: string; className?: string; style?: CSSProperties; filled?: boolean }) {
  const filled = fill ?? FILLED_ICONS.has(name);
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      style={{ flexShrink: 0, ...style }}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled && !fill ? 'none' : 'currentColor'}
      strokeWidth={1.75}
      strokeLinecap="square"
      strokeLinejoin="miter"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={ICONS[name]} />
    </svg>
  );
}
