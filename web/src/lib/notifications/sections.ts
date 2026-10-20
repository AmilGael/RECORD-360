import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { pageWindow } from "@/lib/feed/paginate";
import { buildNotificationWhere, type NotificationFilters } from "@/lib/notifications/query";
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
  const { status, ...rest } = filters;
  const showUnread = status !== "read";
  const showRead = status !== "unread";
  const { unreadPage, readPage, pageSize } = opts;

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
