import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { generateRegistrationCode } from "@/lib/project/registration-code";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { concludePartida, reopenPartida, closeSegment, reopenSegment } from "@/app/actions/lifecycle";
import { createPartida } from "@/app/actions/admin";
import { updatePartidaProgress } from "@/app/actions/partida-progress";
import { rejectedText } from "./helpers/user-message";

let companyId = "", adminId = "", managerId = "", projectId = "";

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `Lifecycle Co ${s}` } })).id;
  adminId = (await prisma.user.create({ data: { email: `lc-adm-${s}@x.do`, name: "Admin", role: "ADMIN", companyId, passwordHash: "x" } })).id;
  managerId = (await prisma.user.create({ data: { email: `lc-mgr-${s}@x.do`, name: "Manager", role: "MANAGER", companyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `Lifecycle Project ${s}`, registrationCode: generateRegistrationCode() } })).id;
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.registro.deleteMany({ where: { partida: { projectId } } });
  await prisma.partida.deleteMany({ where: { projectId } });
  await prisma.segment.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, managerId] } } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

beforeEach(() => { authMock.mockReset(); revalidatePathMock.mockReset(); });

function fd(entries: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}
const asAdmin = () => authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });

describe("concludePartida", () => {
  it("sets progressPct 100, completedAt/By, priorProgressPct, writes audit and notifies", async () => {
    const p = await prisma.partida.create({ data: { projectId, name: "Zapata N1", progressPct: 62 } });
    asAdmin();
    await concludePartida(fd({ partidaId: p.id }));

    const after = await prisma.partida.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.progressPct).toBe(100);
    expect(after.completedAt).not.toBeNull();
    expect(after.completedById).toBe(adminId);
    expect(after.priorProgressPct).toBe(62);

    const audit = await prisma.auditLog.findFirst({ where: { targetId: p.id, action: "partida.completed" } });
    expect(audit).not.toBeNull();

    const notif = await prisma.notification.findMany({ where: { companyId, eventKey: "partida.completed", userId: managerId, link: `/app/partidas/${p.id}` } });
    expect(notif.length).toBe(1);
  });

  it("is idempotent: a second conclude on an already-concluded partida does not duplicate audit/notification", async () => {
    const p = await prisma.partida.create({ data: { projectId, name: "Zapata N2", progressPct: 10 } });
    asAdmin();
    await concludePartida(fd({ partidaId: p.id }));
    await concludePartida(fd({ partidaId: p.id }));

    const audits = await prisma.auditLog.count({ where: { targetId: p.id, action: "partida.completed" } });
    expect(audits).toBe(1);
    const notifs = await prisma.notification.count({ where: { companyId, eventKey: "partida.completed", userId: managerId, link: `/app/partidas/${p.id}` } });
    expect(notifs).toBe(1);
  });

  it("rejects concluding a partida in an archived project", async () => {
    const archivedProjectId = (await prisma.project.create({ data: { companyId, name: "Archived P", registrationCode: generateRegistrationCode(), archivedAt: new Date() } })).id;
    const p = await prisma.partida.create({ data: { projectId: archivedProjectId, name: "Archived Partida" } });
    asAdmin();
    await expect(concludePartida(fd({ partidaId: p.id }))).rejects.toThrow();
    await prisma.partida.deleteMany({ where: { projectId: archivedProjectId } });
    await prisma.project.delete({ where: { id: archivedProjectId } });
  });

  it("two concurrent concludes produce exactly one audit row and one notification batch", async () => {
    const p = await prisma.partida.create({ data: { projectId, name: "Conclusion concurrente", progressPct: 30 } });
    asAdmin();
    // Both invocations pass the pre-tx fast path; the guarded UPDATE inside the
    // transaction lets exactly one through (count 1) — the loser is a no-op.
    await Promise.all([concludePartida(fd({ partidaId: p.id })), concludePartida(fd({ partidaId: p.id }))]);

    const after = await prisma.partida.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.progressPct).toBe(100);
    expect(after.priorProgressPct).toBe(30); // the winner's copy, not overwritten by the loser

    const audits = await prisma.auditLog.count({ where: { targetId: p.id, action: "partida.completed" } });
    expect(audits).toBe(1);
    const notifs = await prisma.notification.count({ where: { companyId, eventKey: "partida.completed", userId: managerId, link: `/app/partidas/${p.id}` } });
    expect(notifs).toBe(1);
  });
});

describe("reopenPartida", () => {
  it("restores priorProgressPct capped at 99 and clears completion metadata", async () => {
    // Seed directly at 100 (bypassing manual-write caps) to exercise the cap on reopen.
    const p = await prisma.partida.create({ data: { projectId, name: "Losa N1", progressPct: 100 } });
    asAdmin();
    await concludePartida(fd({ partidaId: p.id })); // priorProgressPct := 100
    await reopenPartida(fd({ partidaId: p.id }));

    const after = await prisma.partida.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.completedAt).toBeNull();
    expect(after.completedById).toBeNull();
    expect(after.progressPct).toBe(99);

    const audit = await prisma.auditLog.findFirst({ where: { targetId: p.id, action: "partida.reopened" } });
    expect(audit).not.toBeNull();
  });

  it("is idempotent on an already-open partida (no-op)", async () => {
    const p = await prisma.partida.create({ data: { projectId, name: "Losa N2", progressPct: 40 } });
    asAdmin();
    await reopenPartida(fd({ partidaId: p.id }));
    const after = await prisma.partida.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.progressPct).toBe(40);
    const audit = await prisma.auditLog.findFirst({ where: { targetId: p.id, action: "partida.reopened" } });
    expect(audit).toBeNull();
  });

  it("is rejected while the parent block is closed", async () => {
    const segment = await prisma.segment.create({ data: { projectId, name: "Bloque cerrado test" } });
    const p = await prisma.partida.create({ data: { projectId, segmentId: segment.id, name: "Partida en bloque" } });
    asAdmin();
    await concludePartida(fd({ partidaId: p.id }));
    await closeSegment(fd({ segmentId: segment.id })); // all partidas concluded -> closes fine
    expect(await rejectedText(reopenPartida(fd({ partidaId: p.id })))).toMatch(/bloque/i);
  });
});

describe("manual progress invariant (updatePartidaProgress)", () => {
  it("rejects 100 (must use Conclude)", async () => {
    const p = await prisma.partida.create({ data: { projectId, name: "Progreso manual", progressPct: 50 } });
    asAdmin();
    expect(await rejectedText(updatePartidaProgress(fd({ partidaId: p.id, progressPct: "100" })))).toMatch(/99/);
    const after = await prisma.partida.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.progressPct).toBe(50);
  });

  it("rejects manual edits on a concluded partida", async () => {
    const p = await prisma.partida.create({ data: { projectId, name: "Concluida no editable", progressPct: 50 } });
    asAdmin();
    await concludePartida(fd({ partidaId: p.id }));
    await expect(updatePartidaProgress(fd({ partidaId: p.id, progressPct: "60" }))).rejects.toThrow();
  });

  it("accepts values 0-99 on an open partida", async () => {
    const p = await prisma.partida.create({ data: { projectId, name: "Progreso ok", progressPct: 0 } });
    asAdmin();
    await updatePartidaProgress(fd({ partidaId: p.id, progressPct: "99" }));
    const after = await prisma.partida.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.progressPct).toBe(99);
  });
});

describe("closeSegment / reopenSegment", () => {
  it("rejects closing while an open partida remains", async () => {
    const segment = await prisma.segment.create({ data: { projectId, name: "Bloque con pendientes" } });
    await prisma.partida.create({ data: { projectId, segmentId: segment.id, name: "Sin concluir" } });
    asAdmin();
    expect(await rejectedText(closeSegment(fd({ segmentId: segment.id })))).toMatch(/sin concluir/i);
    const after = await prisma.segment.findUniqueOrThrow({ where: { id: segment.id } });
    expect(after.closedAt).toBeNull();
  });

  it("allows closing when every partida is concluded", async () => {
    const segment = await prisma.segment.create({ data: { projectId, name: "Bloque completo" } });
    const p1 = await prisma.partida.create({ data: { projectId, segmentId: segment.id, name: "P1" } });
    const p2 = await prisma.partida.create({ data: { projectId, segmentId: segment.id, name: "P2" } });
    asAdmin();
    await concludePartida(fd({ partidaId: p1.id }));
    await concludePartida(fd({ partidaId: p2.id }));
    await closeSegment(fd({ segmentId: segment.id }));
    const after = await prisma.segment.findUniqueOrThrow({ where: { id: segment.id } });
    expect(after.closedAt).not.toBeNull();
    expect(after.closedById).toBe(adminId);
    const notif = await prisma.notification.findMany({ where: { companyId, eventKey: "block.closed", userId: managerId, title: `Bloque cerrado: ${segment.name}` } });
    expect(notif.length).toBe(1);
  });

  it("allows closing an empty block (documented decision)", async () => {
    const segment = await prisma.segment.create({ data: { projectId, name: "Bloque vacio" } });
    asAdmin();
    await closeSegment(fd({ segmentId: segment.id }));
    const after = await prisma.segment.findUniqueOrThrow({ where: { id: segment.id } });
    expect(after.closedAt).not.toBeNull();
  });

  it("rejects closing a block in an archived project (symmetric lifecycle gating)", async () => {
    const archivedProjectId = (await prisma.project.create({ data: { companyId, name: "Archived seg P", registrationCode: generateRegistrationCode(), archivedAt: new Date() } })).id;
    const segment = await prisma.segment.create({ data: { projectId: archivedProjectId, name: "Bloque en obra archivada" } });
    asAdmin();
    expect(await rejectedText(closeSegment(fd({ segmentId: segment.id })))).toMatch(/archivada/i);
    const after = await prisma.segment.findUniqueOrThrow({ where: { id: segment.id } });
    expect(after.closedAt).toBeNull();
    await prisma.segment.delete({ where: { id: segment.id } });
    await prisma.project.delete({ where: { id: archivedProjectId } });
  });

  it("reopenSegment clears closedAt and is idempotent", async () => {
    const segment = await prisma.segment.create({ data: { projectId, name: "Bloque a reabrir" } });
    asAdmin();
    await closeSegment(fd({ segmentId: segment.id }));
    await reopenSegment(fd({ segmentId: segment.id }));
    const after = await prisma.segment.findUniqueOrThrow({ where: { id: segment.id } });
    expect(after.closedAt).toBeNull();
    expect(after.closedById).toBeNull();

    await reopenSegment(fd({ segmentId: segment.id })); // no-op, must not throw
    const auditCount = await prisma.auditLog.count({ where: { targetId: segment.id, action: "segment.reopened" } });
    expect(auditCount).toBe(1);
  });
});

describe("createPartida rejects a closed block", () => {
  it("throws when the resolved segment is closed", async () => {
    const segment = await prisma.segment.create({ data: { projectId, name: "Bloque Cerrado XYZ", closedAt: new Date() } });
    asAdmin();
    expect(await rejectedText(
      createPartida(fd({ projectId, name: "No debería crearse", segment: "Bloque Cerrado XYZ" })),
    )).toMatch(/cerrado/i);
    const count = await prisma.partida.count({ where: { segmentId: segment.id } });
    expect(count).toBe(0);
  });
});
