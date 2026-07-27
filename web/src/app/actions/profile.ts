"use server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { storage } from "@/lib/storage";
import { uploadBrandedImage } from "@/lib/storage/image-upload";
import { writeAudit } from "@/lib/audit/log";
import { requireFreshSession } from "@/lib/auth/session";

const ADMIN_ROLES: Role[] = [Role.ADMIN, Role.MANAGER];

/** Set a member's phone, photo and/or firma. ADMIN/MANAGER, same company. */
export async function updateUserProfile(formData: FormData) {
  const actor = await requireFreshSession();
  if (!ADMIN_ROLES.includes(actor.role)) throw new Error("Forbidden");

  const userId = String(formData.get("userId"));
  const target = await prisma.user.findFirst({ where: { id: userId, companyId: actor.companyId } });
  if (!target) throw new Error("Forbidden");

  const data: { phone?: string | null; photoKey?: string; signatureKey?: string } = {};

  if (formData.has("phone")) {
    const phone = String(formData.get("phone") ?? "").trim();
    if (phone.length > 30) throw new Error("El número es demasiado largo.");
    data.phone = phone || null;
  }
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    data.photoKey = await uploadBrandedImage(photo, storage);
  }
  // Distinguish first-time vs replacement firma for the audit trail (WS2C):
  // decide BEFORE the update, from the pre-update target row.
  let signatureAction: "signature.added" | "signature.replaced" | null = null;
  const signature = formData.get("signature");
  if (signature instanceof File && signature.size > 0) {
    // Firma contract: PNG with transparent/white background (architect requirement).
    data.signatureKey = await uploadBrandedImage(signature, storage, { pngOnly: true });
    signatureAction = target.signatureKey ? "signature.replaced" : "signature.added";
  }
  if (Object.keys(data).length === 0) return;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: target.id }, data });
    await writeAudit(tx, {
      companyId: actor.companyId,
      actorId: actor.id,
      action: "user.profile_update",
      targetType: "User",
      targetId: target.id,
      summary: `Perfil actualizado: ${target.name}`,
    });
    if (signatureAction) {
      await writeAudit(tx, {
        companyId: actor.companyId,
        actorId: actor.id,
        action: signatureAction,
        targetType: "User",
        targetId: target.id,
        summary: signatureAction === "signature.added"
          ? `Firma registrada: ${target.name}`
          : `Firma reemplazada: ${target.name}`,
      });
    }
  });
  revalidatePath("/app/admin");
}

/** Upload the company seal (PNG, transparent/white). ADMIN only — it lands on legal reports. */
export async function updateCompanySeal(formData: FormData) {
  const actor = await requireFreshSession();
  if (actor.role !== Role.ADMIN) throw new Error("Forbidden");

  const seal = formData.get("seal");
  if (!(seal instanceof File) || seal.size === 0) throw new Error("Selecciona una imagen PNG.");
  const sealKey = await uploadBrandedImage(seal, storage, { pngOnly: true });

  await prisma.$transaction(async (tx) => {
    await tx.company.update({ where: { id: actor.companyId }, data: { sealKey } });
    await writeAudit(tx, {
      companyId: actor.companyId,
      actorId: actor.id,
      action: "company.seal_update",
      targetType: "Company",
      targetId: actor.companyId,
      summary: "Sello de la compañía actualizado",
    });
  });
  revalidatePath("/app/admin");
}
