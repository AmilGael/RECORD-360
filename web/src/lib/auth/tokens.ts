import { randomBytes, createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { TokenPurpose } from "@prisma/client";
import { prisma } from "@/lib/db";

/** Per-purpose token lifetime. Reset links are short-lived on purpose. */
const TTL_MS: Record<TokenPurpose, number> = {
  [TokenPurpose.ACTIVATION]: 24 * 60 * 60 * 1000,
  [TokenPurpose.PASSWORD_RESET]: 2 * 60 * 60 * 1000,
};

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Mint a token for a user. Returns the RAW token (only time it exists). */
export async function createToken(userId: string, purpose: TokenPurpose, now = new Date()): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await prisma.verificationToken.create({
    data: {
      tokenHash: hashToken(raw),
      purpose,
      userId,
      expiresAt: new Date(now.getTime() + TTL_MS[purpose]),
    },
  });
  return raw;
}

/** Return {id,userId} if the token is valid for this purpose (exists, unexpired, unconsumed), else null. */
export async function verifyToken(
  raw: string,
  purpose: TokenPurpose,
  now = new Date(),
): Promise<{ id: string; userId: string } | null> {
  const row = await prisma.verificationToken.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!row || row.purpose !== purpose || row.consumedAt || row.expiresAt <= now) return null;
  return { id: row.id, userId: row.userId };
}

/** Consume all outstanding tokens of one purpose for a user (single-use enforcement). */
export async function consumeTokens(
  tx: Prisma.TransactionClient,
  userId: string,
  purpose: TokenPurpose,
  now = new Date(),
): Promise<void> {
  await tx.verificationToken.updateMany({
    where: { userId, purpose, consumedAt: null },
    data: { consumedAt: now },
  });
}

// ── ACTIVATION wrappers (existing call sites in access.ts / activation.ts / admin.ts) ──

export async function createActivationToken(userId: string, now = new Date()): Promise<string> {
  return createToken(userId, TokenPurpose.ACTIVATION, now);
}

export async function verifyActivationToken(raw: string, now = new Date()) {
  return verifyToken(raw, TokenPurpose.ACTIVATION, now);
}

export async function consumeActivationTokens(tx: Prisma.TransactionClient, userId: string, now = new Date()): Promise<void> {
  return consumeTokens(tx, userId, TokenPurpose.ACTIVATION, now);
}

function baseUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Absolute activation link. Falls back to localhost in dev so the email always has a link. */
export function activationUrl(rawToken: string): string {
  return `${baseUrl()}/activate/${rawToken}`;
}

/** Absolute password-reset link. Same fallback behavior as activationUrl. */
export function resetUrl(rawToken: string): string {
  return `${baseUrl()}/reset/${rawToken}`;
}
