import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { generateRegistrationCode } from "@/lib/project/registration-code";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { POST } from "@/app/api/offline/registros/route";

let companyId = "", userId = "", otherCo = "", otherUser = "", projectId = "", partidaId = "";
beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `Sync Co ${s}` } })).id;
  userId = (await prisma.user.create({ data: { email: `s-${s}@x.do`, name: "S", role: "ADMIN", companyId, passwordHash: "x" } })).id;
  otherCo = (await prisma.company.create({ data: { name: `Other ${s}` } })).id;
  otherUser = (await prisma.user.create({ data: { email: `x-${s}@x.do`, name: "X", role: "ADMIN", companyId: otherCo, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `Sync P ${s}`, registrationCode: generateRegistrationCode() } })).id;
  partidaId = (await prisma.partida.create({ data: { projectId, name: "sync" } })).id;
});
afterAll(async () => {
  await prisma.registro.deleteMany({ where: { partidaId } });
  await prisma.partida.deleteMany({ where: { id: partidaId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherUser] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCo] } } });
  await prisma.$disconnect();
});
beforeEach(() => authMock.mockReset());

function req(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new Request("http://localhost/api/offline/registros", { method: "POST", body: fd });
}
const asUser = () => authMock.mockResolvedValue({ user: { id: userId, companyId, role: "ADMIN" } });

describe("POST /api/offline/registros", () => {
  it("401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(req({ partidaId, idempotencyKey: "k1", text: "x" }));
    expect(res.status).toBe(401);
  });
  it("404 when the partida is not in the caller's tenant/access", async () => {
    authMock.mockResolvedValue({ user: { id: otherUser, companyId: otherCo, role: "ADMIN" } });
    const res = await POST(req({ partidaId, idempotencyKey: "k2", text: "x" }));
    expect(res.status).toBe(404);
  });
  it("creates a registro with idempotencyKey + clientCapturedAt", async () => {
    asUser();
    const res = await POST(req({ partidaId, idempotencyKey: "k3", text: "hola", clientCapturedAt: "2026-06-01T14:03:00.000Z" }));
    expect(res.status).toBe(200);
    const rec = await prisma.registro.findFirst({ where: { idempotencyKey: "k3" } });
    expect(rec?.text).toBe("hola");
    expect(rec?.clientCapturedAt?.toISOString()).toBe("2026-06-01T14:03:00.000Z");
  });
  it("rejects past-dated reminderDueAt values on the offline API when no clientCapturedAt anchors it", async () => {
    asUser();
    const res = await POST(req({
      partidaId,
      idempotencyKey: "k-reminder",
      text: "reminder",
      reminderDueAt: "2026-06-01T14:03:00.000Z",
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Recordatorio/i);
  });
  it("accepts a now-past reminderDueAt that was still valid at clientCapturedAt (R3 WS10 offline policy)", async () => {
    asUser();
    // Captured at 2026-06-01T14:00:00Z with a reminder 3 minutes later — valid
    // at capture time, but both are long past "now" by the time this test runs.
    const res = await POST(req({
      partidaId,
      idempotencyKey: "k-reminder-offline",
      text: "reminder offline",
      clientCapturedAt: "2026-06-01T14:00:00.000Z",
      reminderDueAt: "2026-06-01T14:03:00.000Z",
    }));
    expect(res.status).toBe(200);
    const rec = await prisma.registro.findFirst({ where: { idempotencyKey: "k-reminder-offline" } });
    expect(rec?.reminderDueAt?.toISOString()).toBe("2026-06-01T14:03:00.000Z");
  });
  it("still rejects an offline reminderDueAt that was ALREADY past clientCapturedAt - 60s", async () => {
    asUser();
    const res = await POST(req({
      partidaId,
      idempotencyKey: "k-reminder-bad-offline",
      text: "reminder bad offline",
      clientCapturedAt: "2026-06-01T14:00:00.000Z",
      reminderDueAt: "2026-06-01T13:00:00.000Z",
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Recordatorio/i);
  });
  it("is idempotent: same key twice → one row, returns existing id", async () => {
    asUser();
    const a = await POST(req({ partidaId, idempotencyKey: "k4", text: "once" }));
    const b = await POST(req({ partidaId, idempotencyKey: "k4", text: "once" }));
    expect(a.status).toBe(200); expect(b.status).toBe(200);
    expect(await prisma.registro.count({ where: { idempotencyKey: "k4" } })).toBe(1);
  });
});
