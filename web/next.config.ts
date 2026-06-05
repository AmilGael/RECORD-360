import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // TEMP (cloudflare quick-tunnel testing) — remove before merging.
  allowedDevOrigins: ["*.trycloudflare.com"],
  experimental: {
    // Phone photos / PDFs exceed the 1 MB server-action default and were failing.
    serverActions: { bodySizeLimit: "50mb" },
  },
};

export default nextConfig;
