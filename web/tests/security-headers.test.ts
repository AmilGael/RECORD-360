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

  it("allows self microphone + geolocation (dictation and GPS capture need them)", () => {
    expect(byKey["Permissions-Policy"]).toContain("microphone=(self)");
    expect(byKey["Permissions-Policy"]).toContain("geolocation=(self)");
  });

  it("keeps unsafe-eval out of the CSP outside development", () => {
    // vitest runs with NODE_ENV=test, same branch production takes.
    expect(byKey["Content-Security-Policy"]).not.toContain("unsafe-eval");
  });

  it("next.config applies the full set everywhere except /api/media", async () => {
    // /api/media is carved out because config-level headers override the ones
    // a route handler sets, and the media route owns its per-content-type CSP
    // (sandbox for images/video, a viewer-compatible CSP for PDFs).
    const rules = await nextConfig.headers!();
    expect(rules).toEqual([{ source: "/((?!api/media/).*)", headers: SECURITY_HEADERS }]);
    const [, pattern] = rules[0].source.match(/^\/\((.*)\)$/)!;
    const re = new RegExp(`^(${pattern})$`);
    expect(re.test("app/projects/x")).toBe(true);
    expect(re.test("")).toBe(true); // the root path
    expect(re.test("api/uploads/presign")).toBe(true);
    expect(re.test("api/media/abc.pdf")).toBe(false);
  });
});
