import { normalizeEmail } from "@/lib/auth/email";
import { LockedOutSignin } from "@/lib/auth/errors";
import { loginThrottleBlocked, loginThrottleKey } from "@/lib/auth/login-throttle";
import { verifyCredentials, type AuthedUser } from "@/lib/auth/credentials";

/** The Credentials provider's authorize, kept outside auth.ts so tests can call it without NextAuth. */
export async function authorizeCredentials(
  creds: Partial<Record<string, unknown>> | undefined,
  request: Request | undefined,
): Promise<AuthedUser | null> {
  const email = normalizeEmail(creds?.email);
  const password = String(creds?.password ?? "");
  const key = request ? loginThrottleKey(email, request) : null;
  if (key && (await loginThrottleBlocked(key))) throw new LockedOutSignin();
  return verifyCredentials(email, password, key);
}
