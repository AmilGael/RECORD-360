import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getDict } from "@/i18n/server";
import Link from "next/link";
import type { NotificationSeverity, Role } from "@prisma/client";
import { markAllNotificationsRead } from "@/app/actions/notifications";
import { projectAccessWhere } from "@/lib/authz/projects";
import { EVENT_KEYS, type EventKey } from "@/lib/notifications/events";
import { getNotificationSections } from "@/lib/notifications/sections";
import { FiltersSheet } from "@/components/filters-sheet";
import { BackButton } from "@/components/back-button";
import { NotificationsBoard } from "@/components/notifications-board";
import { parseDayBound } from "@/lib/time/zone";

const SEVERITIES = ["SUCCESS", "IMPORTANT", "CRITICAL"] as const;
const PAGE_SIZE = 25;

type SearchParams = {
  q?: string; status?: string; projectId?: string; type?: string; severity?: string; from?: string; to?: string; up?: string; rp?: string;
};

function parsePage(raw: string | undefined): number {
  const n = parseInt(raw ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return null;
  const sessionUser = session!.user as { id: string; companyId: string; role: Role };

  const { t, lang } = await getDict();
  const N = t.notifications;
  const F = N.filters;

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status: "unread" | "read" | undefined = sp.status === "unread" || sp.status === "read" ? sp.status : undefined;
  const projectId = sp.projectId || undefined;
  const type: EventKey | undefined = sp.type && (EVENT_KEYS as readonly string[]).includes(sp.type) ? (sp.type as EventKey) : undefined;
  const severity: NotificationSeverity | undefined =
    sp.severity && (SEVERITIES as readonly string[]).includes(sp.severity) ? (sp.severity as NotificationSeverity) : undefined;
  const from = parseDayBound(sp.from, "start");
  const to = parseDayBound(sp.to, "end");
  const unreadPage = parsePage(sp.up);
  const readPage = parsePage(sp.rp);
  const hasActiveFilters = Boolean(q || status || projectId || type || severity || from || to);
  const hasExtraFilters = Boolean(q || projectId || type || severity || from || to);

  const [sections, unreadTotal, projects] = await Promise.all([
    getNotificationSections(
      userId,
      { q: q || undefined, status, projectId, type, severity, from, to },
      { unreadPage, readPage, pageSize: PAGE_SIZE },
    ),
    prisma.notification.count({ where: { userId, readAt: null } }),
    prisma.project.findMany({ where: projectAccessWhere(sessionUser), select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="reveal" style={{ maxWidth: 720, margin: "0 auto" }}>
      <BackButton fallbackHref="/app" labels={{ label: t.nav.back, aria: t.nav.backAria }} />
      <p className="kicker">{N.title.toUpperCase()}</p>
      <h1 className="h-lg" style={{ fontSize: "clamp(1.9rem, 4vw, 2.7rem)", margin: "10px 0 20px" }}>{N.title}</h1>

      <FiltersSheet title={F.sheetTitle}>
        <form action="/app/notifications" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16, alignItems: "center" }}>
          <input type="text" name="q" defaultValue={sp.q ?? ""} placeholder={F.searchPlaceholder} className="input" style={{ flex: "1 1 220px" }} />
          <select name="status" defaultValue={sp.status ?? ""} className="input" aria-label={F.statusLabel}>
            <option value="">{F.statusAll}</option>
            <option value="unread">{F.statusUnread}</option>
            <option value="read">{F.statusRead}</option>
          </select>
          <select name="projectId" defaultValue={sp.projectId ?? ""} className="input" aria-label={F.projectLabel}>
            <option value="">{F.projectAll}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select name="type" defaultValue={sp.type ?? ""} className="input" aria-label={F.typeLabel}>
            <option value="">{F.typeAll}</option>
            {EVENT_KEYS.map((k) => (
              <option key={k} value={k}>{F.eventLabels[k]}</option>
            ))}
          </select>
          <select name="severity" defaultValue={sp.severity ?? ""} className="input" aria-label={F.severityLabel}>
            <option value="">{F.severityAll}</option>
            <option value="SUCCESS">{t.severity.success}</option>
            <option value="IMPORTANT">{t.severity.important}</option>
            <option value="CRITICAL">{t.severity.critical}</option>
          </select>
          <input type="date" name="from" defaultValue={sp.from ?? ""} aria-label={F.fromLabel} className="input" />
          <input type="date" name="to" defaultValue={sp.to ?? ""} aria-label={F.toLabel} className="input" />
          <button type="submit" className="btn btn-ghost" style={{ fontSize: "0.82rem" }}>{F.apply}</button>
          {hasActiveFilters && (
            <Link href="/app/notifications" className="btn btn-ghost" style={{ fontSize: "0.82rem" }}>{F.clear}</Link>
          )}
        </form>
      </FiltersSheet>

      {unreadTotal > 0 && (
        <form action={markAllNotificationsRead} style={{ marginBottom: 16 }}>
          <button type="submit" className="btn btn-ghost" style={{ fontSize: "0.82rem", padding: "0.45rem 0.9rem" }}>
            {N.markAllRead}
          </button>
        </form>
      )}

      <NotificationsBoard
        data={sections}
        pageSize={PAGE_SIZE}
        query={{
          q: q || undefined,
          status,
          projectId,
          type,
          severity,
          from: sp.from || undefined,
          to: sp.to || undefined,
          up: unreadPage,
          rp: readPage,
        }}
        status={status}
        hasExtraFilters={hasExtraFilters}
        lang={lang}
        labels={{
          unreadSection: N.unreadSection,
          readSection: N.readSection,
          unreadCaughtUp: N.unreadCaughtUp,
          readEmpty: N.readEmpty,
          noResults: F.noResults,
          markRead: N.markRead,
          unread: N.unread,
          unreadPager: N.unreadPager,
          readPager: N.readPager,
          pager: t.pager,
          severity: t.severity,
        }}
      />
    </div>
  );
}
