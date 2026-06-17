interface Segment {
  label: string;
  count: number;
  color: string;
}

interface Props {
  segments: Segment[];
  total: number;
  centerLabel?: string;
}

export function DonutChart({ segments, total, centerLabel }: Props) {
  const R = 54;
  const cx = 70;
  const cy = 70;
  const circumference = 2 * Math.PI * R;

  // Build arc segments
  let offset = 0; // start at top (rotated -90deg via transform)
  const arcs = segments.map(s => {
    const pct = total > 0 ? s.count / total : 0;
    const dash = pct * circumference;
    const gap  = circumference - dash;
    const arc  = { ...s, pct, dash, gap, offset };
    offset += dash;
    return arc;
  });

  const dominant = segments.reduce((a, b) => a.count >= b.count ? a : b, segments[0]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
      {/* SVG donut */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <svg width={140} height={140} style={{ transform: 'rotate(-90deg)' }}>
          {/* Background ring */}
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="#eceef1" strokeWidth={16} />
          {arcs.filter(a => a.count > 0).map((a, i) => (
            <circle
              key={i}
              cx={cx} cy={cy} r={R}
              fill="none"
              stroke={a.color}
              strokeWidth={16}
              strokeDasharray={`${a.dash} ${a.gap}`}
              strokeDashoffset={-a.offset}
              strokeLinecap="butt"
            />
          ))}
        </svg>
        {/* Center label */}
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: '#111c28', lineHeight: 1 }}>{total}</span>
          <span style={{ fontSize: 11, color: '#8b97a4', marginTop: 2 }}>{centerLabel ?? dominant?.label}</span>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {segments.map(s => {
          const pct = total > 0 ? Math.round(s.count / total * 100) : 0;
          return (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: '#54616f', flex: 1 }}>{s.label}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#111c28', fontFamily: 'monospace', minWidth: 20, textAlign: 'right' }}>{s.count}</span>
              <span style={{ fontSize: 12, color: '#8b97a4', minWidth: 36, textAlign: 'right' }}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
