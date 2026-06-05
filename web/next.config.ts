import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // TEMP (cloudflare quick-tunnel testing) — remove before merging.
  allowedDevOrigins: ["*.trycloudflare.com"],
  experimental: {
    // Phone photos / PDFs exceed the 1 MB server-action default and were failing.
    // Kept above the largest per-type upload cap (50mb, see lib/registro/upload.ts)
    // so oversize files get a graceful message instead of an opaque framework error.
    serverActions: { bodySizeLimit: "60mb" },
  },
};

export default nextConfig;
