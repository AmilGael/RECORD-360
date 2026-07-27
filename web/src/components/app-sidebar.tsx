"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Folder, Users } from "@/components/icons";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";

type AppSidebarProps = {
  isAdmin: boolean;
  unread: number;
  activeProjects: number;
  archivedProjects: number;
  currentLang: "es" | "en";
  theme: "light" | "dark";
  labels: {
    nav: { sites: string; notifications: string; team: string };
    navigation: string;
    status: string;
    preferences: string;
    activeProjects: string;
    archivedProjects: string;
    unread: string;
    signOut: string;
    theme: { light: string; dark: string };
    brandTagline: string;
  };
  onSignOut: () => Promise<void>;
};

export function AppSidebar({
  isAdmin,
  unread,
  activeProjects,
  archivedProjects,
  currentLang,
  theme,
  labels,
  onSignOut,
}: AppSidebarProps) {
  const pathname = usePathname();
  const isOn = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <div className="kicker">Raphel</div>
        <strong>{labels.brandTagline}</strong>
      </div>

      <section className="sidebar-section">
        <div className="sidebar-heading">{labels.navigation}</div>
        <nav className="sidebar-nav">
          <Link href="/app" className={`sidebar-link${isOn("/app") && pathname === "/app" ? " is-on" : ""}`}>
            <Folder size={14} /> {labels.nav.sites}
          </Link>
          <Link href="/app/notifications" className={`sidebar-link${isOn("/app/notifications") ? " is-on" : ""}`}>
            <Bell size={14} /> {labels.nav.notifications}
            {unread > 0 && <span className="sidebar-pill">{unread}</span>}
          </Link>
          {isAdmin && (
            <Link href="/app/admin" className={`sidebar-link${isOn("/app/admin") ? " is-on" : ""}`}>
              <Users size={14} /> {labels.nav.team}
            </Link>
          )}
        </nav>
      </section>

      <section className="sidebar-section">
        <div className="sidebar-heading">{labels.status}</div>
        <div className="sidebar-stats">
          {isAdmin && (
            <>
              <div className="sidebar-stat">
                <strong>{activeProjects}</strong>
                <span>{labels.activeProjects}</span>
              </div>
              <div className="sidebar-stat">
                <strong>{archivedProjects}</strong>
                <span>{labels.archivedProjects}</span>
              </div>
            </>
          )}
          <div className="sidebar-stat">
            <strong>{unread}</strong>
            <span>{labels.unread}</span>
          </div>
        </div>
      </section>

      <section className="sidebar-section">
        <div className="sidebar-heading">{labels.preferences}</div>
        <div className="sidebar-controls">
          <ThemeSwitcher initialTheme={theme} labels={labels.theme} />
          <LanguageSwitcher current={currentLang} />
          <form action={onSignOut}>
            <button type="submit" className="sidebar-signout">{labels.signOut}</button>
          </form>
        </div>
      </section>
    </aside>
  );
}
