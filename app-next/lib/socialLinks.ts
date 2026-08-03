export type SocialLinks = Record<string, { handle?: string; url?: string }>;

const PLATFORM_KEYS = ['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube', 'website'];

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
