import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

// One-time seed of clients.social_links from the LBM Google Sheet's "Social
// media profiles" tab (Client Contract & Content Delivery Overview
// workbook), for the clients that have both a real handle/URL in that tab
// and an unambiguous match to a client already in the `clients` table.
// Matches by a normalized client name against `clients.name` (same approach
// as /api/seed-contracts) — unmatched entries are reported, not invented.
//
// Rows intentionally left out of PROFILES (per explicit review with the
// user, not silently dropped):
//   - Apex Interior Group: no corresponding client row exists yet (same gap
//     noted in seed-contracts).
//   - Ohr Sholmo: the only plausible match in `clients` is "Synagogue", but
//     that mapping was not confirmed — left out rather than guessed.
//   - Tom Misuracca, Birti Kaur: not tracked as individual clients — they
//     fall under a shared "Project Based" bucket in ClickUp's Client Name
//     (AM) dropdown, so there's no single client row to attach their
//     handles to without colliding with other project-based clients using
//     that same bucket.
//   - Jason, Sebastian Velasquez: sheet rows exist but have no social data
//     filled in — nothing to seed.

type Platform = 'instagram' | 'facebook' | 'tiktok' | 'linkedin' | 'youtube' | 'website';

type ProfileSeed = {
  clientMatch: string; // substring to match against normalize(clients.name)
  links: Partial<Record<Platform, { handle?: string; url: string }>>;
};

// Transcribed from the Google Sheet's "Social media profiles" tab. `handle`
// is only set where the URL is unambiguously a profile/vanity URL (not a
// post permalink, share link, or profile.php?id= link) — those are left as
// url-only so the Asset inventory table falls back to showing the raw URL
// rather than a guessed-wrong handle.
const PROFILES: ProfileSeed[] = [
  {
    clientMatch: 'volvi',
    links: {
      instagram: { url: 'https://www.instagram.com/p/DYDSHq5nbT_/' }, // post permalink, not a profile URL
      facebook: { handle: 'PrimeInteriorsNY', url: 'https://www.facebook.com/PrimeInteriorsNY' },
      tiktok: { handle: 'vollystar0', url: 'https://www.tiktok.com/@vollystar0' },
      linkedin: { handle: 'volvi-stern-2a98a2158', url: 'https://www.linkedin.com/in/volvi-stern-2a98a2158/' },
      youtube: { handle: 'volvystern7871', url: 'https://www.youtube.com/@volvystern7871' },
      website: { url: 'https://primeinteriorsnyc.com/' },
    },
  },
  {
    clientMatch: 'hector',
    links: {
      instagram: { handle: 'hectorpillainvestments', url: 'https://www.instagram.com/hectorpillainvestments/' },
      facebook: { url: 'https://www.facebook.com/profile.php?id=61580724773184' },
      tiktok: { handle: 'hectorpillainvestments', url: 'https://www.tiktok.com/@hectorpillainvestments' },
      linkedin: { handle: 'hector-rosero-06a4b3369', url: 'https://www.linkedin.com/in/hector-rosero-06a4b3369' },
      youtube: { handle: 'hector.pillainvestments', url: 'https://youtube.com/@hector.pillainvestments' },
      website: { url: 'https://pillainvestmentsllc.com/' },
    },
  },
  {
    clientMatch: 'adam',
    links: {
      instagram: { handle: 'adamsellsnj', url: 'https://www.instagram.com/adamsellsnj/' },
      facebook: { url: 'https://www.facebook.com/share/1DqWUH7bcQ/?mibextid=wwXIfr' },
      tiktok: { handle: 'adamsellsnj', url: 'https://www.tiktok.com/@adamsellsnj' },
      linkedin: { handle: 'adam-sperber-76714218', url: 'https://www.linkedin.com/in/adam-sperber-76714218' },
      youtube: { handle: 'adamsellsnj', url: 'https://youtube.com/@adamsellsnj' },
      // Website: '-' in the sheet — no website on record.
    },
  },
  {
    clientMatch: 'saeed',
    links: {
      instagram: { handle: 'shammond247', url: 'https://www.instagram.com/shammond247/' },
      facebook: { url: 'https://www.facebook.com/share/18uU9PRLRK/?mibextid=wwXIfr' },
      linkedin: { handle: 'saeed-hammond-7431436b', url: 'https://www.linkedin.com/in/saeed-hammond-7431436b' },
      youtube: { handle: 'levantuslendingpartners', url: 'https://www.youtube.com/@levantuslendingpartners/featured' },
      website: { url: 'https://www.levantuslendingpartners.com/' },
      // TikTok: '-' in the sheet.
    },
  },
  {
    clientMatch: 'sandy cuevas',
    links: {
      instagram: { handle: 'cuevassandy', url: 'https://www.instagram.com/cuevassandy/' },
      facebook: { url: 'https://www.facebook.com/share/1PnaqWZgeE/?mibextid=wwXIfr' },
      tiktok: { handle: 'sandycuevasrealestate', url: 'https://www.tiktok.com/@sandycuevasrealestate' },
      linkedin: { handle: 'sandy-cuevas-549b4475', url: 'https://www.linkedin.com/in/sandy-cuevas-549b4475' },
      youtube: { handle: 'sandy121951', url: 'https://youtube.com/@sandy121951' },
      website: { url: 'https://sandy-leads-wjb5pcnq.manus.space/' },
    },
  },
  {
    clientMatch: 'carmelo',
    links: {
      instagram: { handle: 'cmg_contractingllc', url: 'https://www.instagram.com/cmg_contractingllc/' },
      facebook: { url: 'https://www.facebook.com/share/1D4Tgn564M/?mibextid=wwXIfr' },
      website: { url: 'https://cmgcontractingllc.com/' },
      // TikTok, LinkedIn, YouTube: '-' in the sheet.
    },
  },
  {
    clientMatch: 'richard',
    links: {
      instagram: { handle: 'richardwmiranda', url: 'https://www.instagram.com/richardwmiranda/' },
      facebook: { url: 'https://www.facebook.com/share/1Ath6v7iqu/?mibextid=wwXIfr' },
      tiktok: { handle: 'richardwmiranda1', url: 'https://www.tiktok.com/@richardwmiranda1' },
      website: { url: 'https://link.me/richardwmiranda?utm_source=ig&utm_medium=social&utm_content=link_in_bio' },
      // LinkedIn, YouTube: '-' in the sheet.
    },
  },
  {
    clientMatch: 'kristina',
    links: {
      instagram: { handle: 'krissy_the_realtor', url: 'https://www.instagram.com/krissy_the_realtor/' },
      tiktok: { handle: 'krissytherealtor', url: 'https://www.tiktok.com/@krissytherealtor' },
      website: { url: 'https://kristinarodriguez.com' },
      // Facebook, LinkedIn, YouTube: '-' in the sheet.
    },
  },
  {
    clientMatch: 'jay',
    links: {
      instagram: { handle: 'champion_estates', url: 'https://www.instagram.com/champion_estates/' },
      linkedin: { handle: 'jay-rodriguez-47746316a', url: 'https://www.linkedin.com/in/jay-rodriguez-47746316a' },
      // Facebook, TikTok, YouTube: '-' in the sheet.
    },
  },
  {
    clientMatch: 'darrell',
    links: {
      instagram: { handle: 'darrellmichaelbailey', url: 'https://www.instagram.com/darrellmichaelbailey/' },
      facebook: { url: 'https://www.facebook.com/share/1b1dsKANep/?mibextid=wwXIfr' },
      tiktok: { handle: 'darrellbaileyrealestate', url: 'https://www.tiktok.com/@darrellbaileyrealestate?lang=en&is_from_webapp=1&sender_device=mobile&sender_web_id=7643932566534145544' },
      linkedin: { handle: 'darrellbaileyrealestate', url: 'https://www.linkedin.com/showcase/darrellbaileyrealestate/' },
      youtube: { handle: 'darrellbaileyrealestate', url: 'https://youtube.com/@darrellbaileyrealestate?si=FTYbXE1ew6MnzZVJ' },
      // Website: '-' in the sheet.
    },
  },
];

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}

export async function POST(req: Request) {
  const secret = req.headers.get('x-migrate-secret');
  if (!process.env.MIGRATE_SECRET || secret !== process.env.MIGRATE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return NextResponse.json({ error: 'DATABASE_URL not set' }, { status: 500 });

  const directUrl = dbUrl.replace('-pooler', '');

  try {
    const sql = neon(directUrl);

    const clientRows = await sql`SELECT id, name, social_links FROM clients`;
    const clients = clientRows as { id: string; name: string; social_links: unknown }[];

    const updated: string[] = [];
    const skippedExisting: string[] = [];
    const unmatched: string[] = [];

    for (const p of PROFILES) {
      const hit = clients.find(c => normalize(c.name).includes(p.clientMatch));
      if (!hit) { unmatched.push(p.clientMatch); continue; }

      // Never overwrite links an AM may have already entered through the
      // admin UI since this is a one-time bulk import, not a sync.
      if (hit.social_links && Object.keys(hit.social_links as object).length > 0) {
        skippedExisting.push(`${p.clientMatch} (${hit.name})`);
        continue;
      }

      await sql`UPDATE clients SET social_links = ${JSON.stringify(p.links)}::jsonb WHERE id = ${hit.id}`;
      updated.push(`${p.clientMatch} (${hit.name})`);
    }

    return NextResponse.json({ ok: true, updated, skippedExisting, unmatched });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
