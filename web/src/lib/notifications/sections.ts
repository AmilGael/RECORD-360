import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { pageWindow } from "@/lib/feed/paginate";
import { buildNotificationWhere, notificationWhereSql, type NotificationFilters } from "@/lib/notifications/query";
import { searchLikePattern } from "@/lib/text/fold";
import type { NotificationListItem, NotificationSection, NotificationSectionsState } from "@/lib/notifications/sections-state";

export type { NotificationListItem, NotificationSection, NotificationSectionsState };

const ITEM_SELECT = {
  id: true,
  title: true,
  body: true,
  link: true,
  severity: true,
  createdAt: true,
  readAt: true,
} satisfies Prisma.NotificationSelect;

function emptySection(page: number, pageSize: number): NotificationSection {
  const win = pageWindow(0, page, pageSize);
  return { items: [], total: 0, ...win };
}

function toSection(
  items: NotificationListItem[],
  total: number,
  page: number,
  pageSize: number,
): NotificationSection {
  const win = pageWindow(total, page, pageSize);
  return { items, total, ...win };
}

export async function getNotificationSections(
  userId: string,
  filters: NotificationFilters,
  opts: { unreadPage: number; readPage: number; pageSize: number },
): Promise<NotificationSectionsState> {
  const { status, q, ...rest } = filters;
  const showUnread = status !== "read";
  const showRead = status !== "unread";
  const { unreadPage, readPage, pageSize } = opts;
  const pattern = q ? searchLikePattern(q) : null;
  if (pattern) return searchSections(userId, rest, pattern, { showUnread, showRead, unreadPage, readPage, pageSize });

  const unreadWhere = buildNotificationWhere(userId, { ...rest, status: "unread" });
  const readWhere = buildNotificationWhere(userId, { ...rest, status: "read" });

  const [unreadTotal, readTotal] = await Promise.all([
    showUnread ? prisma.notification.count({ where: unreadWhere }) : Promise.resolve(0),
    showRead ? prisma.notification.count({ where: readWhere }) : Promise.resolve(0),
  ]);

  const unreadWin = pageWindow(unreadTotal, unreadPage, pageSize);
  const readWin = pageWindow(readTotal, readPage, pageSize);

  const [unreadItems, readItems] = await Promise.all([
    showUnread
      ? prisma.notification.findMany({
          where: unreadWhere,
          // Postgres enum declaration order is SUCCESS, IMPORTANT, CRITICAL.
          // DESC + nulls last yields CRITICAL, IMPORTANT, SUCCESS, then null.
          // Proved in tests/notification-sections.test.ts against the local DB.
          orderBy: [{ severity: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
          take: pageSize,
          skip: unreadWin.skip,
          select: ITEM_SELECT,
        })
      : Promise.resolve([]),
    showRead
      ? prisma.notification.findMany({
          where: readWhere,
          orderBy: [{ createdAt: "desc" }],
          take: pageSize,
          skip: readWin.skip,
          select: ITEM_SELECT,
        })
      : Promise.resolve([]),
  ]);

  return {
    unread: showUnread ? toSection(unreadItems, unreadTotal, unreadPage, pageSize) : emptySection(unreadPage, pageSize),
    read: showRead ? toSection(readItems, readTotal, readPage, pageSize) : emptySection(readPage, pageSize),
  };
}

type SectionOpts = { showUnread: boolean; showRead: boolean; unreadPage: number; readPage: number; pageSize: number };

/**
 * The same two sections for a text query. Counts and page ids come from SQL on
 * notificationWhereSql, so the work stays bounded by the page size; only those
 * ids (at most two pages) are loaded through Prisma. Ordering matches the
 * Prisma path: unread by severity DESC NULLS LAST then newest; read newest first.
 */
async function searchSections(
  userId: string,
  filters: Omit<NotificationFilters, "status" | "q">,
  pattern: string,
  { showUnread, showRead, unreadPage, readPage, pageSize }: SectionOpts,
): Promise<NotificationSectionsState> {
  const unreadWhere = notificationWhereSql(userId, { ...filters, status: "unread" }, pattern);
  const readWhere = notificationWhereSql(userId, { ...filters, status: "read" }, pattern);
  const count = async (where: Prisma.Sql) =>
    (await prisma.$queryRaw<{ n: number }[]>(Prisma.sql`SELECT count(*)::int AS n FROM "Notification" WHERE ${where}`))[0]?.n ?? 0;
  const ids = async (query: Prisma.Sql) => (await prisma.$queryRaw<{ id: string }[]>(query)).map((r) => r.id);

  const [unreadTotal, readTotal] = await Promise.all([
    showUnread ? count(unreadWhere) : Promise.resolve(0),
    showRead ? count(readWhere) : Promise.resolve(0),
  ]);
  const unreadWin = pageWindow(unreadTotal, unreadPage, pageSize);
  const readWin = pageWindow(readTotal, readPage, pageSize);

  const [unreadIds, readIds] = await Promise.all([
    showUnread && unreadTotal > 0
      ? ids(Prisma.sql`SELECT id FROM "Notification" WHERE ${unreadWhere}
          ORDER BY "severity" DESC NULLS LAST, "createdAt" DESC LIMIT ${pageSize} OFFSET ${unreadWin.skip}`)
      : Promise.resolve([] as string[]),
    showRead && readTotal > 0
      ? ids(Prisma.sql`SELECT id FROM "Notification" WHERE ${readWhere}
          ORDER BY "createdAt" DESC LIMIT ${pageSize} OFFSET ${readWin.skip}`)
      : Promise.resolve([] as string[]),
  ]);
  const pageIds = [...unreadIds, ...readIds];
  const rows = pageIds.length
    ? await prisma.notification.findMany({ where: { id: { in: pageIds }, userId }, select: ITEM_SELECT })
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const pick = (list: string[]) => list.flatMap((id) => { const r = byId.get(id); return r ? [r] : []; });

  return {
    unread: showUnread ? toSection(pick(unreadIds), unreadTotal, unreadPage, pageSize) : emptySection(unreadPage, pageSize),
    read: showRead ? toSection(pick(readIds), readTotal, readPage, pageSize) : emptySection(readPage, pageSize),
  };
}
