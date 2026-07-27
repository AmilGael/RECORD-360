// R3 WS1: server-backed projection for the operational pending queue
// ("Pendientes por resolver" — /app/pending). This is NOT the offline sync
// queue (see components/pending-entries.tsx / "Pendientes de sincronización",
// Agent 4's per-partida local IndexedDB state) — never merge the two.
//
// Normalizes two independent sources into one sortable/filterable list:
//   (a) OPEN ChangeRequests (kind CHANGE -> "request", kind ALERT -> "alert")
//   (b) unresolved registro reminders (reminderDueAt set, reminderResolvedAt null)
//
// Both sources are already operationally bounded (open requests / unresolved
// reminders only) and scoped by projectAccessWhere, so loading the full
// (filtered) set and sorting/paginating in memory is not the "fetch-all"
// anti-pattern the notifications search guards against — there is no
// unbounded historical table backing this projection.
import { NotificationSeverity, RequestKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { projectAccessWhere, type SessionUser } from "@/lib/authz/projects";

export type PendingKind = "request" | "alert" | "reminder";

export type PendingItem = {
  id: string; // "req:<changeRequestId>" | "rem:<registroId>"
  kind: PendingKind;
  projectId: string;
  projectName: string;
  partidaName: string | null;
  title: string;
  severity: NotificationSeverity;
  createdAt: Date;
  dueAt: Date | null;
  overdue: boolean;
  authorName: string | null;
  deepLink: string;
};

export type PendingFilters = {
  kind?: PendingKind;
  projectId?: string;
  severity?: NotificationSeverity;
  onlyOverdue?: boolean;
};

// Reminders carry no explicit severity column (unlike ChangeRequest.severity).
// WS1 mapping (documented in the R3 remediation report): unresolved = IMPORTANT,
// overdue (dueAt < now) = CRITICAL.
function reminderSeverity(dueAt: Date, now: Date): NotificationSeverity {
  return dueAt.getTime() < now.getTime() ? NotificationSeverity.CRITICAL : NotificationSeverity.IMPORTANT;
}

// Sort contract (brief): CRITICAL first, then overdue (of the remaining),
// then IMPORTANT, then newest as the final tiebreak within each tier.
function sortRank(item: PendingItem): number {
  if (item.severity === NotificationSeverity.CRITICAL) return 0;
  if (item.overdue) return 1;
  if (item.severity === NotificationSeverity.IMPORTANT) return 2;
  return 3;
}

export async function loadPendingItems(user: SessionUser, filters: PendingFilters = {}): Promise<PendingItem[]> {
  const now = new Date();
  const accessWhere = projectAccessWhere(user);

  const [requests, reminders] = await Promise.all([
    filters.kind === "reminder"
      ? Promise.resolve([])
      : prisma.changeRequest.findMany({
          where: {
            status: "OPEN",
            project: accessWhere,
            ...(filters.projectId ? { projectId: filters.projectId } : {}),
            ...(filters.kind === "request"
              ? { kind: RequestKind.CHANGE }
              : filters.kind === "alert"
                ? { kind: RequestKind.ALERT }
                : {}),
          },
          select: {
            id: true, code: true, title: true, kind: true, severity: true, createdAt: true,
            reminderDueAt: true, authorId: true, projectId: true,
            project: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
        }),
    filters.kind === "request" || filters.kind === "alert"
      ? Promise.resolve([])
      : prisma.registro.findMany({
          where: {
            reminderDueAt: { not: null },
            reminderResolvedAt: null,
            partida: {
              deletedAt: null,
              project: accessWhere,
              ...(filters.projectId ? { projectId: filters.projectId } : {}),
            },
          },
          select: {
            id: true, text: true, authorId: true, reminderDueAt: true, serverCreatedAt: true,
            partida: { select: { id: true, name: true, projectId: true, project: { select: { name: true } } } },
          },
          orderBy: { reminderDueAt: "asc" },
        }),
  ]);

  const authorIds = [...new Set([...requests.map((r) => r.authorId), ...reminders.map((r) => r.authorId)])];
  const authors = authorIds.length
    ? await prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } })
    : [];
  const authorMap = new Map(authors.map((a) => [a.id, a.name]));

  const items: PendingItem[] = [];

  for (const r of requests) {
    items.push({
      id: `req:${r.id}`,
      kind: r.kind === "ALERT" ? "alert" : "request",
      projectId: r.projectId,
      projectName: r.project.name,
      partidaName: null,
      title: `${r.code} · ${r.title}`,
      severity: r.severity === "CRITICAL" ? NotificationSeverity.CRITICAL : NotificationSeverity.IMPORTANT,
      createdAt: r.createdAt,
      dueAt: r.reminderDueAt,
      overdue: r.reminderDueAt != null && r.reminderDueAt.getTime() < now.getTime(),
      authorName: authorMap.get(r.authorId) ?? null,
      deepLink: `/app/projects/${r.projectId}/cambios/${r.id}`,
    });
  }

  for (const reg of reminders) {
    const due = reg.reminderDueAt!;
    items.push({
      id: `rem:${reg.id}`,
      kind: "reminder",
      projectId: reg.partida.projectId,
      projectName: reg.partida.project.name,
      partidaName: reg.partida.name,
      title: reg.text?.trim() ? reg.text : "—",
      severity: reminderSeverity(due, now),
      createdAt: reg.serverCreatedAt,
      dueAt: due,
      overdue: due.getTime() < now.getTime(),
      authorName: authorMap.get(reg.authorId) ?? null,
      deepLink: `/app/partidas/${reg.partida.id}`,
    });
  }

  // Severity/overdue filters apply here (reminder severity is derived, not a
  // stored column, so it cannot be pushed into the reminder WHERE above).
  let filtered = items;
  if (filters.severity) filtered = filtered.filter((i) => i.severity === filters.severity);
  if (filters.onlyOverdue) filtered = filtered.filter((i) => i.overdue);

  filtered.sort((a, b) => {
    const ra = sortRank(a), rb = sortRank(b);
    if (ra !== rb) return ra - rb;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return filtered;
}

// Lightweight count for the sidebar badge (app/app/layout.tsx) — mirrors the
// same scope/openness rules as loadPendingItems without the row/author fetch.
export async function countPendingItems(user: SessionUser): Promise<number> {
  const accessWhere = projectAccessWhere(user);
  const [openRequests, openReminders] = await Promise.all([
    prisma.changeRequest.count({ where: { status: "OPEN", project: accessWhere } }),
    prisma.registro.count({
      where: { reminderDueAt: { not: null }, reminderResolvedAt: null, partida: { deletedAt: null, project: accessWhere } },
    }),
  ]);
  return openRequests + openReminders;
}
