import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { Role } from "@prisma/client";

const authMock = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());
const revalidateMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/email", () => ({ mailer: { send: sendMock }, sendBestEffort: sendMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidateMock }));

import { approveRequest, rejectRequest } from "@/app/actions/access";

const tag = `ap-${Date.now()}`;
let operatorId = "";
function fd(o: Record<string, string>) { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; }

beforeEach(async () => {
  sendMock.mockReset();
  const co = await prisma.company.create({ data: { name: `${tag}-ops-${Math.random()}` } });
  const op = await prisma.user.create({
    data: { email: `${tag}-op-${Math.random()}@x.com`, name: "Op", role: Role.SUPERADMIN, companyId: co.id, passwordHash: "x", emailVerifiedAt: new Date() },
  });
  operatorId = op.id;
  authMock.mockResolvedValue({ user: { id: operatorId, companyId: co.id, role: Role.SUPERADMIN } });
});
afterAll(async () => {
  await prisma.verificationToken.deleteMany({ where: { user: { email: { contains: tag } } } });
  await prisma.accessRequest.deleteMany({ where: { email: { contains: tag } } });
  await prisma.user.deleteMany({ where: { email: { contains: tag } } });
  await prisma.company.deleteMany({ where: { name: { contains: tag } } });
  await prisma.$disconnect();
});

describe("approveRequest", () => {
  it("creates an inactive company + admin, mints a token, emails activation, marks APPROVED", async () => {
    const req = await prisma.accessRequest.create({ data: { businessName: `${tag}-Acme`, contactName: "Ana", email: `${tag}-ana@x.com`, phone: "809" } });
    await approveRequest(fd({ requestId: req.id }));
    const created = await prisma.user.findUnique({ where: { email: `${tag}-ana@x.com` } });
    expect(created?.role).toBe("ADMIN");
    expect(created?.passwordHash).toBeNull();
    expect(created?.emailVerifiedAt).toBeNull();
    expect(await prisma.verificationToken.count({ where: { userId: created!.id } })).toBe(1);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const after = await prisma.accessRequest.findUnique({ where: { id: req.id } });
    expect(after?.status).toBe("APPROVED");
    expect(after?.createdUserId).toBe(created!.id);
  });

  it("does not create a duplicate when the email already has an account", async () => {
    const co = await prisma.company.create({ data: { name: `${tag}-existingco` } });
    await prisma.user.create({ data: { email: `${tag}-dup@x.com`, name: "D", role: Role.ADMIN, companyId: co.id, passwordHash: "x", emailVerifiedAt: new Date() } });
    const req = await prisma.accessRequest.create({ data: { businessName: `${tag}-DupBiz`, contactName: "D", email: `${tag}-dup@x.com`, phone: "809" } });
    await approveRequest(fd({ requestId: req.id }));
    expect(await prisma.company.findFirst({ where: { name: `${tag}-DupBiz` } })).toBeNull();
    expect(sendMock).not.toHaveBeenCalled();
    expect((await prisma.accessRequest.findUnique({ where: { id: req.id } }))?.status).toBe("APPROVED");
  });

  it("is idempotent: a second approve of the same request does nothing", async () => {
    const req = await prisma.accessRequest.create({ data: { businessName: `${tag}-Once`, contactName: "O", email: `${tag}-once@x.com`, phone: "809" } });
    await approveRequest(fd({ requestId: req.id }));
    sendMock.mockReset();
    await approveRequest(fd({ requestId: req.id }));
    expect(sendMock).not.toHaveBeenCalled();
    expect(await prisma.company.count({ where: { name: `${tag}-Once` } })).toBe(1);
  });

  it("rejects a non-operator", async () => {
    authMock.mockResolvedValueOnce({ user: { id: operatorId, companyId: "x", role: Role.ADMIN } });
    const req = await prisma.accessRequest.create({ data: { businessName: `${tag}-No`, contactName: "N", email: `${tag}-no@x.com`, phone: "809" } });
    await expect(approveRequest(fd({ requestId: req.id }))).rejects.toThrow();
  });
});

describe("rejectRequest", () => {
  it("marks the request REJECTED and sends no email", async () => {
    const req = await prisma.accessRequest.create({ data: { businessName: `${tag}-Rej`, contactName: "R", email: `${tag}-rej@x.com`, phone: "809" } });
    await rejectRequest(fd({ requestId: req.id }));
    expect((await prisma.accessRequest.findUnique({ where: { id: req.id } }))?.status).toBe("REJECTED");
    expect(sendMock).not.toHaveBeenCalled();
  });
});
