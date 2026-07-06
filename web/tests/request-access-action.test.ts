import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

const sendMock = vi.hoisted(() => vi.fn());
const headerGet = vi.hoisted(() => vi.fn().mockReturnValue("9.9.9.9"));
vi.mock("@/lib/email", () => ({ mailer: { send: sendMock }, sendBestEffort: sendMock }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue({ get: headerGet }) }));

import { requestAccess } from "@/app/actions/access";

const tag = `rq-${Date.now()}`;
function fd(o: Record<string, string>) { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; }

beforeEach(() => sendMock.mockReset());
afterAll(async () => {
  await prisma.accessRequest.deleteMany({ where: { email: { contains: tag } } });
  await prisma.user.deleteMany({ where: { email: { contains: tag } } });
  await prisma.company.deleteMany({ where: { name: { contains: tag } } });
  await prisma.loginAttempt.deleteMany({ where: { key: { contains: "request:" } } });
  await prisma.$disconnect();
});

describe("requestAccess", () => {
  it("creates a PENDING request on valid input", async () => {
    const email = `${tag}-ok@x.com`;
    const res = await requestAccess({ status: "idle" }, fd({ business: `${tag}-Acme`, name: "Ana", email, phone: "809-1" }));
    expect(res.status).toBe("sent");
    const row = await prisma.accessRequest.findFirst({ where: { email } });
    expect(row?.status).toBe("PENDING");
  });

  it("errors on missing required fields, creating nothing", async () => {
    const res = await requestAccess({ status: "idle" }, fd({ business: "", name: "", email: "", phone: "" }));
    expect(res.status).toBe("error");
  });

  it("is enumeration-safe: an existing account returns 'sent' and creates no request", async () => {
    const email = `${tag}-dup@x.com`;
    const co = await prisma.company.create({ data: { name: `${tag}-dupco` } });
    await prisma.user.create({ data: { email, name: "D", role: "ADMIN", companyId: co.id } });
    const res = await requestAccess({ status: "idle" }, fd({ business: `${tag}-Should`, name: "D", email, phone: "809-2" }));
    expect(res.status).toBe("sent");
    expect(await prisma.accessRequest.findFirst({ where: { email } })).toBeNull();
  });

  it("silently ignores honeypot submissions", async () => {
    const email = `${tag}-hp@x.com`;
    const res = await requestAccess({ status: "idle" }, fd({ business: `${tag}-Hp`, name: "H", email, phone: "809-3", company_site: "bot" }));
    expect(res.status).toBe("sent");
    expect(await prisma.accessRequest.findFirst({ where: { email } })).toBeNull();
  });
});
