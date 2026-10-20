import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { generateRegistrationCode } from "@/lib/project/registration-code";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const storagePut = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/storage", () => ({ storage: { put: storagePut, get: vi.fn() } }));

import { createDocument, registerDocument, setDocumentThumbnail } from "@/app/actions/documents";
import { issueUploadGrant } from "@/lib/uploads/grant";

let companyId = "", otherCompanyId = "", adminId = "", residentId = "", otherAdminId = "", projectId = "", otherProjectId = "", segmentId = "";

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const company = await prisma.company.create({ data: { name: `Doc Co ${s}` } });
  companyId = company.id;
  otherCompanyId = (await prisma.company.create({ data: { name: `Doc Other ${s}` } })).id;
  adminId = (await prisma.user.create({ data: { email: `adm-${s}@x.do`, name: "Adm", role: "ADMIN", companyId, passwordHash: "x" } })).id;
  residentId = (await prisma.user.create({ data: { email: `res-${s}@x.do`, name: "Res", role: "RESIDENT", companyId, passwordHash: "x" } })).id;
  otherAdminId = (await prisma.user.create({ data: { email: `oadm-${s}@x.do`, name: "OAdm", role: "ADMIN", companyId: otherCompanyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `Doc Project ${s}`, registrationCode: generateRegistrationCode() } })).id;
  otherProjectId = (await prisma.project.create({ data: { companyId: otherCompanyId, name: `Doc Other Project ${s}`, registrationCode: generateRegistrationCode() } })).id;
  segmentId = (await prisma.segment.create({ data: { projectId, name: "Doc Bloque" } })).id;
});

afterAll(async () => {
  await prisma.document.deleteMany({ where: { projectId: { in: [projectId, otherProjectId] } } });
  await prisma.projectAssignment.deleteMany({ where: { projectId: { in: [projectId, otherProjectId] } } });
  await prisma.segment.deleteMany({ where: { id: segmentId } });
  await prisma.project.deleteMany({ where: { id: { in: [projectId, otherProjectId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, residentId, otherAdminId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
  await prisma.$disconnect();
});

beforeEach(() => {
  authMock.mockReset(); revalidatePathMock.mockReset(); storagePut.mockReset();
  storagePut.mockResolvedValue({ key: "plano.pdf", url: "/api/media/plano.pdf" });
});

function fdWithFile() {
  const fd = new FormData();
  fd.set("projectId", projectId);
  fd.set("title", "Planta arquitectónica");
  fd.append("file", new File([new Uint8Array(5)], "plano.pdf", { type: "application/pdf" }));
  return fd;
}

describe("createDocument", () => {
  it("stores a PLANO document for an admin", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    const res = await createDocument(null, fdWithFile());
    expect(res.ok).toBe(true);
    const doc = await prisma.document.findFirstOrThrow({ where: { projectId, title: "Planta arquitectónica" } });
    expect(doc.kind).toBe("PLANO");
    expect(doc.fileType).toBe("PDF");
    expect(doc.url).toBe("/api/media/plano.pdf");
    expect(doc.fileName).toBe("plano.pdf");
  });
  it("stores a fallback thumbnail and the original file name", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    storagePut
      .mockResolvedValueOnce({ key: "plano.pdf", url: "/api/media/plano.pdf" })
      .mockResolvedValueOnce({ key: "thumb.webp", url: "/api/media/thumb.webp" });
    const fd = fdWithFile();
    fd.set("title", "Con miniatura");
    fd.set("thumb", new File([new Uint8Array(8)], "thumb.webp", { type: "image/webp" }));
    const res = await createDocument(null, fd);
    expect(res.ok).toBe(true);
    const doc = await prisma.document.findFirstOrThrow({ where: { projectId, title: "Con miniatura" } });
    expect(doc.fileName).toBe("plano.pdf");
    expect(doc.thumbKey).toBe("thumb.webp");
    expect(doc.url).toBe("/api/media/plano.pdf");
    expect(storagePut).toHaveBeenCalledTimes(2);
  });
  it("rejects an unassigned resident", async () => {
    authMock.mockResolvedValue({ user: { id: residentId, companyId, role: "RESIDENT" } });
    const res = await createDocument(null, fdWithFile());
    expect(res.ok).toBe(false);
  });
  it("stores a PLANO document for an assigned resident", async () => {
    await prisma.projectAssignment.create({
      data: { projectId, userId: residentId, role: "RESIDENT" },
    });
    authMock.mockResolvedValue({ user: { id: residentId, companyId, role: "RESIDENT" } });

    const res = await createDocument(null, fdWithFile());

    expect(res.ok).toBe(true);
    const doc = await prisma.document.findFirstOrThrow({ where: { projectId, uploadedById: residentId } });
    expect(doc.fileType).toBe("PDF");
  });
  it("stores a scoped Planos Actualizados document for a bloque", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    const fd = fdWithFile();
    fd.set("segmentId", segmentId);
    fd.set("kind", "PLANO_ACTUALIZADO");

    const res = await createDocument(null, fd);

    expect(res.ok).toBe(true);
    const doc = await prisma.document.findFirstOrThrow({ where: { projectId, segmentId, kind: "PLANO_ACTUALIZADO" } });
    expect(doc.title).toBe("Planta arquitectónica");
  });
  it("rejects when no file is provided", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    const fd = new FormData(); fd.set("projectId", projectId);
    const res = await createDocument(null, fd);
    expect(res.ok).toBe(false);
  });
});

function fdForRegister(grant: { key: string; fileType: string; exp: number; token: string }) {
  const fd = new FormData();
  fd.set("projectId", projectId);
  fd.set("title", "Plano directo");
  fd.set("kind", "PLANO");
  fd.set("key", grant.key);
  fd.set("fileType", grant.fileType);
  fd.set("exp", String(grant.exp));
  fd.set("token", grant.token);
  fd.set("sha256", "f".repeat(64));
  return fd;
}

describe("registerDocument", () => {
  const key = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.pdf";
  it("records a directly-uploaded PLANO for an admin holding a valid grant", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    const grant = issueUploadGrant(adminId, key, "PDF");
    const res = await registerDocument(null, fdForRegister(grant));
    expect(res.ok).toBe(true);
    const doc = await prisma.document.findFirstOrThrow({ where: { projectId, title: "Plano directo" } });
    expect(doc.url).toBe(`/api/media/${key}`);
    expect(doc.fileType).toBe("PDF");
    expect(doc.sha256).toBe("f".repeat(64));
    expect(storagePut).not.toHaveBeenCalled();
  });
  it("records a valid IMAGE thumbnail grant without changing url or sha256", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    const fileKey = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee01.pdf";
    const thumbKey = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee02.webp";
    const grant = issueUploadGrant(adminId, fileKey, "PDF");
    const thumb = issueUploadGrant(adminId, thumbKey, "IMAGE");
    const fd = fdForRegister(grant);
    fd.set("title", "Plano con miniatura");
    fd.set("fileName", "Planta Eléctrica.pdf");
    fd.set("thumbKey", thumb.key);
    fd.set("thumbFileType", thumb.fileType);
    fd.set("thumbExp", String(thumb.exp));
    fd.set("thumbToken", thumb.token);
    const res = await registerDocument(null, fd);
    expect(res.ok).toBe(true);
    const doc = await prisma.document.findFirstOrThrow({ where: { projectId, title: "Plano con miniatura" } });
    expect(doc.url).toBe(`/api/media/${fileKey}`);
    expect(doc.sha256).toBe("f".repeat(64));
    expect(doc.thumbKey).toBe(thumbKey);
    expect(doc.fileName).toBe("Planta Eléctrica.pdf");
  });
  it("rejects a forged thumbnail token", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    const fileKey = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee03.pdf";
    const thumbKey = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee04.webp";
    const grant = issueUploadGrant(adminId, fileKey, "PDF");
    const thumb = issueUploadGrant(adminId, thumbKey, "IMAGE");
    const fd = fdForRegister(grant);
    fd.set("title", "forged-thumb");
    fd.set("thumbKey", thumb.key);
    fd.set("thumbFileType", thumb.fileType);
    fd.set("thumbExp", String(thumb.exp));
    fd.set("thumbToken", "0".repeat(64));
    const res = await registerDocument(null, fd);
    expect(res.ok).toBe(false);
  });
  it("rejects another user's thumbnail grant", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    const fileKey = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee05.pdf";
    const thumbKey = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee06.webp";
    const grant = issueUploadGrant(adminId, fileKey, "PDF");
    const thumb = issueUploadGrant(residentId, thumbKey, "IMAGE");
    const fd = fdForRegister(grant);
    fd.set("title", "foreign-thumb");
    fd.set("thumbKey", thumb.key);
    fd.set("thumbFileType", thumb.fileType);
    fd.set("thumbExp", String(thumb.exp));
    fd.set("thumbToken", thumb.token);
    const res = await registerDocument(null, fd);
    expect(res.ok).toBe(false);
  });
  it("rejects a non-image thumbnail type", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    const fileKey = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee07.pdf";
    const thumbKey = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee08.pdf";
    const grant = issueUploadGrant(adminId, fileKey, "PDF");
    const thumb = issueUploadGrant(adminId, thumbKey, "PDF");
    const fd = fdForRegister(grant);
    fd.set("title", "pdf-thumb");
    fd.set("thumbKey", thumb.key);
    fd.set("thumbFileType", thumb.fileType);
    fd.set("thumbExp", String(thumb.exp));
    fd.set("thumbToken", thumb.token);
    const res = await registerDocument(null, fd);
    expect(res.ok).toBe(false);
  });
  it("rejects a grant issued to a different user", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    const grant = issueUploadGrant(residentId, key, "PDF");
    const res = await registerDocument(null, fdForRegister(grant));
    expect(res.ok).toBe(false);
  });
  it("rejects a tampered key even with an otherwise valid grant", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    const grant = issueUploadGrant(adminId, key, "PDF");
    const res = await registerDocument(null, fdForRegister({ ...grant, key: "11111111-2222-3333-4444-555555555555.pdf" }));
    expect(res.ok).toBe(false);
  });
  it("rejects a key that is not a generated object name", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    const grant = issueUploadGrant(adminId, "../../etc/passwd", "PDF");
    const res = await registerDocument(null, fdForRegister(grant));
    expect(res.ok).toBe(false);
  });
  it("rejects an unassigned resident even with a valid grant", async () => {
    await prisma.projectAssignment.deleteMany({ where: { projectId, userId: residentId } });
    authMock.mockResolvedValue({ user: { id: residentId, companyId, role: "RESIDENT" } });
    const grant = issueUploadGrant(residentId, key, "PDF");
    const res = await registerDocument(null, fdForRegister(grant));
    expect(res.ok).toBe(false);
  });
});

describe("setDocumentThumbnail", () => {
  async function seedDoc(thumbKey: string | null = null) {
    return prisma.document.create({
      data: {
        projectId, kind: "PLANO", title: `thumb-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        url: `/api/media/${crypto.randomUUID()}.pdf`, sha256: "b".repeat(64), fileType: "PDF",
        uploadedById: adminId, thumbKey,
      },
    });
  }
  it("sets thumbKey only where it is null", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    const doc = await seedDoc(null);
    const first = issueUploadGrant(adminId, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeef01.webp", "IMAGE");
    const fd = new FormData();
    fd.set("documentId", doc.id);
    fd.set("thumbKey", first.key); fd.set("thumbFileType", first.fileType);
    fd.set("thumbExp", String(first.exp)); fd.set("thumbToken", first.token);
    expect((await setDocumentThumbnail(null, fd)).ok).toBe(true);
    expect((await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).thumbKey).toBe(first.key);

    const second = issueUploadGrant(adminId, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeef02.webp", "IMAGE");
    const fd2 = new FormData();
    fd2.set("documentId", doc.id);
    fd2.set("thumbKey", second.key); fd2.set("thumbFileType", second.fileType);
    fd2.set("thumbExp", String(second.exp)); fd2.set("thumbToken", second.token);
    expect((await setDocumentThumbnail(null, fd2)).ok).toBe(true);
    expect((await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).thumbKey).toBe(first.key);
  });
  it("rejects another tenant", async () => {
    authMock.mockResolvedValue({ user: { id: otherAdminId, companyId: otherCompanyId, role: "ADMIN" } });
    const doc = await seedDoc(null);
    const grant = issueUploadGrant(otherAdminId, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeef03.webp", "IMAGE");
    const fd = new FormData();
    fd.set("documentId", doc.id);
    fd.set("thumbKey", grant.key); fd.set("thumbFileType", grant.fileType);
    fd.set("thumbExp", String(grant.exp)); fd.set("thumbToken", grant.token);
    const res = await setDocumentThumbnail(null, fd);
    expect(res.ok).toBe(false);
    expect((await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).thumbKey).toBeNull();
  });
  it("rejects an unassigned resident", async () => {
    await prisma.projectAssignment.deleteMany({ where: { projectId, userId: residentId } });
    authMock.mockResolvedValue({ user: { id: residentId, companyId, role: "RESIDENT" } });
    const doc = await seedDoc(null);
    const grant = issueUploadGrant(residentId, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeef04.webp", "IMAGE");
    const fd = new FormData();
    fd.set("documentId", doc.id);
    fd.set("thumbKey", grant.key); fd.set("thumbFileType", grant.fileType);
    fd.set("thumbExp", String(grant.exp)); fd.set("thumbToken", grant.token);
    const res = await setDocumentThumbnail(null, fd);
    expect(res.ok).toBe(false);
  });
});
