import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { loginThrottleBlocked, loginThrottleFailure, loginThrottleReset } from "@/lib/auth/login-throttle";

export type AuthedUser = { id: string; name: string; email: string; role: Role; companyId: string };

/** Returns the user on success, else null. Null cases are intentionally indistinguishable. */
export async function verifyCredentials(
  email: string,
  password: string,
  throttleKey?: string | null,
): Promise<AuthedUser | null> {
  if (throttleKey && (await loginThrottleBlocked(throttleKey))) return null;

  const user = await prisma.user.findUnique({ where: { email } });
  const fail = async () => { if (throttleKey) await loginThrottleFailure(throttleKey); return null; };

  if (!user || user.disabledAt) return fail();
  if (!user.passwordHash || !user.emailVerifiedAt) return fail(); // unactivated
  if (!(await bcrypt.compare(password, user.passwordHash))) return fail();

  if (throttleKey) await loginThrottleReset(throttleKey);
  return { id: user.id, name: user.name, email: user.email, role: user.role, companyId: user.companyId };
}
