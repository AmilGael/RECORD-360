import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  // Security headers live here (not netlify.toml [[headers]]): the Netlify Next.js
  // runtime serves responses through Next and ignores netlify.toml headers, so
  // next.config's headers() is the only place that reliably reaches every route.
  async headers() {
    // /api/media is excluded: config-level headers OVERRIDE headers a route
    // handler sets on its response (verified against the running server), and
    // the media route needs per-content-type CSPs — a locked-down sandbox for
    // images/video, a viewer-compatible CSP for PDFs (Chrome's PDF viewer
    // cannot render under `sandbox`, crbug 413851). With the blanket rule in
    // place, the global CSP silently replaced the media route's hardened one.
    // The route re-sends the transport headers (nosniff, HSTS) itself.
    return [{ source: "/((?!api/media/).*)", headers: SECURITY_HEADERS }];
  },
  // Dev-only opt-in: let the Next dev server accept requests proxied through a
  // Cloudflare quick tunnel during external testing. Off by default (production
  // is unaffected — allowedDevOrigins only applies to `next dev`). Enable with
  // DEV_TUNNEL=1 when running the dev server behind a tunnel.
  ...(process.env.DEV_TUNNEL ? { allowedDevOrigins: ["*.trycloudflare.com"] } : {}),
  // Keep pdfkit out of the webpack bundle so its built-in AFM fonts load at
  // runtime from the node_modules filesystem (not inlined into the bundle).
  serverExternalPackages: ["pdfkit"],
  experimental: {
    // Phone photos / PDFs exceed the 1 MB server-action default and were failing.
    // Kept above the largest per-type upload cap (50mb, see lib/registro/upload.ts)
    // so oversize files get a graceful message instead of an opaque framework error.
    serverActions: { bodySizeLimit: "60mb" },
  },
};

export default nextConfig;
