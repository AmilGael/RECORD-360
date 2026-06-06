"use server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { projectAccessWhere } from "@/lib/authz/projects";
import { computeSignatureSeal } from "@/lib/signatures/seal";

export async function signPartida(formData: FormData): Promise<void> {
  // 1. Auth
  const session = await auth();
  const user = session?.user as { id?: string; companyId?: string; role?: Role } | undefined;
  if (!user?.id || !user.companyId || !user.role) throw new Error("Unauthorized");

  const partidaId = String(formData.get("partidaId") ?? "");

  // 2. Tenant + project-access scope
  const partida = await prisma.partida.findFirst({
    where: {
      id: partidaId,
      deletedAt: null,
      project: projectAccessWhere({ id: user.id, companyId: user.companyId, role: user.role }),
    },
    select: { id: true },
  });
  if (!partida) throw new Error("Forbidden");

  // 3. Re-authenticate: load the user's passwordHash + name + role snapshot
  const signerRecord = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true, name: true, role: true },
  });
  if (!signerRecord) throw new Error("Unauthorized");

  const password = String(formData.get("password") ?? "");
  const passwordOk = await bcrypt.compare(password, signerRecord.passwordHash);
  if (!passwordOk) throw new Error("Contraseña incorrecta.");

  // 4. Chain head: latest registro hash (or "" if none)
  const latestRegistro = await prisma.registro.findFirst({
    where: { partidaId },
    orderBy: [{ serverCreatedAt: "desc" }, { id: "desc" }],
    select: { hash: true },
  });
  const chainHead = latestRegistro?.hash ?? "";

  // 5. Optional statement
  const statement = String(formData.get("statement") ?? "").trim() || null;

  // 6. Compute seal
  const signedAt = new Date();
  const seal = computeSignatureSeal({
    partidaId,
    signerId: user.id,
    signerName: signerRecord.name,
    signerRole: signerRecord.role,
    statement,
    chainHead,
    signedAt,
  });

  // 7. Persist
  await prisma.signature.create({
    data: {
      companyId: user.companyId,
      partidaId,
      signerId: user.id,
      signerName: signerRecord.name,
      signerRole: signerRecord.role,
      statement,
      chainHead,
      seal,
      signedAt,
    },
  });

  revalidatePath(`/app/partidas/${partidaId}`);
}
