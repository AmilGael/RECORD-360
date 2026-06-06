import Link from "next/link";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { getDict } from "@/i18n/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { OfflineProvider } from "@/components/offline-provider";
import { SyncIndicator } from "@/components/sync-indicator";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const isAdmin = role === "ADMIN" || role === "MANAGER";
  const { lang, t } = await getDict();

  const unread = userId
    ? await prisma.notification.count({ where: { userId, readAt: null } })
    : 0;

  return (
    <div className="grid-bg" style={{ minHeight: "100vh" }}>
      <OfflineProvider />
      <header className="appbar">
        <div className="appbar-inner">
          <Link href="/app" className="brand"><b>Raphl<span className="dot" aria-hidden="true">.</span></b><span className="tag">{t.common.blackBox}</span></Link>
          <nav className="appnav">
            <Link href="/app">{t.nav.sites}</Link>
            {isAdmin && <Link href="/app/admin">{t.nav.team}</Link>}
            <Link href="/app/notifications">
              {unread > 0 ? `${t.nav.notifications} (${unread})` : t.nav.notifications}
            </Link>
            <SyncIndicator t={{ pending: t.offlineCapture.pending }} />
            <LanguageSwitcher current={lang} />
            <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
              <button>{t.nav.signOut}</button>
            </form>
          </nav>
        </div>
      </header>
      <main style={{ maxWidth: 980, margin: "0 auto", padding: "44px 28px 90px" }}>{children}</main>
    </div>
  );
}
