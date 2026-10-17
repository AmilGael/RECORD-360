import bcrypt from "bcryptjs";
import type { Role, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/auth/email";
import { loginThrottleBlocked, loginThrottleFailure, loginThrottleReset } from "@/lib/auth/login-throttle";

export type AuthedUser = { id: string; name: string; email: string; role: Role; companyId: string };

// Same cost as real password hashes, so the no-user / disabled / unactivated
// paths spend the same bcrypt time as a wrong password and response latency
// does not reveal which emails have usable accounts.
const DUMMY_HASH = bcrypt.hashSync("raphel-dummy-password-never-matches", 10);

/**
 * Exact match on the normalized email first. Legacy rows stored before emails
 * were normalized may carry mixed case; accept one only when it is the single
 * case-insensitive match, so two rows differing by case never pick a winner.
 */
async function findLoginUser(email: string): Promise<User | null> {
  const exact = await prisma.user.findUnique({ where: { email } });
  if (exact) return exact;
  const legacy = await prisma.user.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    take: 2,
  });
  return legacy.length === 1 ? legacy[0] : null;
}

/** Returns the user on success, else null. Null cases are intentionally indistinguishable. */
export async function verifyCredentials(
  rawEmail: string,
  password: string,
  throttleKey?: string | null,
): Promise<AuthedUser | null> {
  if (throttleKey && (await loginThrottleBlocked(throttleKey))) return null;

  const email = normalizeEmail(rawEmail);
  const user = email ? await findLoginUser(email) : null;
  const fail = async () => { if (throttleKey) await loginThrottleFailure(throttleKey); return null; };

  if (!user || user.disabledAt || !user.passwordHash || !user.emailVerifiedAt) {
    await bcrypt.compare(password, DUMMY_HASH);
    return fail();
  }
  if (!(await bcrypt.compare(password, user.passwordHash))) return fail();

  if (throttleKey) await loginThrottleReset(throttleKey);
  return { id: user.id, name: user.name, email: user.email, role: user.role, companyId: user.companyId };
}
