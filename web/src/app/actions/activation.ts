"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { verifyActivationToken, consumeActivationTokens } from "@/lib/auth/tokens";
import { validatePassword } from "@/lib/auth/password-policy";
import { writeAudit } from "@/lib/audit/log";

export type ActivateState = { status: "idle" | "error"; message?: string };
const WINDOW_MS = 60 * 60_000;
const ACTIVATE_MAX = 10;

export async function activateAccount(_prev: ActivateState, formData: FormData): Promise<ActivateState> {
  const ip = clientIp(await headers());
  if (await rateLimit(`activate:${ip}`, ACTIVATE_MAX, WINDOW_MS)) {
    return { status: "error", message: "Demasiados intentos. Inténtalo más tarde." };
  }

  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const policy = validatePassword(password);
  if (!policy.ok) return { status: "error", message: policy.error };
  if (password !== confirm) return { status: "error", message: "Las contraseñas no coinciden." };

  const valid = await verifyActivationToken(token);
  if (!valid) return { status: "error", message: "El enlace es inválido o expiró." };

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: valid.userId },
      data: { passwordHash, emailVerifiedAt: new Date() },
    });
    await consumeActivationTokens(tx, valid.userId);
    await writeAudit(tx, {
      companyId: user.companyId,
      actorId: user.id,
      action: "user.activated",
      targetType: "User",
      targetId: user.id,
      summary: `Account activated (${user.email})`,
    });
  });

  redirect("/login?activated=1");
}
