import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { appendRegistro } from "@/lib/registro/append";
import bcrypt from "bcryptjs";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { signPartida } from "@/app/actions/signatures";

const KNOWN_PASSWORD = "test-password-123";

let companyId = "";
let companyBId = "";
let userId = "";
let adminId = "";
let userBId = "";
let projectId = "";
let partidaId = "";
let partidaNoAccessId = "";

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const hash = await bcrypt.hash(KNOWN_PASSWORD, 10);

  // Company A with a SUPERVISOR user
  companyId = (await prisma.company.create({ data: { name: `Sig Co A ${s}` } })).id;
  userId = (await prisma.user.create({
    data: { email: `sig-u-${s}@x.do`, name: "Supervisora Test", role: "SUPERVISOR", companyId, passwordHash: hash },
  })).id;
  adminId = (await prisma.user.create({
    data: { email: `sig-admin-${s}@x.do`, name: "Admin Test", role: "ADMIN", companyId, passwordHash: hash },
  })).id;

  projectId = (await prisma.project.create({ data: { companyId, name: `Sig Project ${s}` } })).id;
  // Assign user to project (SUPERVISOR needs assignment)
  await prisma.projectAssignment.create({ data: { projectId, userId, role: "SUPERVISOR" } });

  partidaId = (await prisma.partida.create({ data: { projectId, name: "Sig Partida" } })).id;

  // Company B — for cross-company Forbidden test
  companyBId = (await prisma.company.create({ data: { name: `Sig Co B ${s}` } })).id;
  userBId = (await prisma.user.create({
    data: { email: `sig-ub-${s}@x.do`, name: "User B", role: "MANAGER", companyId: companyBId, passwordHash: hash },
  })).id;
  const projectBId = (await prisma.project.create({ data: { companyId: companyBId, name: `Sig Project B ${s}` } })).id;
  partidaNoAccessId = (await prisma.partida.create({ data: { projectId: projectBId, name: "No Access Partida" } })).id;
});

afterAll(async () => {
  await prisma.signature.deleteMany({ where: { companyId } });
  await prisma.signature.deleteMany({ where: { companyId: companyBId } });
  await prisma.registro.deleteMany({ where: { partidaId } });
  await prisma.projectAssignment.deleteMany({ where: { projectId } });
  await prisma.partida.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, adminId] } } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  // Company B cleanup
  await prisma.partida.deleteMany({ where: { id: partidaNoAccessId } });
  await prisma.project.deleteMany({ where: { companyId: companyBId } });
  await prisma.user.deleteMany({ where: { id: userBId } });
  await prisma.company.deleteMany({ where: { id: companyBId } });
  await prisma.$disconnect();
});

beforeEach(() => {
  authMock.mockReset();
  revalidatePathMock.mockReset();
});

function fd(entries: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

function asUser() {
  authMock.mockResolvedValue({ user: { id: userId, companyId, role: "SUPERVISOR" } });
}

describe("signPartida", () => {
  it("correct password → creates a Signature with snapshots, chainHead from latest registro, and 64-char seal", async () => {
    // Append a registro so chainHead is non-empty
    await appendRegistro({
      partidaId, authorId: userId, category: null, text: "Avance final",
      progressPct: null, gpsLat: null, gpsLng: null, locationId: null, attachments: [],
    });
    const latestRegistro = await prisma.registro.findFirst({
      where: { partidaId },
      orderBy: [{ serverCreatedAt: "desc" }, { id: "desc" }],
      select: { hash: true },
    });
    expect(latestRegistro?.hash).toBeTruthy();

    asUser();
    await signPartida(fd({
      partidaId,
      password: KNOWN_PASSWORD,
      statement: "Conforme con el avance registrado.",
    }));

    const sig = await prisma.signature.findFirst({
      where: { partidaId, signerId: userId },
      orderBy: { signedAt: "desc" },
    });
    expect(sig).not.toBeNull();
    expect(sig!.signerName).toBe("Supervisora Test");
    expect(sig!.signerRole).toBe("SUPERVISOR");
    expect(sig!.chainHead).toBe(latestRegistro!.hash);
    expect(sig!.seal).toMatch(/^[0-9a-f]{64}$/);
    expect(sig!.statement).toBe("Conforme con el avance registrado.");
    expect(revalidatePathMock).toHaveBeenCalledWith(`/app/partidas/${partidaId}`);
  });

  it("correct password on empty cuaderno → chainHead is empty string", async () => {
    const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const emptyPartida = await prisma.partida.create({ data: { projectId, name: `Empty ${s}` } });

    asUser();
    await signPartida(fd({ partidaId: emptyPartida.id, password: KNOWN_PASSWORD }));

    const sig = await prisma.signature.findFirstOrThrow({ where: { partidaId: emptyPartida.id } });
    expect(sig.chainHead).toBe("");

    // cleanup
    await prisma.signature.deleteMany({ where: { partidaId: emptyPartida.id } });
    await prisma.partida.delete({ where: { id: emptyPartida.id } });
  });

  it("purging an empty signed partida deletes the signature via cascade", async () => {
    const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const emptyPartida = await prisma.partida.create({ data: { projectId, name: `Signed Empty ${s}` } });

    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    await signPartida(fd({ partidaId: emptyPartida.id, password: KNOWN_PASSWORD }));
    expect(await prisma.signature.count({ where: { partidaId: emptyPartida.id } })).toBe(1);

    await prisma.partida.delete({ where: { id: emptyPartida.id } });
    expect(await prisma.signature.count({ where: { partidaId: emptyPartida.id } })).toBe(0);
  });

  it("wrong password → throws 'Contraseña incorrecta.', no row created", async () => {
    const before = await prisma.signature.count({ where: { partidaId } });
    asUser();
    await expect(
      signPartida(fd({ partidaId, password: "wrong-password" }))
    ).rejects.toThrow("Contraseña incorrecta.");
    expect(await prisma.signature.count({ where: { partidaId } })).toBe(before);
  });

  it("partida from another company → throws 'Forbidden'", async () => {
    authMock.mockResolvedValue({ user: { id: userId, companyId, role: "SUPERVISOR" } });
    await expect(
      signPartida(fd({ partidaId: partidaNoAccessId, password: KNOWN_PASSWORD }))
    ).rejects.toThrow("Forbidden");
  });

  it("unauthenticated → throws 'Unauthorized'", async () => {
    authMock.mockResolvedValue(null);
    await expect(
      signPartida(fd({ partidaId, password: KNOWN_PASSWORD }))
    ).rejects.toThrow("Unauthorized");
  });
});
