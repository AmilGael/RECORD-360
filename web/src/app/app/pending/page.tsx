import { auth } from "@/auth";
import Link from "next/link";
import type { NotificationSeverity, Role } from "@prisma/client";
import { getDict } from "@/i18n/server";
import { projectAccessWhere } from "@/lib/authz/projects";
import { pageWindow } from "@/lib/feed/paginate";
import { loadPendingItems, type PendingKind } from "@/lib/notifications/pending";
import { resolveReminder } from "@/app/actions/reminders";
import { SeverityMarker } from "@/components/severity-marker";
import { SubmitButton } from "@/components/submit-button";
import { formatTimestamp } from "@/lib/format/datetime";
import { prisma } from "@/lib/db";

const SEVERITIES = ["IMPORTANT", "CRITICAL"] as const;
const PAGE_SIZE = 25;

type SearchParams = { kind?: string; projectId?: string; severity?: string; due?: string; page?: string };

export default async function PendingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await auth();
  const u = session?.user as { id?: string; companyId?: string; role?: Role } | undefined;
  if (!u?.id || !u.companyId || !u.role) return null;
  const sessionUser = { id: u.id, companyId: u.companyId, role: u.role };

  const { lang, t } = await getDict();
  const P = t.pendingWork;

  const sp = await searchParams;
  const kind: PendingKind | undefined = sp.kind === "request" || sp.kind === "alert" || sp.kind === "reminder" ? sp.kind : undefined;
  const projectId = sp.projectId || undefined;
  const severity: NotificationSeverity | undefined =
    sp.severity && (SEVERITIES as readonly string[]).includes(sp.severity) ? (sp.severity as NotificationSeverity) : undefined;
  const onlyOverdue = sp.due === "overdue";
  const rawPage = parseInt(sp.page ?? "1", 10);
  const hasActiveFilters = Boolean(kind || projectId || severity || onlyOverdue);

  const [items, projects] = await Promise.all([
    loadPendingItems(sessionUser, { kind, projectId, severity, onlyOverdue }),
    prisma.project.findMany({ where: projectAccessWhere(sessionUser), select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const total = items.length;
  const pagination = pageWindow(total, isNaN(rawPage) ? 1 : rawPage, PAGE_SIZE);
  const pageItems = items.slice(pagination.skip, pagination.skip + PAGE_SIZE);

  const typeLabel = (k: PendingKind) => (k === "request" ? P.typeRequest : k === "alert" ? P.typeAlert : P.typeReminder);

  function pageHref(page: number) {
    const params = new URLSearchParams();
    if (sp.kind) params.set("kind", sp.kind);
    if (sp.projectId) params.set("projectId", sp.projectId);
    if (sp.severity) params.set("severity", sp.severity);
    if (sp.due) params.set("due", sp.due);
    if (page > 1) params.set("page", String(page));
    const s = params.toString();
    return s ? `/app/pending?${s}` : "/app/pending";
  }

  return (
    <div className="reveal" style={{ maxWidth: 720, margin: "0 auto" }}>
      <p className="kicker">{P.title.toUpperCase()}</p>
      <h1 className="h-lg" style={{ fontSize: "clamp(1.9rem, 4vw, 2.7rem)", margin: "10px 0 20px" }}>{P.title}</h1>

      <form action="/app/pending" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <select name="kind" defaultValue={sp.kind ?? ""} className="input" style={{ width: "auto" }} aria-label={P.filterTypeLabel}>
          <option value="">{P.filterTypeAll}</option>
          <option value="request">{P.typeRequest}</option>
          <option value="alert">{P.typeAlert}</option>
          <option value="reminder">{P.typeReminder}</option>
        </select>
        <select name="projectId" defaultValue={sp.projectId ?? ""} className="input" style={{ width: "auto" }} aria-label={P.filterProjectLabel}>
          <option value="">{P.filterProjectAll}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select name="severity" defaultValue={sp.severity ?? ""} className="input" style={{ width: "auto" }} aria-label={P.filterSeverityLabel}>
          <option value="">{P.filterSeverityAll}</option>
          <option value="IMPORTANT">{t.severity.important}</option>
          <option value="CRITICAL">{t.severity.critical}</option>
        </select>
        <select name="due" defaultValue={sp.due ?? ""} className="input" style={{ width: "auto" }} aria-label={P.filterDueLabel}>
          <option value="">{P.filterDueAll}</option>
          <option value="overdue">{P.filterDueOverdue}</option>
        </select>
        <button type="submit" className="btn btn-ghost" style={{ fontSize: "0.82rem" }}>{P.apply}</button>
        {hasActiveFilters && (
          <Link href="/app/pending" className="btn btn-ghost" style={{ fontSize: "0.82rem" }}>{P.clear}</Link>
        )}
      </form>

      {pageItems.length === 0 && (
        <p className="text-steel">{hasActiveFilters ? P.noResults : P.empty}</p>
      )}

      {pageItems.map((item) => (
        <div key={item.id} className="row" style={{ gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Link href={item.deepLink} className="row-link">{item.title}</Link>
              <SeverityMarker severity={item.severity} t={t.severity} />
              {item.overdue && (
                <span className="mono" style={{ fontSize: "0.62rem", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--state-blocked)", fontWeight: 700 }}>
                  {P.overdue}
                </span>
              )}
            </div>
            <p className="text-steel" style={{ margin: "3px 0 0", fontSize: "0.76rem" }}>
              {typeLabel(item.kind)} · {item.projectName}
              {item.partidaName ? ` · ${item.partidaName}` : ""}
              {item.dueAt ? ` · ${P.dueLabel}: ${formatTimestamp(item.dueAt, lang)}` : ""}
              {item.authorName ? ` · ${P.authorLabel}: ${item.authorName}` : ""}
            </p>
          </div>
          {item.kind === "reminder" ? (
            <form action={resolveReminder}>
              <input type="hidden" name="registroId" value={item.id.slice("rem:".length)} />
              <SubmitButton className="btn btn-ghost" style={{ fontSize: "0.76rem", padding: "0.3rem 0.65rem", whiteSpace: "nowrap" }}>
                {P.resolve}
              </SubmitButton>
            </form>
          ) : (
            <Link href={item.deepLink} className="btn btn-ghost" style={{ fontSize: "0.76rem", padding: "0.3rem 0.65rem", whiteSpace: "nowrap" }}>
              {P.viewRequest}
            </Link>
          )}
        </div>
      ))}

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
