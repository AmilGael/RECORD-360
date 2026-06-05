"use server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { projectAccessWhere } from "@/lib/authz/projects";
import { verifyChain } from "@/lib/registro/hash";
import { toStored } from "@/lib/registro/map";
import type { Role } from "@prisma/client";

export type VerifyResult =
  | { status: "ok"; count: number }
  | { status: "broken"; brokenAt: string | null }
  | { status: "error"; message: string };

export async function verifyPartidaChain(_prev: VerifyResult | null, formData: FormData): Promise<VerifyResult> {
  const session = await auth();
  const user = session?.user as { id?: string; companyId?: string; role?: Role } | undefined;
  if (!user?.id || !user.companyId || !user.role) return { status: "error", message: "No autorizado." };
  const partidaId = String(formData.get("partidaId"));
  const partida = await prisma.partida.findFirst({
    where: { id: partidaId, deletedAt: null, project: projectAccessWhere({ id: user.id, companyId: user.companyId, role: user.role }) },
    select: { id: true },
  });
  if (!partida) return { status: "error", message: "No autorizado." };
  const registros = await prisma.registro.findMany({
    where: { partidaId }, orderBy: [{ serverCreatedAt: "asc" }, { id: "asc" }], include: { attachments: true },
  });
  const result = verifyChain(registros.map(toStored));
  return result.ok ? { status: "ok", count: registros.length } : { status: "broken", brokenAt: result.brokenAt ?? null };
}
