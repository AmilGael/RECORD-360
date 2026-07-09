import { prisma } from "@/lib/db";

const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 5;

export function loginThrottleKey(email: string, request: Request) {
  const normalizedEmail = email.trim().toLowerCase();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const cfIp = request.headers.get("cf-connecting-ip")?.trim();
  const ip = forwarded || realIp || cfIp || "unknown";
  return `${normalizedEmail}|${ip}`;
}

export async function loginThrottleBlocked(key: string, now = new Date()) {
  const row = await prisma.loginAttempt.findUnique({ where: { key } });
  if (!row) return false;
  if (row.blockedUntil && row.blockedUntil > now) return true;
  if (now.getTime() - row.windowStartedAt.getTime() >= WINDOW_MS) {
    await prisma.loginAttempt.delete({ where: { key } }).catch(() => undefined);
    return false;
  }
  return row.failures >= MAX_FAILURES;
}

export async function loginThrottleFailure(key: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.loginAttempt.findUnique({ where: { key } });
    if (!row || now.getTime() - row.windowStartedAt.getTime() >= WINDOW_MS) {
      await tx.loginAttempt.upsert({
        where: { key },
        create: { key, failures: 1, windowStartedAt: now, lastFailureAt: now },
        update: { failures: 1, windowStartedAt: now, blockedUntil: null, lastFailureAt: now },
      });
      return { failures: 1, blocked: false };
    }

    const failures = row.failures + 1;
    const blockedUntil = failures >= MAX_FAILURES ? new Date(now.getTime() + WINDOW_MS) : row.blockedUntil;
    await tx.loginAttempt.update({
      where: { key },
      data: { failures, blockedUntil, lastFailureAt: now },
    });
    return { failures, blocked: Boolean(blockedUntil && blockedUntil > now) };
  });
}

export async function loginThrottleReset(key: string) {
  await prisma.loginAttempt.deleteMany({ where: { key } });
}

