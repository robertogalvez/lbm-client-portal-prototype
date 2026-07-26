'use client';

import { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger' | 'whatsapp';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, React.CSSProperties> = {
  primary:  { background: '#FF6000', color: '#fff', border: '1px solid transparent' },
  outline:  { background: '#fff', color: '#111c28', border: '1px solid #d4dbe2' },
  ghost:    { background: 'transparent', color: '#54616f', border: '1px solid transparent' },
  danger:   { background: '#fdedeb', color: '#cf3f36', border: '1px solid #fdedeb' },
  whatsapp: { background: '#1FA855', color: '#fff', border: '1px solid transparent' },
};

const PADS: Record<Size, string> = { sm: '7px 12px', md: '9px 15px', lg: '12px 16px' };
const SIZES: Record<Size, number> = { sm: 13, md: 13.5, lg: 15 };

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  full?: boolean;
}

export function Button({ children, variant = 'primary', size = 'md', iconLeft, iconRight, full, disabled, ...rest }: ButtonProps) {
  const style: React.CSSProperties = {
    fontFamily: 'var(--font-ui, "Plus Jakarta Sans", sans-serif)',
    fontWeight: 600,
    fontSize: SIZES[size],
    lineHeight: 1,
    borderRadius: 8,
    padding: PADS[size],
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    whiteSpace: 'nowrap',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background 130ms, transform 130ms',
    width: full ? '100%' : undefined,
    ...(disabled ? { background: '#eef1f4', color: '#8b97a4', border: '1px solid #e7ebef' } : VARIANTS[variant]),
  };

  return (
    <button
      // Defaults ahead of {...rest} so a caller can still pass type="submit".
      type="button"
      style={style}
      disabled={disabled}
      onMouseDown={e => { if (!disabled) e.currentTarget.style.transform = 'scale(0.97)'; }}
      onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
      {...rest}
    >
      {iconLeft}
      {children}
      {iconRight}
    </button>
  );
}
