export type SocialLinks = Record<string, { handle?: string; url?: string }>;

// The platforms a client can be connected on, with their brand colours.
// Lived in components/dashboard/AssetInventory.tsx until that screen was cut —
// it belongs with the rest of the social-link handling, not in a view.
export const PLATFORMS = [
  { key: 'instagram', label: 'Instagram', color: '#E1306C' },
  { key: 'facebook', label: 'Facebook', color: '#1877F2' },
  { key: 'tiktok', label: 'TikTok', color: '#111c28' },
  { key: 'linkedin', label: 'LinkedIn', color: '#0A66C2' },
  { key: 'youtube', label: 'YouTube', color: '#FF0000' },
  { key: 'website', label: 'Website', color: '#54616f' },
] as const;

export type PlatformKey = typeof PLATFORMS[number]['key'];

const PLATFORM_KEYS: string[] = PLATFORMS.map(p => p.key);

/**
 * Read the handle out of a profile URL, so the admin only ever pastes the URL.
 * Falls back to the last non-empty path segment, which is right for every
 * platform we support except Website, where the host is the useful label.
 */
export function handleFromUrl(key: string, url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (key === 'website') return parsed.host.replace(/^www\./, '');
    const segments = parsed.pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1] ?? '';
    return last.replace(/^@/, '');
  } catch {
    return '';
  }
}

// Only known platform keys survive, and only entries with a real handle or
// URL — an all-empty object collapses to null rather than being stored.
export function cleanSocialLinks(input: unknown): SocialLinks | null {
  if (!input || typeof input !== 'object') return null;
  const obj = input as Record<string, { handle?: unknown; url?: unknown }>;
  const result: SocialLinks = {};
  for (const key of PLATFORM_KEYS) {
    const entry = obj[key];
    const handle = typeof entry?.handle === 'string' ? entry.handle.trim() : '';
    const url = typeof entry?.url === 'string' ? entry.url.trim() : '';
    if (handle || url) result[key] = { handle: handle || undefined, url: url || undefined };
  }
  return Object.keys(result).length > 0 ? result : null;
}
