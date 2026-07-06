import { prisma } from "@/lib/db";

/** Returns true when this call pushes the counter ABOVE `max` within `windowMs`. */
export async function rateLimit(key: string, max: number, windowMs: number, now = new Date()): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.loginAttempt.findUnique({ where: { key } });
    if (!row || now.getTime() - row.windowStartedAt.getTime() >= windowMs) {
      await tx.loginAttempt.upsert({
        where: { key },
        create: { key, failures: 1, windowStartedAt: now, lastFailureAt: now },
        update: { failures: 1, windowStartedAt: now, blockedUntil: null, lastFailureAt: now },
      });
      return false;
    }
    const failures = row.failures + 1;
    await tx.loginAttempt.update({ where: { key }, data: { failures, lastFailureAt: now } });
    return failures > max;
  });
}

/** Best-effort client IP from proxy headers (Netlify / Cloudflare). */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || headers.get("x-real-ip")?.trim() || headers.get("cf-connecting-ip")?.trim() || "unknown";
}
