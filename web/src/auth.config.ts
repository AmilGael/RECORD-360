import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [], // real providers are added in auth.ts (Node runtime only)
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      // Public: landing ("/") and the login page. Everything else (the /app/* product) requires a session.
      const isPublic = pathname === "/" || pathname.startsWith("/login");
      if (isPublic) return true;
      return !!auth?.user; // false => next-auth redirects to the signIn page
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
