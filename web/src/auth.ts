import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/auth.config";
import { loginThrottleKey } from "@/lib/auth/login-throttle";
import { verifyCredentials } from "@/lib/auth/credentials";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (creds, request) => {
        const email = String(creds?.email ?? "");
        const password = String(creds?.password ?? "");
        const key = request ? loginThrottleKey(email, request) : null;
        return verifyCredentials(email, password, key);
      },
    }),
  ],
});
