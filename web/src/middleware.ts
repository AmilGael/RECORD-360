import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    // Exclude API, Next internals, and public PWA assets (manifest, service
    // worker, icons, offline fallback) so they're reachable without a session.
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icon-192.png|icon-512.png|apple-touch-icon.png|offline).*)",
  ],
};
