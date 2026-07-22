import type { Metadata } from "next";
import "./globals.css";
import { LayoutShell } from "@/components/layout/LayoutShell";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { authUsers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const metadata: Metadata = {
  title: "LBM Portal",
  description: "Legacy Building Media — Internal Operations Portal",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let showClientPortal = false;
  let user: { name: string; email: string } | null = null;
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (session?.user?.id) {
      const [row] = await db
        .select({ isAlsoClient: authUsers.isAlsoClient })
        .from(authUsers)
        .where(eq(authUsers.id, session.user.id))
        .limit(1);
      showClientPortal = row?.isAlsoClient ?? false;
      user = { name: session.user.name, email: session.user.email };
    }
  } catch {
    // no session or DB error — don't break the layout
  }

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet" />
      </head>
      <body>
        <LayoutShell showClientPortal={showClientPortal} user={user}>{children}</LayoutShell>
      </body>
    </html>
  );
}
