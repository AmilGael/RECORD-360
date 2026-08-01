import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { getDict } from "@/i18n/server";
import { requireFreshSession } from "@/lib/auth/session";
import { OfflineProvider } from "@/components/offline-provider";
import { SyncIndicator } from "@/components/sync-indicator";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarDrawer } from "@/components/sidebar-drawer";
import { countPendingItems } from "@/lib/notifications/pending";
import { cookies } from "next/headers";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // DB-backed session freshness/revocation runs here (Node runtime — Prisma can't
  // run in edge middleware). This gates every /app navigation: a disabled user, or
  // one whose tenant/role changed, is redirected to /login on their next move.
  const user = await requireFreshSession().catch(() => redirect("/login"));
  const { id: userId, companyId, role } = user;
  const isAdmin = role === "ADMIN" || role === "MANAGER";
  const { lang, t } = await getDict();
  const theme = (await cookies()).get("r360_theme")?.value === "dark" ? "dark" : "light";

  const [unread, activeProjects, archivedProjects, pendingCount] = await Promise.all([
    prisma.notification.count({ where: { userId, readAt: null } }),
    prisma.project.count({ where: { companyId, archivedAt: null } }),
    prisma.project.count({ where: { companyId, archivedAt: { not: null } } }),
    // R3 WS1: sidebar badge for the operational pending queue (/app/pending) —
    // same scope rules (projectAccessWhere) as the queue itself.
    countPendingItems({ id: userId, companyId, role }),
  ]);

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="grid-bg" style={{ minHeight: "100vh" }}>
      <OfflineProvider />
      <header className="appbar">
        <div className="appbar-inner">
          <Link href="/app" className="brand"><b>Raphel<span className="dot" aria-hidden="true">.</span></b><span className="tag">{t.common.blackBox}</span></Link>
          <SyncIndicator t={{ pending: t.offlineCapture.pending }} />
        </div>
      </header>
      <div className="app-shell">
        <SidebarDrawer labels={{ open: t.sidebar.openMenu, close: t.sidebar.closeMenu }}>
          <AppSidebar
            isAdmin={isAdmin}
            unread={unread}
            pendingCount={pendingCount}
            activeProjects={activeProjects}
            archivedProjects={archivedProjects}
            currentLang={lang}
            theme={theme}
            labels={{
              nav: { sites: t.nav.sites, notifications: t.nav.notifications, team: t.nav.team, pending: t.pendingWork.navLabel },
              navigation: t.sidebar.navigation,
              status: t.sidebar.status,
              preferences: t.sidebar.preferences,
              activeProjects: t.sidebar.activeProjects,
              archivedProjects: t.sidebar.archivedProjects,
              unread: t.sidebar.unread,
              signOut: t.sidebar.signOut,
              theme: { light: t.sidebar.light, dark: t.sidebar.dark },
              brandTagline: t.common.blackBox,
            }}
            onSignOut={signOutAction}
          />
        </SidebarDrawer>
        <main className="app-shell-main">{children}</main>
      </div>
    </div>
  );
}
