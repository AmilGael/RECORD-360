"use server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { projectAccessWhere } from "@/lib/authz/projects";
import { computeSignatureSeal } from "@/lib/signatures/seal";
import { lockPartidaLedger } from "@/lib/registro/ledger-lock";
import { requireFreshSession } from "@/lib/auth/session";

export async function signPartida(formData: FormData): Promise<void> {
  const user = await requireFreshSession();
  const partidaId = String(formData.get("partidaId") ?? "");

  const password = String(formData.get("password") ?? "");
  let signedAt = new Date();
  const statement = String(formData.get("statement") ?? "").trim() || null;
  await prisma.$transaction(async (tx) => {
    await lockPartidaLedger(tx, partidaId);
    const partida = await tx.partida.findFirst({
      where: {
        id: partidaId,
        deletedAt: null,
        project: projectAccessWhere({ id: user.id, companyId: user.companyId, role: user.role }),
      },
      select: { id: true },
    });
    if (!partida) throw new Error("Forbidden");

    const signerRecord = await tx.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true, name: true, role: true, companyId: true, disabledAt: true },
    });
    if (!signerRecord || signerRecord.disabledAt) throw new Error("Unauthorized");
    if (signerRecord.companyId !== user.companyId || signerRecord.role !== user.role) throw new Error("Forbidden");

    const passwordOk = signerRecord.passwordHash ? await bcrypt.compare(password, signerRecord.passwordHash) : false;
    if (!passwordOk) throw new Error("Contraseña incorrecta.");

    const latestRegistro = await tx.registro.findFirst({
      where: { partidaId },
      orderBy: [{ serverCreatedAt: "desc" }, { id: "desc" }],
      select: { hash: true },
    });
    const chainHead = latestRegistro?.hash ?? "";

    signedAt = new Date();
    const seal = computeSignatureSeal({
      partidaId,
      signerId: user.id,
      signerName: signerRecord.name,
      signerRole: signerRecord.role,
      statement,
      chainHead,
      signedAt,
    });

    await tx.signature.create({
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
  });

  revalidatePath(`/app/partidas/${partidaId}`);
}

export type SignResult = { ok: true } | { ok: false; error: string };

/**
 * Form-friendly wrapper around signPartida for useActionState: returns a
 * structured result instead of throwing, so the form can show the error
 * (e.g. wrong password) without wiping the input.
 */
export async function signPartidaAction(_prev: SignResult | null, formData: FormData): Promise<SignResult> {
  try {
    await signPartida(formData);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo firmar." };
  }
}
