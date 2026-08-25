'use client';

import { T } from './tokens';

interface SegmentedControlProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  label: string;
}

/** Pill group — the Pipeline range and the video ledger scope. One option active at a time. */
export function SegmentedControl<V extends string>({ options, value, onChange, label }: SegmentedControlProps<V>) {
  return (
    <div role="group" aria-label={label} style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 2, background: T.track, borderRadius: 9, padding: 4, maxWidth: '100%' }}>
      {options.map(o => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            style={{
              border: 'none', cursor: 'pointer',
              padding: '6px 13px', borderRadius: 7,
              fontFamily: 'inherit', fontSize: 12.5, fontWeight: active ? 600 : 500,
              color: active ? T.ink : T.ink2,
              background: active ? T.surface : 'transparent',
              boxShadow: active ? '0 1px 3px rgba(17,28,40,0.12)' : 'none',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
