'use client';

interface ToggleProps {
  checked: boolean;
  /** Accessible name. The adjacent visual text is not wired up as a <label>, so pass it here. */
  label: string;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
}

/**
 * Switch-style toggle. A real <button role="switch"> rather than a styled div,
 * so it takes focus, responds to Enter/Space, and announces its on/off state.
 */
export function Toggle({ checked, label, onChange, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        background: checked ? '#FF6000' : '#d4dbe2',
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.2s',
        flexShrink: 0,
        padding: 0,
        border: 'none',
      }}
    >
      {/* span, not div: a button may only contain phrasing content */}
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: checked ? 21 : 3,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,.2)',
        }}
      />
    </button>
  );
}
