'use client';

import { T } from './tokens';

export interface TabDef<V extends string> {
  value: V;
  label: string;
  /** Optional count badge. `tone: 'danger'` flags a tab that is reporting a problem. */
  badge?: string | number;
  badgeTone?: 'danger' | 'mute';
}

interface TabsProps<V extends string> {
  tabs: readonly TabDef<V>[];
  value: V;
  onChange: (next: V) => void;
  label: string;
}

/** Underline tabs with count badges. Callers keep the active tab in the URL. */
export function Tabs<V extends string>({ tabs, value, onChange, label }: TabsProps<V>) {
  return (
    <div role="tablist" aria-label={label} style={{ display: 'flex', gap: 26, borderBottom: `1px solid ${T.lineStrong}` }}>
      {tabs.map(t => {
        const active = t.value === value;
        const danger = t.badgeTone === 'danger' && active;
        return (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: '12px 4px 14px', marginBottom: -1,
              fontFamily: 'inherit', fontSize: 14.5, fontWeight: active ? 600 : 500,
              color: active ? T.ink : T.ink2,
              borderBottom: `2px solid ${active ? T.brand : 'transparent'}`,
            }}
          >
            {t.label}
            {t.badge !== undefined && (
              <span style={{
                fontSize: 11.5, fontWeight: 600, padding: '2px 7px', borderRadius: 6,
                background: danger ? '#fdedeb' : T.dividerLight,
                color: danger ? T.danger : T.ink3,
              }}>
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
