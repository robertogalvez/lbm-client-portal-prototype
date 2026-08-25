import { initialsOf, avatarColorOf } from '@/lib/admin-views';
import type { CSSProperties } from 'react';

interface AvatarProps {
  name: string;
  size?: number;
  /** Square-ish tile (client detail header) instead of a circle. */
  radius?: number;
  color?: string;
}

/** Initials on a stable per-name colour. Replaces the copies that had drifted across four files. */
export function Avatar({ name, size = 34, radius, color }: AvatarProps) {
  const style: CSSProperties = {
    width: size, height: size, flexShrink: 0,
    borderRadius: radius ?? 999,
    background: color ?? avatarColorOf(name),
    color: '#fff',
    fontSize: Math.round(size * 0.36),
    fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    letterSpacing: '0.01em',
  };
  return <span style={style} aria-hidden>{initialsOf(name)}</span>;
}
