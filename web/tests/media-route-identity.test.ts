import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { prisma } from "@/lib/db";
import { generateRegistrationCode } from "@/lib/project/registration-code";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  storage: {
    put: vi.fn(),
    get: vi.fn(async () => Readable.from([Buffer.from([0x89, 0x50])])),
  },
}));

import { GET } from "@/app/api/media/[key]/route";

let companyId = "", otherCompanyId = "", adminId = "", outsiderId = "", residentId = "";
const COVER_KEY = "r1cover-test.png";
const PHOTO_KEY = "r1photo-test.png";
const SEAL_KEY = "r1seal-test.png";

function req(key: string) {
  return [new Request(`http://test/api/media/${key}`), { params: Promise.resolve({ key }) }] as const;
}

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `Media Co ${s}`, sealKey: SEAL_KEY } })).id;
  otherCompanyId = (await prisma.company.create({ data: { name: `Other Co ${s}` } })).id;
  adminId = (await prisma.user.create({ data: { email: `adm-${s}@x.do`, name: "Adm", role: "ADMIN", companyId, passwordHash: "x", photoKey: PHOTO_KEY } })).id;
  residentId = (await prisma.user.create({ data: { email: `res-${s}@x.do`, name: "Res", role: "RESIDENT", companyId, passwordHash: "x" } })).id;
  outsiderId = (await prisma.user.create({ data: { email: `out-${s}@x.do`, name: "Out", role: "ADMIN", companyId: otherCompanyId, passwordHash: "x" } })).id;
  await prisma.project.create({ data: { companyId, name: `Media Obra ${s}`, registrationCode: generateRegistrationCode(), coverImageKey: COVER_KEY } });
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
});

describe("media route serves identity images with tenant scoping", () => {
  it("company member sees the project cover", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    const res = await GET(...req(COVER_KEY));
    expect(res.status).toBe(200);
  });
  it("outsider company gets 404 for the cover", async () => {
    authMock.mockResolvedValue({ user: { id: outsiderId, companyId: otherCompanyId, role: "ADMIN" } });
    const res = await GET(...req(COVER_KEY));
    expect(res.status).toBe(404);
  });
  it("company member sees a colleague's photo and the company seal", async () => {
    authMock.mockResolvedValue({ user: { id: residentId, companyId, role: "RESIDENT" } });
    expect((await GET(...req(PHOTO_KEY))).status).toBe(200);
    expect((await GET(...req(SEAL_KEY))).status).toBe(200);
  });
  it("outsider gets 404 for photo and seal", async () => {
    authMock.mockResolvedValue({ user: { id: outsiderId, companyId: otherCompanyId, role: "ADMIN" } });
    expect((await GET(...req(PHOTO_KEY))).status).toBe(404);
    expect((await GET(...req(SEAL_KEY))).status).toBe(404);
  });
});
