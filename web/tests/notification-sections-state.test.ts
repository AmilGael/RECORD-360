import { describe, expect, it } from "vitest";
import {
  applyReadOverlay,
  belongsInReadWindow,
  moveNotificationToRead,
  type NotificationListItem,
  type NotificationSection,
  type NotificationSectionsState,
} from "@/lib/notifications/sections-state";

const pageSize = 3;

function row(partial: Partial<NotificationListItem> & Pick<NotificationListItem, "id" | "createdAt">): NotificationListItem {
  return {
    title: partial.title ?? partial.id,
    body: null,
    link: "/app/partidas/x",
    severity: null,
    readAt: null,
    ...partial,
  };
}

function section(items: NotificationListItem[], total: number, page: number): NotificationSection {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    items,
    total,
    page,
    totalPages,
    hasOlder: page < totalPages,
    hasNewer: page > 1,
  };
}

function state(unread: NotificationSection, read: NotificationSection): NotificationSectionsState {
  return { unread, read };
}

describe("belongsInReadWindow", () => {
  const visible = [
    row({ id: "n", createdAt: "2026-10-20T12:00:00.000Z" }),
    row({ id: "o", createdAt: "2026-10-20T10:00:00.000Z" }),
    row({ id: "p", createdAt: "2026-10-20T08:00:00.000Z" }),
  ];

  it("inserts on empty page 1 and rejects empty later pages", () => {
    const r = row({ id: "x", createdAt: "2026-10-20T11:00:00.000Z" });
    expect(belongsInReadWindow(r, [], 1, pageSize)).toBe(true);
    expect(belongsInReadWindow(r, [], 2, pageSize)).toBe(false);
  });

  it("accepts page-1 rows newer than the oldest, and drops older when the page is full", () => {
    expect(belongsInReadWindow(row({ id: "newer", createdAt: "2026-10-20T13:00:00.000Z" }), visible, 1, pageSize)).toBe(true);
    expect(belongsInReadWindow(row({ id: "mid", createdAt: "2026-10-20T11:00:00.000Z" }), visible, 1, pageSize)).toBe(true);
    expect(belongsInReadWindow(row({ id: "older", createdAt: "2026-10-20T07:00:00.000Z" }), visible, 1, pageSize)).toBe(false);
  });

  it("rejects page-2 rows newer than that page's newest", () => {
    expect(belongsInReadWindow(row({ id: "page1", createdAt: "2026-10-20T13:00:00.000Z" }), visible, 2, pageSize)).toBe(false);
    expect(belongsInReadWindow(row({ id: "in", createdAt: "2026-10-20T09:00:00.000Z" }), visible, 2, pageSize)).toBe(true);
  });
});

describe("moveNotificationToRead", () => {
  it("removes the row from unread, drops its count, and raises the read count", () => {
    const a = row({ id: "a", createdAt: "2026-10-20T12:00:00.000Z", title: "A" });
    const b = row({ id: "b", createdAt: "2026-10-20T11:00:00.000Z", title: "B" });
    const next = moveNotificationToRead(
      state(section([a, b], 2, 1), section([], 0, 1)),
      "a",
      pageSize,
    );
    expect(next.unread.items.map((n) => n.id)).toEqual(["b"]);
    expect(next.unread.total).toBe(1);
    expect(next.read.total).toBe(1);
    expect(next.read.items.map((n) => n.id)).toEqual(["a"]);
    expect(next.read.items[0].readAt).not.toBeNull();
  });

  it("inserts into the visible read page only inside its createdAt window and keeps at most pageSize", () => {
    const unreadRow = row({ id: "new", createdAt: "2026-10-20T12:30:00.000Z" });
    const readItems = [
      row({ id: "r1", createdAt: "2026-10-20T12:00:00.000Z", readAt: "2026-10-20T13:00:00.000Z" }),
      row({ id: "r2", createdAt: "2026-10-20T11:00:00.000Z", readAt: "2026-10-20T13:00:00.000Z" }),
      row({ id: "r3", createdAt: "2026-10-20T10:00:00.000Z", readAt: "2026-10-20T13:00:00.000Z" }),
    ];
    const next = moveNotificationToRead(
      state(section([unreadRow], 4, 1), section(readItems, 5, 1)),
      "new",
      pageSize,
    );
    expect(next.read.items.map((n) => n.id)).toEqual(["new", "r1", "r2"]);
    expect(next.read.items).toHaveLength(pageSize);
    expect(next.read.total).toBe(6);
  });

  it("does not insert a row older than a full page-1 window", () => {
    const unreadRow = row({ id: "old", createdAt: "2026-10-20T09:00:00.000Z" });
    const readItems = [
      row({ id: "r1", createdAt: "2026-10-20T12:00:00.000Z", readAt: "x" }),
      row({ id: "r2", createdAt: "2026-10-20T11:00:00.000Z", readAt: "x" }),
      row({ id: "r3", createdAt: "2026-10-20T10:00:00.000Z", readAt: "x" }),
    ];
    const next = moveNotificationToRead(
      state(section([unreadRow], 1, 1), section(readItems, 3, 1)),
      "old",
      pageSize,
    );
    expect(next.read.items.map((n) => n.id)).toEqual(["r1", "r2", "r3"]);
    expect(next.read.total).toBe(4);
    expect(next.unread.total).toBe(0);
  });

  it("is a no-op when the id is not on the visible unread page", () => {
    const s = state(section([row({ id: "a", createdAt: "2026-10-20T12:00:00.000Z" })], 1, 1), section([], 0, 1));
    expect(moveNotificationToRead(s, "missing", pageSize)).toBe(s);
  });
});

describe("applyReadOverlay", () => {
  it("moves overlay ids that are still unread and skips ids already in Leídas", () => {
    const a = row({ id: "a", createdAt: "2026-10-20T12:00:00.000Z" });
    const b = row({ id: "b", createdAt: "2026-10-20T11:00:00.000Z", readAt: "2026-10-20T13:00:00.000Z" });
    const next = applyReadOverlay(
      state(section([a], 1, 1), section([b], 1, 1)),
      ["a", "b", "ghost"],
      pageSize,
    );
    expect(next.unread.items).toEqual([]);
    expect(next.unread.total).toBe(0);
    expect(next.read.total).toBe(2);
    expect(next.read.items.map((n) => n.id)).toEqual(["a", "b"]);
  });
});
