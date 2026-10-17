import { afterEach, describe, it, expect, vi } from "vitest";
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

// Direct uploads PUT to the R2 endpoint from the browser, so connect-src must
// carry its origin. The header string is computed at module load, so each case
// re-evaluates the module under its own stubbed env.
describe("CSP connect-src for direct uploads", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  async function cspWith(env: { S3_BUCKET?: string; S3_ENDPOINT?: string }) {
    vi.resetModules();
    vi.stubEnv("S3_BUCKET", env.S3_BUCKET ?? "");
    vi.stubEnv("S3_ENDPOINT", env.S3_ENDPOINT ?? "");
    const mod = await import("@/lib/security-headers");
    return mod.SECURITY_HEADERS.find((h) => h.key === "Content-Security-Policy")!.value;
  }
  const connectSrc = (csp: string) => csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("connect-src"));

  it("adds the endpoint origin, without the bucket path, when S3 is configured", async () => {
    const csp = await cspWith({ S3_BUCKET: "raphel-media", S3_ENDPOINT: "https://acct123.r2.cloudflarestorage.com/raphel-media" });
    expect(connectSrc(csp)).toBe("connect-src 'self' https://acct123.r2.cloudflarestorage.com");
    expect(csp).not.toContain("raphel-media");
    expect(csp).not.toContain("*");
  });

  it("keeps connect-src at 'self' when S3 is not configured", async () => {
    expect(connectSrc(await cspWith({}))).toBe("connect-src 'self'");
  });

  it.each([
    ["S3_ENDPOINT is missing", { S3_BUCKET: "b" }, /S3_ENDPOINT is missing/],
    ["S3_ENDPOINT is not a URL", { S3_BUCKET: "b", S3_ENDPOINT: "acct.r2.cloudflarestorage.com" }, /not a valid URL/],
    ["S3_ENDPOINT is not https", { S3_BUCKET: "b", S3_ENDPOINT: "http://acct.r2.cloudflarestorage.com" }, /must use https/],
  ])("fails loudly when %s", async (_label, env, message) => {
    await expect(cspWith(env)).rejects.toThrow(message);
  });
});
