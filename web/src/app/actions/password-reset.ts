"use server";
import { headers } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { sendBestEffort } from "@/lib/email";
import { passwordResetLinkEmail } from "@/lib/email/templates";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { createToken, verifyToken, consumeTokens, resetUrl } from "@/lib/auth/tokens";
import { validatePassword } from "@/lib/auth/password-policy";
import { writeAudit } from "@/lib/audit/log";
import { TokenPurpose } from "@prisma/client";

export type ForgotPasswordState = { status: "idle" | "sent" | "error"; message?: string };
export type ResetPasswordState = { status: "idle" | "error"; message?: string };

const NEUTRAL: ForgotPasswordState = { status: "sent" };
const WINDOW_MS = 60 * 60_000;
const REQUEST_MAX = 5;
const RESET_MAX = 10;

export async function requestPasswordReset(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const ip = clientIp(await headers());
  if (await rateLimit(`reset:${ip}`, REQUEST_MAX, WINDOW_MS)) {
    return { status: "error", message: "Demasiados intentos. Inténtalo más tarde." };
  }

  // Honeypot: real users never fill this hidden field.
  if (String(formData.get("company_site") ?? "").trim() !== "") return NEUTRAL;

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { status: "error", message: "Ingresa tu correo." };

  // Enumeration-safe: unknown, unactivated, or disabled accounts get the same
  // neutral answer and no token. Unactivated users must use their activation link.
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.emailVerifiedAt || user.disabledAt) return NEUTRAL;

  const raw = await createToken(user.id, TokenPurpose.PASSWORD_RESET);
  const url = resetUrl(raw);
  // Send after the response, like the requestAccess operator notice: keeps the
  // eligible/ineligible branches at comparable latency and non-blocking.
  after(() => sendBestEffort(passwordResetLinkEmail(user.email, user.name, url)));
  return NEUTRAL;
}

export async function resetPassword(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const ip = clientIp(await headers());
  if (await rateLimit(`resetpw:${ip}`, RESET_MAX, WINDOW_MS)) {
    return { status: "error", message: "Demasiados intentos. Inténtalo más tarde." };
  }

  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const policy = validatePassword(password);
  if (!policy.ok) return { status: "error", message: policy.error };
  if (password !== confirm) return { status: "error", message: "Las contraseñas no coinciden." };

  const valid = await verifyToken(token, TokenPurpose.PASSWORD_RESET);
  if (!valid) return { status: "error", message: "El enlace es inválido o expiró." };

  // Disable is the system's revocation primitive: a token minted while the account
  // was active must not stay redeemable after the account is disabled. Same generic
  // message as an invalid token — indistinguishable from the outside.
  const user = await prisma.user.findUnique({ where: { id: valid.userId } });
  if (!user || user.disabledAt) return { status: "error", message: "El enlace es inválido o expiró." };

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.$transaction(async (tx) => {
    // Atomically claim THIS token (same race guard as activateAccount).
    const claimed = await tx.verificationToken.updateMany({
      where: { id: valid.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (claimed.count !== 1) throw new Error("Token already consumed");
    await consumeTokens(tx, valid.userId, TokenPurpose.PASSWORD_RESET);
    // Deliberately does NOT touch emailVerifiedAt: reset never activates an account.
    const user = await tx.user.update({ where: { id: valid.userId }, data: { passwordHash } });
    await writeAudit(tx, {
      companyId: user.companyId,
      actorId: user.id,
      action: "user.password_reset_self",
      targetType: "User",
      targetId: user.id,
      summary: `Password reset via emailed link (${user.email})`,
    });
  });

  redirect("/login?reset=1");
}
