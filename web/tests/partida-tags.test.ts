import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { generateRegistrationCode } from "@/lib/project/registration-code";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { setPartidaTags } from "@/app/actions/partida-tags";

let companyId = "", residentId = "", projectId = "", partidaId = "";

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `Tag Co ${s}` } })).id;
  residentId = (await prisma.user.create({ data: { email: `tag-res-${s}@x.do`, name: "Tag Res", role: "RESIDENT", companyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `Tag Project ${s}`, registrationCode: generateRegistrationCode() } })).id;
  await prisma.projectAssignment.create({ data: { projectId, userId: residentId, role: "RESIDENT" } });
  partidaId = (await prisma.partida.create({ data: { projectId, name: "Tag Partida" } })).id;
});

afterAll(async () => {
  await prisma.partidaTagOnPartida.deleteMany({ where: { partidaId } });
  await prisma.partidaTag.deleteMany({ where: { projectId } });
  await prisma.projectAssignment.deleteMany({ where: { projectId } });
  await prisma.partida.deleteMany({ where: { id: partidaId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { id: residentId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

beforeEach(() => {
  authMock.mockReset();
  revalidatePathMock.mockReset();
  authMock.mockResolvedValue({ user: { id: residentId, companyId, role: "RESIDENT" } });
});

function fd(tags: string) {
  const form = new FormData();
  form.set("partidaId", partidaId);
  form.set("tags", tags);
  return form;
}

describe("setPartidaTags", () => {
  it("creates, deduplicates, and replaces project-scoped tags", async () => {
    await setPartidaTags(fd("Mampostería, Diseño, Mampostería"));
    let links = await prisma.partidaTagOnPartida.findMany({ where: { partidaId }, include: { tag: true } });
    expect(links.map((x) => x.tag.name).sort()).toEqual(["Diseño", "Mampostería"]);

    await setPartidaTags(fd("Ebanistería"));
    links = await prisma.partidaTagOnPartida.findMany({ where: { partidaId }, include: { tag: true } });
    expect(links.map((x) => x.tag.name)).toEqual(["Ebanistería"]);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/app/projects/${projectId}`);
  });
});
