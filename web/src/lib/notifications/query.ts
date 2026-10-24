// R3 WS3: server-side (DB-level) search/filter for the notifications page.
// NEVER fetch-all-then-filter — every clause here narrows the Prisma query
// itself; getNotificationSections paginates each section with `take`/`skip`
// on top of this where-clause. Text search is not a clause here: a query with
// text takes notificationWhereSql instead, folded the same way as obra search.
import { Prisma, type NotificationSeverity } from "@prisma/client";
import { foldedLike } from "@/lib/text/sql-fold";
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

/** An instant as a UTC timestamp-without-tz value. A bare Date parameter would be
 *  shifted by the session TimeZone (see the same cast in lib/analytics/project.ts). */
function utcTimestampSql(instant: Date): Prisma.Sql {
  return Prisma.sql`(${instant.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
}

/**
 * WHERE for a text search: every clause of buildNotificationWhere plus the
 * folded title/body match, as one SQL condition. Counting and paging run on it
 * directly, so a broad query ("a") never ships its matching ids back to the
 * database as an IN list. Keep in step with buildNotificationWhere below;
 * tests/notifications-search.test.ts checks each filter on this path.
 */
export function notificationWhereSql(userId: string, f: NotificationFilters, pattern: string): Prisma.Sql {
  const parts: Prisma.Sql[] = [Prisma.sql`"userId" = ${userId}`];
  if (f.status === "unread") parts.push(Prisma.sql`"readAt" IS NULL`);
  if (f.status === "read") parts.push(Prisma.sql`"readAt" IS NOT NULL`);
  if (f.projectId) parts.push(Prisma.sql`"projectId" = ${f.projectId}`);
  if (f.type) {
    const legacy = legacyAliasesFor(f.type);
    parts.push(legacy.length
      ? Prisma.sql`("eventKey" = ${f.type} OR "type" IN (${Prisma.join(legacy)}))`
      : Prisma.sql`"eventKey" = ${f.type}`);
  }
  if (f.severity) parts.push(Prisma.sql`"severity" = CAST(${f.severity} AS "NotificationSeverity")`);
  if (f.from) parts.push(Prisma.sql`"createdAt" >= ${utcTimestampSql(f.from)}`);
  if (f.to) parts.push(Prisma.sql`"createdAt" <= ${utcTimestampSql(f.to)}`);
  parts.push(Prisma.sql`(${foldedLike(Prisma.raw(`title`), pattern)} OR ${foldedLike(Prisma.raw(`body`), pattern)})`);
  return Prisma.join(parts, " AND ");
}

export function buildNotificationWhere(userId: string, f: NotificationFilters): Prisma.NotificationWhereInput {
  const clauses: Prisma.NotificationWhereInput[] = [{ userId }];

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
