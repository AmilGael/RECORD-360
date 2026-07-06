import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

const tag = `schema-smoke-${Date.now()}`;

afterAll(async () => {
  await prisma.accessRequest.deleteMany({ where: { email: tag } });
  await prisma.$disconnect();
});

describe("access-request schema", () => {
  it("can create and read an AccessRequest with default PENDING status", async () => {
    await prisma.accessRequest.create({
      data: { businessName: "Smoke SRL", contactName: "Smoke", email: tag, phone: "809-000-0000" },
    });
    const found = await prisma.accessRequest.findFirst({ where: { email: tag } });
    expect(found?.status).toBe("PENDING");
  });
});
