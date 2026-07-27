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
  it("returns a null id for a null label", async () => {
    expect(await resolveSegment(projectId, null)).toEqual({ id: null, created: false });
  });

  it("creates a segment, then reuses it case-insensitively (no duplicate)", async () => {
    const r1 = await resolveSegment(projectId, "Cimentación");
    expect(r1.id).not.toBeNull();
    expect(r1.created).toBe(true);
    const r2 = await resolveSegment(projectId, "cimentación");
    expect(r2.id).toBe(r1.id);
    expect(r2.created).toBe(false); // reuse, not a new creation
    const count = await prisma.segment.count({ where: { projectId, name: { equals: "cimentación", mode: "insensitive" } } });
    expect(count).toBe(1);
  });

  it("creates a distinct segment for a new name", async () => {
    const a = await resolveSegment(projectId, "Estructura");
    const b = await resolveSegment(projectId, "Cimentación");
    expect(a.id).not.toBe(b.id);
    expect(a.created).toBe(true);
  });
});
