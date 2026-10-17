import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { appendRegistro } from "@/lib/registro/append";
import { generateRegistrationCode } from "@/lib/project/registration-code";
import { getPartidaPreview, lastActivityByPartidaIds } from "@/lib/partida/preview";
import type { SessionUser } from "@/lib/authz/projects";

let companyId = "", otherCompanyId = "";
let managerId = "", residentId = "", unassignedId = "", otherAdminId = "";
let projectId = "", otherProjectId = "";
let segmentId = "", partidaId = "", otherPartidaId = "", deletedId = "";
let locationId = "";

const asUser = (id: string, role: SessionUser["role"], co = companyId): SessionUser => ({ id, companyId: co, role });

beforeAll(async () => {
  const s = `pv-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `PV Co ${s}` } })).id;
  otherCompanyId = (await prisma.company.create({ data: { name: `PV Other ${s}` } })).id;
  managerId = (await prisma.user.create({ data: { email: `pv-m-${s}@x.do`, name: "Gerente PV", role: "MANAGER", companyId, passwordHash: "x" } })).id;
  residentId = (await prisma.user.create({ data: { email: `pv-r-${s}@x.do`, name: "Residente PV", role: "RESIDENT", companyId, passwordHash: "x" } })).id;
  unassignedId = (await prisma.user.create({ data: { email: `pv-u-${s}@x.do`, name: "Sin obra", role: "RESIDENT", companyId, passwordHash: "x" } })).id;
  otherAdminId = (await prisma.user.create({ data: { email: `pv-o-${s}@x.do`, name: "Otro", role: "ADMIN", companyId: otherCompanyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `PV Obra ${s}`, registrationCode: generateRegistrationCode() } })).id;
  otherProjectId = (await prisma.project.create({ data: { companyId: otherCompanyId, name: `PV Other Obra ${s}`, registrationCode: generateRegistrationCode() } })).id;
  await prisma.projectAssignment.create({ data: { projectId, userId: residentId, role: "RESIDENT" } });
  segmentId = (await prisma.segment.create({ data: { projectId, name: "Bloque PV" } })).id;
  partidaId = (await prisma.partida.create({ data: { projectId, segmentId, name: "Partida PV", progressPct: 40 } })).id;
  otherPartidaId = (await prisma.partida.create({ data: { projectId, segmentId, name: "Otra PV" } })).id;
  deletedId = (await prisma.partida.create({ data: { projectId, segmentId, name: "Borrada PV", deletedAt: new Date() } })).id;
  locationId = (await prisma.location.create({ data: { projectId, label: "Piso 2" } })).id;
  await prisma.partidaTag.create({
    data: { projectId, name: "hormigon", partidas: { create: { partidaId } } },
  });

  const long = "x".repeat(300);
  for (let i = 0; i < 6; i++) {
    await appendRegistro({
      partidaId,
      authorId: i === 1 ? otherAdminId : managerId,
      category: i === 5 ? "MATERIALES" : null,
      text: i === 5 ? long : `nota ${i}`,
      progressPct: null,
      gpsLat: null,
      gpsLng: null,
      locationId: i === 5 ? locationId : null,
      attachments: i === 5
        ? [
          { fileType: "IMAGE", url: "/api/media/pv.png", sha256: "a".repeat(64) },
          { fileType: "PDF", url: "/api/media/pv.pdf", sha256: "b".repeat(64) },
        ]
        : [],
    });
  }

  const crPartida = await prisma.changeRequest.create({
    data: { projectId, code: "SC-PV1", title: "CR partida", authorId: managerId, status: "OPEN" },
  });
  await prisma.changeRequestPartida.create({ data: { changeRequestId: crPartida.id, partidaId } });
  const crBloque = await prisma.changeRequest.create({
    data: { projectId, code: "SC-PV2", title: "CR bloque", authorId: managerId, status: "OPEN" },
  });
  await prisma.changeRequestSegment.create({ data: { changeRequestId: crBloque.id, segmentId } });
  const crDone = await prisma.changeRequest.create({
    data: { projectId, code: "SC-PV3", title: "CR listo", authorId: managerId, status: "INTEGRATED" },
  });
  await prisma.changeRequestPartida.create({ data: { changeRequestId: crDone.id, partidaId } });
});

afterAll(async () => {
  await prisma.attachment.deleteMany({ where: { registro: { partidaId: { in: [partidaId, otherPartidaId, deletedId] } } } });
  await prisma.registro.deleteMany({ where: { partidaId: { in: [partidaId, otherPartidaId, deletedId] } } });
  await prisma.changeRequestPartida.deleteMany({ where: { partidaId: { in: [partidaId, otherPartidaId] } } });
  await prisma.changeRequestSegment.deleteMany({ where: { segmentId } });
  await prisma.changeRequest.deleteMany({ where: { projectId } });
  await prisma.partidaTagOnPartida.deleteMany({ where: { partidaId } });
  await prisma.partidaTag.deleteMany({ where: { projectId } });
  await prisma.location.deleteMany({ where: { id: locationId } });
  await prisma.partida.deleteMany({ where: { id: { in: [partidaId, otherPartidaId, deletedId] } } });
  await prisma.segment.deleteMany({ where: { id: segmentId } });
  await prisma.projectAssignment.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { id: { in: [projectId, otherProjectId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [managerId, residentId, unassignedId, otherAdminId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
  await prisma.$disconnect();
});

describe("getPartidaPreview", () => {
  it("returns fields for a company member", async () => {
    const preview = await getPartidaPreview(asUser(managerId, "MANAGER"), partidaId);
    expect(preview).not.toBeNull();
    expect(preview!.name).toBe("Partida PV");
    expect(preview!.projectId).toBe(projectId);
    expect(preview!.segment).toEqual({ id: segmentId, name: "Bloque PV", closedAt: null });
    expect(preview!.progressPct).toBe(40);
    expect(preview!.registroCount).toBe(6);
    expect(preview!.openRequestCount).toBe(2);
    expect(preview!.canEdit).toBe(true);
    expect(preview!.tags).toEqual(["hormigon"]);
    expect(preview!.registros).toHaveLength(5);
    const latest = preview!.registros[0];
    expect(latest.text).toHaveLength(280);
    expect(latest.category).toBe("MATERIALES");
    expect(latest.locationLabel).toBe("Piso 2");
    expect(latest.authorName).toBe("Gerente PV");
    expect(latest.attachmentCount).toBe(2);
    expect(latest.firstImageUrl).toBe("/api/media/pv.png");
    expect(latest.hashPrefix).toHaveLength(8);
  });

  it("hides an author from another company", async () => {
    const preview = await getPartidaPreview(asUser(managerId, "MANAGER"), partidaId);
    const foreign = preview!.registros.find((r) => r.text === "nota 1");
    expect(foreign).toBeTruthy();
    expect(foreign!.authorName).toBeNull();
  });

  it("returns null for another tenant", async () => {
    expect(await getPartidaPreview(asUser(otherAdminId, "ADMIN", otherCompanyId), partidaId)).toBeNull();
  });

  it("returns null for a deleted partida", async () => {
    expect(await getPartidaPreview(asUser(managerId, "MANAGER"), deletedId)).toBeNull();
  });

  it("returns null for an unassigned resident", async () => {
    expect(await getPartidaPreview(asUser(unassignedId, "RESIDENT"), partidaId)).toBeNull();
  });

  it("lets an assigned resident see the partida and edit", async () => {
    const preview = await getPartidaPreview(asUser(residentId, "RESIDENT"), partidaId);
    expect(preview?.name).toBe("Partida PV");
    expect(preview?.canEdit).toBe(true);
  });
});

describe("lastActivityByPartidaIds", () => {
  it("returns one timestamp per partida that has registros", async () => {
    const map = await lastActivityByPartidaIds([partidaId, otherPartidaId]);
    expect(map.has(partidaId)).toBe(true);
    expect(map.has(otherPartidaId)).toBe(false);
    expect(map.get(partidaId)).toMatch(/T/);
  });
});
