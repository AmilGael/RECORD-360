import { Prisma, type RequestKind, type RequestSeverity } from "@prisma/client";
import { projectAccessWhere, type SessionUser } from "@/lib/authz/projects";
import { prisma } from "@/lib/db";
import { APP_TIME_ZONE, resolveTimeZone } from "@/lib/time/zone";
import { calendarDaysOpen, oldestWeekStartUtc, weekStartKeys } from "./weeks";

const DAY = 86_400_000;
const AUTHOR_LIMIT = 8;

export type AnalyticsClock = { now?: Date; zone?: string };

function clock(opts: AnalyticsClock): { now: Date; zone: string } {
  return { now: opts.now ?? new Date(), zone: resolveTimeZone(opts.zone ?? APP_TIME_ZONE) };
}

/**
 * Instant as a timestamp-without-tz UTC value. A bare Date parameter would be
 * converted with the session TimeZone (UTC on Supabase, America/New_York on
 * this local server), which shifts the window.
 */
function utcTimestampSql(instant: Date): Prisma.Sql {
  return Prisma.sql`(${instant.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
}

function asInt(v: unknown): number {
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseStoredUtc(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function share(total: number, withPhoto: number): { total: number; withPhoto: number; pct: number } {
  return { total, withPhoto, pct: total === 0 ? 0 : Math.round((withPhoto / total) * 100) };
}

export type WeekCount = { week: string; n: number };

export async function weeklyActivity(
  projectId: string,
  opts: AnalyticsClock = {},
): Promise<{ weeks: WeekCount[]; last7Days: number }> {
  const { now, zone } = clock(opts);
  const keys = weekStartKeys(now, zone);
  const since = oldestWeekStartUtc(now, zone);
  const since7 = new Date(now.getTime() - 7 * DAY);

  const [rows, last7] = await Promise.all([
    prisma.$queryRaw<Array<{ week: string; n: unknown }>>(Prisma.sql`
      SELECT to_char(
        date_trunc(
          'week',
          (("serverCreatedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${zone})
        ),
        'YYYY-MM-DD'
      ) AS week,
      count(*)::int AS n
      FROM "Registro" r
      JOIN "Partida" p ON p.id = r."partidaId"
      WHERE p."projectId" = ${projectId}
        AND p."deletedAt" IS NULL
        AND r."serverCreatedAt" >= ${utcTimestampSql(since)}
      GROUP BY 1
    `),
    prisma.$queryRaw<Array<{ n: unknown }>>(Prisma.sql`
      SELECT count(*)::int AS n
      FROM "Registro" r
      JOIN "Partida" p ON p.id = r."partidaId"
      WHERE p."projectId" = ${projectId}
        AND p."deletedAt" IS NULL
        AND r."serverCreatedAt" >= ${utcTimestampSql(since7)}
    `),
  ]);

  const found = new Map(rows.map((r) => [r.week, asInt(r.n)]));
  return {
    weeks: keys.map((week) => ({ week, n: found.get(week) ?? 0 })),
    last7Days: asInt(last7[0]?.n),
  };
}

export type PhotoShare = { segmentId: string | null; total: number; withPhoto: number; pct: number };

export async function photoCoverage(
  projectId: string,
  opts: AnalyticsClock = {},
): Promise<{ overall: { total: number; withPhoto: number; pct: number }; byBloque: PhotoShare[] }> {
  const { now } = clock(opts);
  const since30 = new Date(now.getTime() - 30 * DAY);
  const rows = await prisma.$queryRaw<Array<{ segmentId: string | null; total: unknown; with_photo: unknown }>>(Prisma.sql`
    SELECT
      p."segmentId" AS "segmentId",
      count(*)::int AS total,
      count(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM "Attachment" a
          WHERE a."registroId" = r.id AND a."fileType" = 'IMAGE'
        )
      )::int AS with_photo
    FROM "Registro" r
    JOIN "Partida" p ON p.id = r."partidaId"
    WHERE p."projectId" = ${projectId}
      AND p."deletedAt" IS NULL
      AND r."serverCreatedAt" >= ${utcTimestampSql(since30)}
    GROUP BY p."segmentId"
  `);
  const byBloque = rows.map((r) => ({
    segmentId: r.segmentId,
    ...share(asInt(r.total), asInt(r.with_photo)),
  }));
  return {
    overall: share(
      byBloque.reduce((s, r) => s + r.total, 0),
      byBloque.reduce((s, r) => s + r.withPhoto, 0),
    ),
    byBloque,
  };
}

export type BloqueStatus = {
  segmentId: string | null;
  notStarted: number;
  inProgress: number;
  concluded: number;
};

export async function partidaStatusByBloque(projectId: string): Promise<BloqueStatus[]> {
  const rows = await prisma.$queryRaw<Array<{
    segmentId: string | null;
    notStarted: unknown;
    inProgress: unknown;
    concluded: unknown;
  }>>(Prisma.sql`
    SELECT
      p."segmentId" AS "segmentId",
      count(*) FILTER (WHERE p."completedAt" IS NULL AND p."progressPct" = 0)::int AS "notStarted",
      count(*) FILTER (WHERE p."completedAt" IS NULL AND p."progressPct" <> 0)::int AS "inProgress",
      count(*) FILTER (WHERE p."completedAt" IS NOT NULL)::int AS concluded
    FROM "Partida" p
    WHERE p."projectId" = ${projectId}
      AND p."deletedAt" IS NULL
    GROUP BY p."segmentId"
  `);
  return rows.map((r) => ({
    segmentId: r.segmentId,
    notStarted: asInt(r.notStarted),
    inProgress: asInt(r.inProgress),
    concluded: asInt(r.concluded),
  }));
}

export type OpenAlert = {
  id: string;
  code: string;
  title: string;
  severity: RequestSeverity;
  createdAt: Date;
  daysOpen: number;
};

export async function requestStats(
  projectId: string,
  opts: AnalyticsClock = {},
): Promise<{
  open: number;
  byKindSeverity: { kind: RequestKind; severity: RequestSeverity; n: number }[];
  criticalAlerts: number;
  openAlerts: OpenAlert[];
}> {
  const { now, zone } = clock(opts);
  const [counts, alerts] = await Promise.all([
    prisma.changeRequest.groupBy({
      by: ["kind", "severity"],
      where: { projectId, status: "OPEN" },
      _count: { _all: true },
    }),
    prisma.changeRequest.findMany({
      where: { projectId, status: "OPEN", kind: "ALERT" },
      select: { id: true, code: true, title: true, severity: true, createdAt: true },
      // Enum declaration is IMPORTANT, CRITICAL, so desc puts CRITICAL first.
      orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
    }),
  ]);
  const byKindSeverity = counts.map((c) => ({
    kind: c.kind,
    severity: c.severity,
    n: c._count._all,
  }));
  const open = byKindSeverity.reduce((s, r) => s + r.n, 0);
  const criticalAlerts = byKindSeverity
    .filter((r) => r.kind === "ALERT" && r.severity === "CRITICAL")
    .reduce((s, r) => s + r.n, 0);
  return {
    open,
    byKindSeverity,
    criticalAlerts,
    openAlerts: alerts.map((a) => ({
      ...a,
      daysOpen: calendarDaysOpen(a.createdAt, now, zone),
    })),
  };
}

export async function bloqueLastActivity(
  projectId: string,
): Promise<{ segmentId: string | null; lastAt: Date | null }[]> {
  const rows = await prisma.$queryRaw<Array<{ segmentId: string | null; last_at: string | null }>>(Prisma.sql`
    SELECT
      p."segmentId" AS "segmentId",
      to_char(max(r."serverCreatedAt"), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_at
    FROM "Registro" r
    JOIN "Partida" p ON p.id = r."partidaId"
    WHERE p."projectId" = ${projectId}
      AND p."deletedAt" IS NULL
    GROUP BY p."segmentId"
  `);
  return rows.map((r) => ({ segmentId: r.segmentId, lastAt: parseStoredUtc(r.last_at) }));
}

export type AuthorCount = { authorId: string; name: string | null; n: number };

export async function entriesByAuthor(
  projectId: string,
  viewer: SessionUser,
  opts: AnalyticsClock = {},
): Promise<AuthorCount[]> {
  const { now } = clock(opts);
  const since30 = new Date(now.getTime() - 30 * DAY);
  // Raw SQL so the 30-day window uses the ISO cast (Prisma Date would follow
  // session TimeZone). ORDER BY matches groupBy orderBy
  // [{ _count: { authorId: "desc" } }, { authorId: "asc" }].
  const rows = await prisma.$queryRaw<Array<{ authorId: string; n: unknown }>>(Prisma.sql`
    SELECT r."authorId" AS "authorId", count(*)::int AS n
    FROM "Registro" r
    JOIN "Partida" p ON p.id = r."partidaId"
    WHERE p."projectId" = ${projectId}
      AND p."deletedAt" IS NULL
      AND r."serverCreatedAt" >= ${utcTimestampSql(since30)}
    GROUP BY r."authorId"
    ORDER BY count(*) DESC, r."authorId" ASC
    LIMIT ${AUTHOR_LIMIT}
  `);
  const ids = rows.map((r) => r.authorId);
  const users = ids.length
    ? await prisma.user.findMany({
      where: { id: { in: ids }, companyId: viewer.companyId },
      select: { id: true, name: true },
    })
    : [];
  const names = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    authorId: r.authorId,
    name: names.get(r.authorId) ?? null,
    n: asInt(r.n),
  }));
}

export type ProjectAnalytics = {
  weekly: { weeks: WeekCount[]; last7Days: number };
  photo: { overall: { total: number; withPhoto: number; pct: number }; byBloque: PhotoShare[] };
  status: BloqueStatus[];
  requests: {
    open: number;
    byKindSeverity: { kind: RequestKind; severity: RequestSeverity; n: number }[];
    criticalAlerts: number;
    openAlerts: OpenAlert[];
  };
  lastActivity: { segmentId: string | null; lastAt: Date | null }[];
  authors: AuthorCount[];
};

export async function getProjectAnalytics(
  user: SessionUser,
  projectId: string,
  opts: AnalyticsClock = {},
): Promise<ProjectAnalytics | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, ...projectAccessWhere(user) },
    select: { id: true },
  });
  if (!project) return null;

  const [weekly, photo, status, requests, lastActivity, authors] = await Promise.all([
    weeklyActivity(projectId, opts),
    photoCoverage(projectId, opts),
    partidaStatusByBloque(projectId),
    requestStats(projectId, opts),
    bloqueLastActivity(projectId),
    entriesByAuthor(projectId, user, opts),
  ]);
  return { weekly, photo, status, requests, lastActivity, authors };
}
