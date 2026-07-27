import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { appendRegistro } from "@/lib/registro/append";
import { generateRegistrationCode } from "@/lib/project/registration-code";
import { loadPendingItems, countPendingItems } from "@/lib/notifications/pending";

// R3 WS1: server-backed operational pending queue projection — open requests/
// alerts + unresolved registro reminders, scoped by projectAccessWhere.

let companyId = "", otherCompanyId = "";
let adminId = "", residentId = "", otherCompanyAdminId = "";
let projectA = "", projectB = "", otherProject = "";
let partidaA = "", otherPartida = "";

beforeAll(async () => {
  const s = `pq-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `PQ Co ${s}` } })).id;
  otherCompanyId = (await prisma.company.create({ data: { name: `PQ Other Co ${s}` } })).id;

  adminId = (await prisma.user.create({ data: { email: `pq-adm-${s}@x.do`, name: "Admin", role: "ADMIN", companyId, passwordHash: "x" } })).id;
  residentId = (await prisma.user.create({ data: { email: `pq-res-${s}@x.do`, name: "Resident", role: "RESIDENT", companyId, passwordHash: "x" } })).id;
  otherCompanyAdminId = (await prisma.user.create({ data: { email: `pq-oadm-${s}@x.do`, name: "OtherAdmin", role: "ADMIN", companyId: otherCompanyId, passwordHash: "x" } })).id;

  projectA = (await prisma.project.create({ data: { companyId, name: `PQ Project A ${s}`, registrationCode: generateRegistrationCode() } })).id;
  projectB = (await prisma.project.create({ data: { companyId, name: `PQ Project B ${s}`, registrationCode: generateRegistrationCode() } })).id;
  otherProject = (await prisma.project.create({ data: { companyId: otherCompanyId, name: `PQ Other Project ${s}`, registrationCode: generateRegistrationCode() } })).id;

  // Resident is assigned ONLY to project A.
  await prisma.projectAssignment.create({ data: { projectId: projectA, userId: residentId, role: "RESIDENT" } });

  partidaA = (await prisma.partida.create({ data: { projectId: projectA, name: "Partida A" } })).id;
  otherPartida = (await prisma.partida.create({ data: { projectId: otherProject, name: "Partida Other" } })).id;

  // Open requests/alerts.
  await prisma.changeRequest.create({ data: { projectId: projectA, code: "SC-1", kind: "CHANGE", severity: "IMPORTANT", title: "Cambio abierto A", authorId: adminId, status: "OPEN" } });
  await prisma.changeRequest.create({ data: { projectId: projectA, code: "SC-2", kind: "ALERT", severity: "CRITICAL", title: "Alerta abierta A", authorId: adminId, status: "OPEN" } });
  await prisma.changeRequest.create({ data: { projectId: projectA, code: "SC-3", kind: "CHANGE", severity: "IMPORTANT", title: "Cambio integrado A", authorId: adminId, status: "INTEGRATED", resolvedAt: new Date(), resolvedById: adminId } });
  await prisma.changeRequest.create({ data: { projectId: projectB, code: "SC-1", kind: "CHANGE", severity: "IMPORTANT", title: "Cambio abierto B", authorId: adminId, status: "OPEN" } });
  await prisma.changeRequest.create({ data: { projectId: otherProject, code: "SC-1", kind: "CHANGE", severity: "IMPORTANT", title: "Cambio otra compañía", authorId: otherCompanyAdminId, status: "OPEN" } });

  // Reminders: one overdue (past), one future, one resolved (should never appear).
  await appendRegistro({ partidaId: partidaA, authorId: adminId, category: null, text: "Recordatorio vencido", progressPct: null, gpsLat: null, gpsLng: null, locationId: null, attachments: [], reminderDueAt: new Date(Date.now() - 86_400_000) });
  await appendRegistro({ partidaId: partidaA, authorId: adminId, category: null, text: "Recordatorio futuro", progressPct: null, gpsLat: null, gpsLng: null, locationId: null, attachments: [], reminderDueAt: new Date(Date.now() + 86_400_000) });
  const resolvedReg = await appendRegistro({ partidaId: partidaA, authorId: adminId, category: null, text: "Recordatorio resuelto", progressPct: null, gpsLat: null, gpsLng: null, locationId: null, attachments: [], reminderDueAt: new Date(Date.now() + 86_400_000) });
  await prisma.registro.update({ where: { id: resolvedReg.id }, data: { reminderResolvedAt: new Date() } });
  await appendRegistro({ partidaId: otherPartida, authorId: otherCompanyAdminId, category: null, text: "Recordatorio otra compañía", progressPct: null, gpsLat: null, gpsLng: null, locationId: null, attachments: [], reminderDueAt: new Date(Date.now() - 1000) });
});

afterAll(async () => {
  await prisma.registro.deleteMany({ where: { partidaId: { in: [partidaA, otherPartida] } } });
  await prisma.changeRequest.deleteMany({ where: { projectId: { in: [projectA, projectB, otherProject] } } });
  await prisma.partida.deleteMany({ where: { id: { in: [partidaA, otherPartida] } } });
  await prisma.projectAssignment.deleteMany({ where: { projectId: projectA } });
  await prisma.project.deleteMany({ where: { id: { in: [projectA, projectB, otherProject] } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, residentId, otherCompanyAdminId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
  await prisma.$disconnect();
});

describe("loadPendingItems", () => {
  it("shows an ADMIN (company-wide) every open request/alert/reminder across projects A and B, never the other company's", async () => {
    const items = await loadPendingItems({ id: adminId, companyId, role: "ADMIN" });
    const ids = items.map((i) => i.id);

    expect(ids).toContain("req:" + (await findCr(projectA, "SC-1")).id);
    expect(ids).toContain("req:" + (await findCr(projectA, "SC-2")).id);
    expect(ids).toContain("req:" + (await findCr(projectB, "SC-1")).id);
    expect(items.some((i) => i.title.includes("Recordatorio vencido"))).toBe(true);
    expect(items.some((i) => i.title.includes("Recordatorio futuro"))).toBe(true);

    // Tenant isolation: nothing from the other company ever leaks in.
    expect(items.every((i) => i.projectId !== otherProject)).toBe(true);
    expect(items.some((i) => i.title.includes("otra compañía"))).toBe(false);
  });

  it("hides resolved/integrated requests and resolved reminders", async () => {
    const items = await loadPendingItems({ id: adminId, companyId, role: "ADMIN" });
    expect(items.some((i) => i.title.includes("Cambio integrado A"))).toBe(false);
    expect(items.some((i) => i.title.includes("Recordatorio resuelto"))).toBe(false);
  });

  it("scopes a RESIDENT to only their assigned project (project B's open request is invisible)", async () => {
    const items = await loadPendingItems({ id: residentId, companyId, role: "RESIDENT" });
    expect(items.every((i) => i.projectId === projectA)).toBe(true);
    expect(items.some((i) => i.title.includes("Cambio abierto B"))).toBe(false);
    expect(items.some((i) => i.title.includes("Cambio abierto A"))).toBe(true);
  });

  it("maps reminder severity: overdue -> CRITICAL, not-yet-due -> IMPORTANT", async () => {
    const items = await loadPendingItems({ id: adminId, companyId, role: "ADMIN" });
    const overdue = items.find((i) => i.title.includes("Recordatorio vencido"))!;
    const future = items.find((i) => i.title.includes("Recordatorio futuro"))!;
    expect(overdue.severity).toBe("CRITICAL");
    expect(overdue.overdue).toBe(true);
    expect(future.severity).toBe("IMPORTANT");
    expect(future.overdue).toBe(false);
  });

  it("sorts CRITICAL first, then overdue, then IMPORTANT", async () => {
    const items = await loadPendingItems({ id: adminId, companyId, role: "ADMIN" });
    const rank = (item: (typeof items)[number]) => {
      if (item.severity === "CRITICAL") return 0;
      if (item.overdue) return 1;
      if (item.severity === "IMPORTANT") return 2;
      return 3;
    };
    for (let i = 1; i < items.length; i++) {
      expect(rank(items[i - 1])).toBeLessThanOrEqual(rank(items[i]));
    }
    // The CRITICAL alert must outrank the IMPORTANT open request.
    const alertIdx = items.findIndex((i) => i.title.includes("Alerta abierta A"));
    const changeIdx = items.findIndex((i) => i.title.includes("Cambio abierto A"));
    expect(alertIdx).toBeLessThan(changeIdx);
  });

  it("filters by kind, project, severity and overdue-only", async () => {
    const onlyReminders = await loadPendingItems({ id: adminId, companyId, role: "ADMIN" }, { kind: "reminder" });
    expect(onlyReminders.every((i) => i.kind === "reminder")).toBe(true);

    const onlyProjectB = await loadPendingItems({ id: adminId, companyId, role: "ADMIN" }, { projectId: projectB });
    expect(onlyProjectB.every((i) => i.projectId === projectB)).toBe(true);
    expect(onlyProjectB.length).toBeGreaterThan(0);

    const onlyCritical = await loadPendingItems({ id: adminId, companyId, role: "ADMIN" }, { severity: "CRITICAL" });
    expect(onlyCritical.every((i) => i.severity === "CRITICAL")).toBe(true);

    const onlyOverdue = await loadPendingItems({ id: adminId, companyId, role: "ADMIN" }, { onlyOverdue: true });
    expect(onlyOverdue.every((i) => i.overdue)).toBe(true);
  });
});

describe("countPendingItems", () => {
  it("matches loadPendingItems' total for the same user", async () => {
    const [items, count] = await Promise.all([
      loadPendingItems({ id: adminId, companyId, role: "ADMIN" }),
      countPendingItems({ id: adminId, companyId, role: "ADMIN" }),
    ]);
    expect(count).toBe(items.length);
  });

  it("is scoped per company (the other company's admin never sees these items)", async () => {
    const count = await countPendingItems({ id: otherCompanyAdminId, companyId: otherCompanyId, role: "ADMIN" });
    expect(count).toBe(2); // its own open request + its own overdue reminder — nothing from `companyId`
  });
});

async function findCr(projectId: string, code: string) {
  return prisma.changeRequest.findFirstOrThrow({ where: { projectId, code } });
}
