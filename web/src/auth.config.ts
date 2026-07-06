import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  session: { strategy: "jwt", maxAge: 60 * 60 },
  jwt: { maxAge: 60 * 60 },
  pages: { signIn: "/login" },
  providers: [], // real providers are added in auth.ts (Node runtime only)
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      // Public: landing ("/") and the login page. Everything else (the /app/* product) requires a session.
      // Edge middleware only checks the signed JWT here; DB-backed freshness/revocation
      // (disabled user, changed tenant/role) is enforced by requireFreshSession in the
      // /app layout and in every server action/API route (Node runtime — Prisma can't
      // run on the edge, and a self-fetch from middleware breaks behind a proxy/tunnel).
      const isPublic =
        pathname === "/" ||
        pathname.startsWith("/login") ||
        pathname.startsWith("/request-access") ||
        pathname.startsWith("/activate") ||
        pathname.startsWith("/verify/");
      if (isPublic) return true;
      return !!auth?.user;
    },
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role;
        token.companyId = (user as { companyId?: string }).companyId;
        token.uid = (user as { id?: string }).id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.uid as string;
        (session.user as { role?: string }).role = token.role as string;
        (session.user as { companyId?: string }).companyId = token.companyId as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
