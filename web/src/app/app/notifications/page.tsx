import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getDict } from "@/i18n/server";
import Link from "next/link";
import type { NotificationSeverity, Role } from "@prisma/client";
import { markNotificationRead, markAllNotificationsRead } from "@/app/actions/notifications";
import { projectAccessWhere } from "@/lib/authz/projects";
import { pageWindow } from "@/lib/feed/paginate";
import { EVENT_KEYS, type EventKey } from "@/lib/notifications/events";
import { buildNotificationWhere } from "@/lib/notifications/query";
import { SeverityMarker } from "@/components/severity-marker";

const SEVERITIES = ["SUCCESS", "IMPORTANT", "CRITICAL"] as const;
const PAGE_SIZE = 25;

function parseDate(v?: string): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

type SearchParams = {
  q?: string; status?: string; projectId?: string; type?: string; severity?: string; from?: string; to?: string; page?: string;
};

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return null;
  const sessionUser = session!.user as { id: string; companyId: string; role: Role };

  const { t } = await getDict();
  const N = t.notifications;
  const F = N.filters;

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status: "unread" | "read" | undefined = sp.status === "unread" || sp.status === "read" ? sp.status : undefined;
  const projectId = sp.projectId || undefined;
  const type: EventKey | undefined = sp.type && (EVENT_KEYS as readonly string[]).includes(sp.type) ? (sp.type as EventKey) : undefined;
  const severity: NotificationSeverity | undefined =
    sp.severity && (SEVERITIES as readonly string[]).includes(sp.severity) ? (sp.severity as NotificationSeverity) : undefined;
  const from = parseDate(sp.from);
  const to = parseDate(sp.to);
  const rawPage = parseInt(sp.page ?? "1", 10);
  const hasActiveFilters = Boolean(q || status || projectId || type || severity || from || to);

  // Server-side (DB-level) filtering — never fetch-all-then-filter in memory.
  const where = buildNotificationWhere(userId, { q: q || undefined, status, projectId, type, severity, from, to });

  // Project filter options come from the user's ACCESSIBLE project set
  // (projectAccessWhere), not from distinct notification rows — reading
  // options off notification rows would leak the names of projects the user
  // has since lost access to (e.g. after an assignment change).
  const [total, unreadTotal, projects] = await Promise.all([
    prisma.notification.count({ where }),
    // Sidebar unread badge parity: this is the SAME unread definition used in
    // app/app/layout.tsx (readAt: null for the user), intentionally unaffected
    // by the filters above.
    prisma.notification.count({ where: { userId, readAt: null } }),
    prisma.project.findMany({ where: projectAccessWhere(sessionUser), select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const pagination = pageWindow(total, isNaN(rawPage) ? 1 : rawPage, PAGE_SIZE);

  const notifications = await prisma.notification.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: PAGE_SIZE,
    skip: pagination.skip,
  });

  function pageHref(page: number) {
    const params = new URLSearchParams();
    if (sp.q) params.set("q", sp.q);
    if (sp.status) params.set("status", sp.status);
    if (sp.projectId) params.set("projectId", sp.projectId);
    if (sp.type) params.set("type", sp.type);
    if (sp.severity) params.set("severity", sp.severity);
    if (sp.from) params.set("from", sp.from);
    if (sp.to) params.set("to", sp.to);
    if (page > 1) params.set("page", String(page));
    const s = params.toString();
    return s ? `/app/notifications?${s}` : "/app/notifications";
  }

  return (
    <div className="reveal" style={{ maxWidth: 720, margin: "0 auto" }}>
      <p className="kicker">{N.title.toUpperCase()}</p>
      <h1 className="h-lg" style={{ fontSize: "clamp(1.9rem, 4vw, 2.7rem)", margin: "10px 0 20px" }}>{N.title}</h1>

      <form action="/app/notifications" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <input type="text" name="q" defaultValue={sp.q ?? ""} placeholder={F.searchPlaceholder} className="input" style={{ flex: "1 1 220px" }} />
        <select name="status" defaultValue={sp.status ?? ""} className="input" style={{ width: "auto" }} aria-label={F.statusLabel}>
          <option value="">{F.statusAll}</option>
          <option value="unread">{F.statusUnread}</option>
          <option value="read">{F.statusRead}</option>
        </select>
        <select name="projectId" defaultValue={sp.projectId ?? ""} className="input" style={{ width: "auto" }} aria-label={F.projectLabel}>
          <option value="">{F.projectAll}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select name="type" defaultValue={sp.type ?? ""} className="input" style={{ width: "auto" }} aria-label={F.typeLabel}>
          <option value="">{F.typeAll}</option>
          {EVENT_KEYS.map((k) => (
            <option key={k} value={k}>{F.eventLabels[k]}</option>
          ))}
        </select>
        <select name="severity" defaultValue={sp.severity ?? ""} className="input" style={{ width: "auto" }} aria-label={F.severityLabel}>
          <option value="">{F.severityAll}</option>
          <option value="SUCCESS">{t.severity.success}</option>
          <option value="IMPORTANT">{t.severity.important}</option>
          <option value="CRITICAL">{t.severity.critical}</option>
        </select>
        <input type="date" name="from" defaultValue={sp.from ?? ""} aria-label={F.fromLabel} className="input" style={{ width: "auto" }} />
        <input type="date" name="to" defaultValue={sp.to ?? ""} aria-label={F.toLabel} className="input" style={{ width: "auto" }} />
        <button type="submit" className="btn btn-ghost" style={{ fontSize: "0.82rem" }}>{F.apply}</button>
        {hasActiveFilters && (
          <Link href="/app/notifications" className="btn btn-ghost" style={{ fontSize: "0.82rem" }}>{F.clear}</Link>
        )}
      </form>

      {unreadTotal > 0 && (
        <form action={markAllNotificationsRead} style={{ marginBottom: 16 }}>
          <button type="submit" className="btn btn-ghost" style={{ fontSize: "0.82rem", padding: "0.45rem 0.9rem" }}>
            {N.markAllRead}
          </button>
        </form>
      )}

      {notifications.length === 0 && (
        <p className="text-steel">{hasActiveFilters ? F.noResults : N.empty}</p>
      )}

      {notifications.map((n) => {
        const isUnread = n.readAt === null;
        return (
          <div
            key={n.id}
            className="row"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 4,
              borderLeft: isUnread ? "3px solid var(--accent)" : "3px solid transparent",
              paddingLeft: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", width: "100%", gap: 8 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {n.link ? (
                    <Link href={n.link} className="row-link" style={{ fontWeight: isUnread ? 700 : 400 }}>
                      {n.title}
                    </Link>
                  ) : (
                    <span style={{ fontWeight: isUnread ? 700 : 400 }}>{n.title}</span>
                  )}
                  <SeverityMarker severity={n.severity} t={t.severity} />
                </div>
                {n.body && <p className="text-soft" style={{ margin: "2px 0 0", fontSize: "0.88rem" }}>{n.body}</p>}
                <p className="text-steel" style={{ margin: "3px 0 0", fontSize: "0.76rem" }}>
                  {n.createdAt.toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" })}
                  {isUnread && (
                    <span style={{ marginLeft: 6, fontFamily: "var(--font-mono)", fontSize: "0.62rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)" }}>
                      {t.notifications.unread}
                    </span>
                  )}
                </p>
              </div>
              {isUnread && (
                <form action={markNotificationRead}>
                  <input type="hidden" name="id" value={n.id} />
                  <button type="submit" className="btn btn-ghost" style={{ fontSize: "0.76rem", padding: "0.3rem 0.65rem" }}>
                    {t.notifications.markRead}
                  </button>
                </form>
              )}
            </div>
          </div>
        );
      })}

      {total > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginTop: 24,
            paddingTop: 16,
            borderTop: "1px solid var(--line)",
            flexWrap: "wrap",
          }}
        >
          {pagination.hasNewer ? (
            <Link href={pageHref(pagination.page - 1)} className="btn btn-ghost" style={{ fontSize: "0.82rem", padding: "0.42rem 0.9rem" }}>
              {t.pager.newer}
            </Link>
          ) : (
            <span style={{ minWidth: 80 }} />
          )}
          <span className="kicker" style={{ color: "var(--steel)" }}>
            {t.pager.pageLabel} {pagination.page} {t.pager.ofLabel} {pagination.totalPages}
          </span>
          {pagination.hasOlder ? (
            <Link href={pageHref(pagination.page + 1)} className="btn btn-ghost" style={{ fontSize: "0.82rem", padding: "0.42rem 0.9rem" }}>
              {t.pager.older}
            </Link>
          ) : (
            <span style={{ minWidth: 80 }} />
          )}
        </div>
      )}
    </div>
  );
}
