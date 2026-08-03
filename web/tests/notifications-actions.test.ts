import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { markNotificationRead, markAllNotificationsRead } from "@/app/actions/notifications";

let companyId = "", userAId = "", userBId = "";

beforeAll(async () => {
  const s = `notif-actions-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `NA Co ${s}` } })).id;
  userAId = (await prisma.user.create({ data: { email: `ua-${s}@x.do`, name: "UserA", role: "SUPERVISOR", companyId, passwordHash: "x" } })).id;
  userBId = (await prisma.user.create({ data: { email: `ub-${s}@x.do`, name: "UserB", role: "RESIDENT", companyId, passwordHash: "x" } })).id;
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

beforeEach(() => { authMock.mockReset(); revalidatePathMock.mockReset(); });

async function seedNotification(userId: string, readAt: Date | null = null) {
  return prisma.notification.create({
    data: { companyId, userId, type: "test", title: "Test notification", readAt },
  });
}

describe("markNotificationRead", () => {
  it("sets readAt for the notification owner", async () => {
    authMock.mockResolvedValue({ user: { id: userAId, companyId, role: "SUPERVISOR" } });
    const n = await seedNotification(userAId);

    const fd = new FormData();
    fd.set("id", n.id);
    await markNotificationRead(fd);

    const after = await prisma.notification.findUniqueOrThrow({ where: { id: n.id } });
    expect(after.readAt).not.toBeNull();
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/notifications");
    // Layout scope, not the default "page" scope: the unread badge is rendered
    // by app/app/layout.tsx, so a page-scoped revalidation leaves it stale on
    // every /app route except /app itself.
    expect(revalidatePathMock).toHaveBeenCalledWith("/app", "layout");
  });

  it("does NOT affect another user's notification (cross-user no-op)", async () => {
    authMock.mockResolvedValue({ user: { id: userAId, companyId, role: "SUPERVISOR" } });
    const n = await seedNotification(userBId); // belongs to userB

    const fd = new FormData();
    fd.set("id", n.id);
    await markNotificationRead(fd); // called as userA

    const after = await prisma.notification.findUniqueOrThrow({ where: { id: n.id } });
    expect(after.readAt).toBeNull(); // still unread
  });

  it("throws Unauthorized when not logged in", async () => {
    authMock.mockResolvedValue(null);
    const fd = new FormData();
    fd.set("id", "fake-id");
    await expect(markNotificationRead(fd)).rejects.toThrow(/Unauthorized/i);
  });
});

describe("markAllNotificationsRead", () => {
  it("marks only the current user's unread notifications", async () => {
    authMock.mockResolvedValue({ user: { id: userAId, companyId, role: "SUPERVISOR" } });
    // seed: 2 unread for userA, 1 unread for userB
    const nA1 = await seedNotification(userAId);
    const nA2 = await seedNotification(userAId);
    const nB = await seedNotification(userBId);

    await markAllNotificationsRead();

    const afterA1 = await prisma.notification.findUniqueOrThrow({ where: { id: nA1.id } });
    const afterA2 = await prisma.notification.findUniqueOrThrow({ where: { id: nA2.id } });
    const afterB = await prisma.notification.findUniqueOrThrow({ where: { id: nB.id } });

    expect(afterA1.readAt).not.toBeNull();
    expect(afterA2.readAt).not.toBeNull();
    expect(afterB.readAt).toBeNull(); // userB unaffected

    expect(revalidatePathMock).toHaveBeenCalledWith("/app/notifications");
    // Layout scope, not the default "page" scope: the unread badge is rendered
    // by app/app/layout.tsx, so a page-scoped revalidation leaves it stale on
    // every /app route except /app itself.
    expect(revalidatePathMock).toHaveBeenCalledWith("/app", "layout");
  });

  it("throws Unauthorized when not logged in", async () => {
    authMock.mockResolvedValue(null);
    await expect(markAllNotificationsRead()).rejects.toThrow(/Unauthorized/i);
  });
});
