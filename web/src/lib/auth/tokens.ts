import { randomBytes, createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { TokenPurpose } from "@prisma/client";
import { prisma } from "@/lib/db";

const ACTIVATION_TTL_MS = 24 * 60 * 60 * 1000;

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Mint an ACTIVATION token for a user. Returns the RAW token (only time it exists). */
export async function createActivationToken(userId: string, now = new Date()): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await prisma.verificationToken.create({
    data: {
      tokenHash: hashToken(raw),
      purpose: TokenPurpose.ACTIVATION,
      userId,
      expiresAt: new Date(now.getTime() + ACTIVATION_TTL_MS),
    },
  });
  return raw;
}

/** Return {id,userId} if the token is valid (exists, ACTIVATION, unexpired, unconsumed), else null. */
export async function verifyActivationToken(
  raw: string,
  now = new Date(),
): Promise<{ id: string; userId: string } | null> {
  const row = await prisma.verificationToken.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!row || row.purpose !== TokenPurpose.ACTIVATION || row.consumedAt || row.expiresAt <= now) return null;
  return { id: row.id, userId: row.userId };
}

/** Consume all outstanding ACTIVATION tokens for a user (single-use enforcement). */
export async function consumeActivationTokens(
  tx: Prisma.TransactionClient,
  userId: string,
  now = new Date(),
): Promise<void> {
  await tx.verificationToken.updateMany({
    where: { userId, purpose: TokenPurpose.ACTIVATION, consumedAt: null },
    data: { consumedAt: now },
  });
}

/** Absolute activation link. Falls back to localhost in dev so the email always has a link. */
export function activationUrl(rawToken: string): string {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/activate/${rawToken}`;
}
