"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { verifyActivationToken, consumeActivationTokens } from "@/lib/auth/tokens";
import { MIN_PASSWORD_LENGTH, validatePassword } from "@/lib/auth/password-policy";
import { writeAudit } from "@/lib/audit/log";
import { userText } from "@/lib/errors/form-result";

export type ActivateState = { status: "idle" | "error"; message?: string };
const WINDOW_MS = 60 * 60_000;
const ACTIVATE_MAX = 10;

export async function activateAccount(_prev: ActivateState, formData: FormData): Promise<ActivateState> {
  const ip = clientIp(await headers());
  if (await rateLimit(`activate:${ip}`, ACTIVATE_MAX, WINDOW_MS)) {
    return { status: "error", message: await userText("tooManyAttempts") };
  }

  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const policy = validatePassword(password);
  if (!policy.ok) return { status: "error", message: await userText(policy.key, { min: MIN_PASSWORD_LENGTH }) };
  if (password !== confirm) return { status: "error", message: await userText("passwordMismatch") };

  const valid = await verifyActivationToken(token);
  if (!valid) return { status: "error", message: await userText("linkInvalid") };

  // Disable is the system's revocation primitive: a token minted before the account
  // was disabled must not stay redeemable. Refusing here keeps activation in parity
  // with resetPassword and prevents a disabled account from being silently activated
  // (which would persist an attacker-set password if it were ever re-enabled). Same
  // generic message as an invalid token — indistinguishable from the outside.
  const account = await prisma.user.findUnique({ where: { id: valid.userId } });
  if (!account || account.disabledAt) return { status: "error", message: await userText("linkInvalid") };

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.$transaction(async (tx) => {
    // Atomically claim THIS token (guards on consumedAt: null). Under Postgres read-committed,
    // a racing request that already consumed it matches 0 rows here → we abort, preventing
    // double-activation of a single-use token.
    const claimed = await tx.verificationToken.updateMany({
      where: { id: valid.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (claimed.count !== 1) throw new Error("Token already consumed");
    // Invalidate any other outstanding activation tokens for this user.
    await consumeActivationTokens(tx, valid.userId);
    const user = await tx.user.update({
      where: { id: valid.userId },
      data: { passwordHash, emailVerifiedAt: new Date() },
    });
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
