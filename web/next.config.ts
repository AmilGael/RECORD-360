import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
