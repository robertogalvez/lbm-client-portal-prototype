'use client';

import { useState } from 'react';

interface PriorityItem {
  id: string;
  node: React.ReactNode;
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
            <button
              type="button" disabled={i === 0 || saving} onClick={() => move(i, -1)}
              aria-label="Move up in priority"
              style={{ ...arrowBtnStyle, opacity: i === 0 ? 0.35 : 1 }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><path d="m18 15-6-6-6 6" /></svg>
            </button>
            <button
              type="button" disabled={i === items.length - 1 || saving} onClick={() => move(i, 1)}
              aria-label="Move down in priority"
              style={{ ...arrowBtnStyle, opacity: i === items.length - 1 ? 0.35 : 1 }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><path d="m6 9 6 6 6-6" /></svg>
            </button>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>{item.node}</div>
        </div>
      ))}
    </div>
  );
}

const arrowBtnStyle: React.CSSProperties = {
  width: 26, height: 22, borderRadius: 6, border: '1px solid #ece4d8',
  background: '#fff', color: '#6c6357', display: 'grid', placeItems: 'center',
  cursor: 'pointer', padding: 0,
};
