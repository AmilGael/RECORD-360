// R3 WS3: server-side (DB-level) search/filter for the notifications page.
// NEVER fetch-all-then-filter — every clause here narrows the Prisma query
// itself; getNotificationSections paginates each section with `take`/`skip`
// on top of this where-clause.
import type { NotificationSeverity, Prisma } from "@prisma/client";
import { LEGACY_TYPE_ALIASES, type EventKey } from "./events";

export type NotificationFilters = {
  q?: string;
  status?: "unread" | "read";
  projectId?: string;
  type?: EventKey;
  severity?: NotificationSeverity;
  from?: Date;
  to?: Date;
};

// Legacy `type` strings (e.g. "cambio.created") that alias a given canonical
// key — so filtering by `request.created` also matches pre-WS3 rows that only
// ever wrote the legacy string and never got an eventKey backfilled.
export function legacyAliasesFor(key: EventKey): string[] {
  return Object.entries(LEGACY_TYPE_ALIASES)
    .filter(([, canonical]) => canonical === key)
    .map(([legacy]) => legacy);
}

export function buildNotificationWhere(userId: string, f: NotificationFilters): Prisma.NotificationWhereInput {
  const clauses: Prisma.NotificationWhereInput[] = [{ userId }];

  if (f.q) {
    clauses.push({
      OR: [
        { title: { contains: f.q, mode: "insensitive" } },
        { body: { contains: f.q, mode: "insensitive" } },
      ],
    });
  }
  if (f.status === "unread") clauses.push({ readAt: null });
  if (f.status === "read") clauses.push({ readAt: { not: null } });
  if (f.projectId) clauses.push({ projectId: f.projectId });
  if (f.type) {
    const legacy = legacyAliasesFor(f.type);
    clauses.push({ OR: [{ eventKey: f.type }, ...(legacy.length ? [{ type: { in: legacy } }] : [])] });
  }
  if (f.severity) clauses.push({ severity: f.severity });
  if (f.from || f.to) {
    clauses.push({
      createdAt: {
        ...(f.from ? { gte: f.from } : {}),
        ...(f.to ? { lte: f.to } : {}),
      },
    });
  }

  return { AND: clauses };
}
