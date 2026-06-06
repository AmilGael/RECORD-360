import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { authConfig } from "@/auth.config";
import { loginThrottleBlocked, loginThrottleFailure, loginThrottleKey, loginThrottleReset } from "@/lib/auth/login-throttle";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (creds, request) => {
        const email = String(creds?.email ?? "");
        const password = String(creds?.password ?? "");
        const key = request ? loginThrottleKey(email, request) : null;
        if (key && await loginThrottleBlocked(key)) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || user.disabledAt) {
          if (key) await loginThrottleFailure(key);
          return null;
        }
        if (!(await bcrypt.compare(password, user.passwordHash))) {
          if (key) await loginThrottleFailure(key);
          return null;
        }
        if (key) await loginThrottleReset(key);
        return { id: user.id, name: user.name, email: user.email, role: user.role, companyId: user.companyId };
      },
    }),
  ],
});
