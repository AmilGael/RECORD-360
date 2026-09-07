import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { prisma } from "@/lib/db";
import { generateRegistrationCode } from "@/lib/project/registration-code";

const storageGet = vi.hoisted(() => vi.fn());
const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/storage", () => ({ storage: { get: storageGet } }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { GET } from "@/app/api/media/[key]/route";

let companyId = "", userId = "", projectId = "";
const pdfKey = `csp-${Date.now()}.pdf`;
const pngKey = `csp-${Date.now()}.png`;

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `CSP Co ${s}` } })).id;
  userId = (await prisma.user.create({ data: { email: `csp-${s}@x.do`, name: "CSP", role: "ADMIN", companyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `CSP Project ${s}`, registrationCode: generateRegistrationCode() } })).id;
  await prisma.document.createMany({
    data: [
      { projectId, kind: "PLANO", url: `/api/media/${pdfKey}`, sha256: "a".repeat(64), fileType: "PDF", uploadedById: userId },
      { projectId, kind: "PLANO", url: `/api/media/${pngKey}`, sha256: "b".repeat(64), fileType: "IMAGE", uploadedById: userId },
    ],
  });
});

afterAll(async () => {
  await prisma.document.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

beforeEach(() => {
  authMock.mockReset();
  storageGet.mockReset();
  storageGet.mockResolvedValue(Readable.from([Buffer.from("x")]));
  authMock.mockResolvedValue({ user: { id: userId, companyId, role: "ADMIN" } });
});

function get(key: string) {
  return GET(new Request(`http://test.local/api/media/${key}`), { params: Promise.resolve({ key }) });
}

describe("media route CSP", () => {
  it("serves PDFs without the sandbox directive so Chrome's viewer can render them", async () => {
    const res = await get(pdfKey);
    expect(res.status).toBe(200);
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    expect(csp).not.toContain("sandbox");
    expect(csp).toContain("object-src 'self'");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
  it("keeps the fully locked-down sandbox CSP for non-PDF media", async () => {
    const res = await get(pngKey);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Security-Policy")).toContain("sandbox");
  });
});
