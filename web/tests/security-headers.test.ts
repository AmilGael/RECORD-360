import { describe, it, expect } from "vitest";
import { SECURITY_HEADERS } from "@/lib/security-headers";
import nextConfig from "../next.config";

// These headers were previously declared in netlify.toml [[headers]], but the
// @netlify/plugin-nextjs runtime serves responses through Next and ignores
// netlify.toml headers — so they never reached production. Next's headers() IS
// honored by that runtime, so the header set now lives here and is asserted below.
describe("security headers", () => {
  const byKey = Object.fromEntries(SECURITY_HEADERS.map((h) => [h.key, h.value]));

  it("carries the clickjacking + CSP + transport protections", () => {
    expect(byKey["X-Frame-Options"]).toBe("DENY");
    expect(byKey["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(byKey["Content-Security-Policy"]).toContain("default-src 'self'");
    expect(byKey["Strict-Transport-Security"]).toBe("max-age=63072000; includeSubDomains; preload");
    expect(byKey["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(byKey["Permissions-Policy"]).toContain("camera=(self)");
    expect(byKey["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("next.config applies the full set to every route", async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toEqual([{ source: "/:path*", headers: SECURITY_HEADERS }]);
  });
});
