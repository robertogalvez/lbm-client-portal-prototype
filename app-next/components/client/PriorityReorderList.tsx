'use client';

import { useState } from 'react';

interface PriorityItem {
  id: string;
  node: React.ReactNode;
}

function ordinal(n: number): string {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

// Up/down reordering (no drag-and-drop dependency — this needs to work
// reliably on mobile touch, and a small button pair does that without
// adding a library). Each move optimistically reorders locally, then saves
// the full new order — the server is the source of truth for rank and for
// translating it into ClickUp's Priority field (see app/api/client/priority).
export function PriorityReorderList({ items: initialItems }: { items: PriorityItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [saving, setSaving] = useState(false);

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    save(next);
  }

  async function save(next: PriorityItem[]) {
    setSaving(true);
    try {
      await fetch('/api/client/priority', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: next.map(i => i.id) }),
      });
    } catch {
      // Best-effort — a subsequent reorder (or a page refresh) resyncs.
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((item, i) => (
        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Rank badge + move buttons — shows position clearly ("1st Priority")
              so the client knows their order at a glance, not just which arrow to press. */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0, minWidth: 52 }}>
            <div style={rankBadgeStyle(i)}>
              {ordinal(i + 1)}
            </div>
            <div style={{ display: 'flex', gap: 3 }}>
              <button
                type="button" disabled={i === 0 || saving} onClick={() => move(i, -1)}
                aria-label={`Move to ${ordinal(i)} priority`}
                style={{ ...arrowBtnStyle, opacity: i === 0 ? 0.3 : 1 }}
                title="Move up"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11 }}><path d="m18 15-6-6-6 6" /></svg>
              </button>
              <button
                type="button" disabled={i === items.length - 1 || saving} onClick={() => move(i, 1)}
                aria-label={`Move to ${ordinal(i + 2)} priority`}
                style={{ ...arrowBtnStyle, opacity: i === items.length - 1 ? 0.3 : 1 }}
                title="Move down"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11 }}><path d="m6 9 6 6 6-6" /></svg>
              </button>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>{item.node}</div>
        </div>
      ))}
    </div>
  );
}

function rankBadgeStyle(i: number): React.CSSProperties {
  // First position gets an accent color; others are neutral.
  const isFirst = i === 0;
  return {
    fontSize: 10, fontWeight: 800, letterSpacing: '0.02em',
    padding: '2px 6px', borderRadius: 6,
    color: isFirst ? '#B23E00' : '#6c6357',
    background: isFirst ? '#ffede3' : '#f5f2ef',
    border: `1px solid ${isFirst ? '#ffd0b8' : '#ece4d8'}`,
    whiteSpace: 'nowrap' as const,
    lineHeight: 1.5,
  };
}

const arrowBtnStyle: React.CSSProperties = {
  width: 22, height: 20, borderRadius: 5, border: '1px solid #ece4d8',
  background: '#fff', color: '#6c6357', display: 'grid', placeItems: 'center',
  cursor: 'pointer', padding: 0,
};
