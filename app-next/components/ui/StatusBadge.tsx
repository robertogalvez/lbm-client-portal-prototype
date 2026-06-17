type Tone = 'blue' | 'amber' | 'green' | 'red' | 'slate' | 'violet';

const COOL: Record<Tone, [string, string]> = {
  blue:   ['#2563eb', '#eaf0ff'],
  amber:  ['#a86a00', '#fbf1dc'],
  green:  ['#14805f', '#e6f4ee'],
  red:    ['#cf3f36', '#fdedeb'],
  slate:  ['#54616f', '#eef1f4'],
  violet: ['#7c66c4', '#efeafa'],
};

interface StatusBadgeProps {
  children: React.ReactNode;
  tone?: Tone;
  dot?: boolean;
}

export function StatusBadge({ children, tone = 'slate', dot = true }: StatusBadgeProps) {
  const [fg, bg] = COOL[tone];
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 12, fontWeight: 600, lineHeight: 1.35,
        padding: '4px 10px', borderRadius: 6,
        color: fg, background: bg, whiteSpace: 'nowrap',
      }}
    >
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: fg, flexShrink: 0 }} />}
      {children}
    </span>
  );
}

// Maps ClickUp status strings to semantic tones
export function statusTone(status: string): Tone {
  const s = status.toLowerCase();
  if (s.includes('in progress') && s.includes('correction')) return 'red';
  if (s.includes('in progress')) return 'blue';
  if (s.includes('qc') || s.includes('quality')) return 'violet';
  if (s.includes('client review') || s.includes('qc final')) return 'amber';
  if (s.includes('ready to be posted')) return 'green';
  if (s.includes('posted')) return 'green';
  return 'slate';
}
