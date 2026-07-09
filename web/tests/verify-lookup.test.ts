import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { generateRegistrationCode, isValidRegistrationCode } from "@/lib/project/registration-code";

describe("verify-page lookup contract", () => {
  let companyId = "", code = "";
  beforeAll(async () => {
    const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    companyId = (await prisma.company.create({ data: { name: `Verify Co ${s}` } })).id;
    code = generateRegistrationCode();
    await prisma.project.create({ data: { companyId, name: `Obra Verificada ${s}`, registrationCode: code } });
  });
  afterAll(async () => {
    await prisma.project.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
  });

  it("resolves a real code to name + company + date only", async () => {
    const p = await prisma.project.findUnique({
      where: { registrationCode: code },
      select: { name: true, createdAt: true, company: { select: { name: true } } },
    });
    expect(p?.name).toContain("Obra Verificada");
    expect(p?.company.name).toContain("Verify Co");
  });
  it("malformed codes never reach the database", () => {
    expect(isValidRegistrationCode("RPH-<script>-XXXX")).toBe(false);
    expect(isValidRegistrationCode("")).toBe(false);
  });
});
