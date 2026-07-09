import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { resolveSegment } from "@/lib/project/segments";
import { generateRegistrationCode } from "@/lib/project/registration-code";

let companyId = "", projectId = "";

beforeAll(async () => {
  const c = await prisma.company.create({ data: { name: "Seg Co" } });
  companyId = c.id;
  const p = await prisma.project.create({ data: { companyId, name: "Seg Proj", registrationCode: generateRegistrationCode() } });
  projectId = p.id;
});

afterAll(async () => {
  await prisma.partida.deleteMany({ where: { projectId } });
  await prisma.segment.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

describe("resolveSegment", () => {
  it("returns null for a null label", async () => {
    expect(await resolveSegment(projectId, null)).toBeNull();
  });

  it("creates a segment, then reuses it case-insensitively (no duplicate)", async () => {
    const id1 = await resolveSegment(projectId, "Cimentación");
    expect(id1).not.toBeNull();
    const id2 = await resolveSegment(projectId, "cimentación");
    expect(id2).toBe(id1);
    const count = await prisma.segment.count({ where: { projectId, name: { equals: "cimentación", mode: "insensitive" } } });
    expect(count).toBe(1);
  });

  it("creates a distinct segment for a new name", async () => {
    const a = await resolveSegment(projectId, "Estructura");
    const b = await resolveSegment(projectId, "Cimentación");
    expect(a).not.toBe(b);
  });
});
