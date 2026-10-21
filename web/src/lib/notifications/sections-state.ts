import type { NotificationSeverity } from "@prisma/client";
import { pageWindow } from "@/lib/feed/paginate";

export type NotificationListItem = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  severity: NotificationSeverity | null;
  createdAt: Date | string;
  readAt: Date | string | null;
};

export type NotificationSection = {
  items: NotificationListItem[];
  total: number;
  page: number;
  totalPages: number;
  hasOlder: boolean;
  hasNewer: boolean;
};

export type NotificationSectionsState = {
  unread: NotificationSection;
  read: NotificationSection;
};

export function createdAtMs(n: { createdAt: Date | string }): number {
  const t = typeof n.createdAt === "string" ? Date.parse(n.createdAt) : n.createdAt.getTime();
  return Number.isFinite(t) ? t : 0;
}

function withPageMeta(section: Omit<NotificationSection, "totalPages" | "hasOlder" | "hasNewer">, pageSize: number): NotificationSection {
  const win = pageWindow(section.total, section.page, pageSize);
  return { ...section, page: win.page, totalPages: win.totalPages, hasOlder: win.hasOlder, hasNewer: win.hasNewer };
}

function insertByCreatedAtDesc(items: NotificationListItem[], row: NotificationListItem): NotificationListItem[] {
  const next = items.filter((n) => n.id !== row.id);
  const t = createdAtMs(row);
  const i = next.findIndex((n) => createdAtMs(n) < t);
  if (i === -1) next.push(row);
  else next.splice(i, 0, row);
  return next;
}

// Visible read page is newest-first. A row belongs here when it is not newer
// than this page (page 1 has no upper bound) and not older than the window
// unless the page is short (last page).
export function belongsInReadWindow(
  row: NotificationListItem,
  visible: NotificationListItem[],
  page: number,
  pageSize: number,
): boolean {
  if (visible.length === 0) return page <= 1;
  const t = createdAtMs(row);
  const newest = createdAtMs(visible[0]);
  const oldest = createdAtMs(visible[visible.length - 1]);
  if (page > 1 && t > newest) return false;
  if (t >= oldest) return true;
  return visible.length < pageSize;
}

export function moveNotificationToRead(
  state: NotificationSectionsState,
  id: string,
  pageSize: number,
): NotificationSectionsState {
  const idx = state.unread.items.findIndex((n) => n.id === id);
  if (idx === -1) return state;
  const source = state.unread.items[idx];
  const row: NotificationListItem = { ...source, readAt: source.readAt ?? new Date() };
  const unreadItems = state.unread.items.filter((n) => n.id !== id);
  let readItems = state.read.items.filter((n) => n.id !== id);
  if (belongsInReadWindow(row, readItems, state.read.page, pageSize)) {
    readItems = insertByCreatedAtDesc(readItems, row).slice(0, pageSize);
  }
  return {
    unread: withPageMeta({ ...state.unread, items: unreadItems, total: Math.max(0, state.unread.total - 1) }, pageSize),
    read: withPageMeta({ ...state.read, items: readItems, total: state.read.total + 1 }, pageSize),
  };
}

export function applyReadOverlay(
  state: NotificationSectionsState,
  ids: readonly string[],
  pageSize: number,
): NotificationSectionsState {
  let next = state;
  const alreadyRead = new Set(state.read.items.map((n) => n.id));
  for (const id of ids) {
    if (alreadyRead.has(id)) continue;
    const moved = moveNotificationToRead(next, id, pageSize);
    if (moved !== next) alreadyRead.add(id);
    next = moved;
  }
  return next;
}
