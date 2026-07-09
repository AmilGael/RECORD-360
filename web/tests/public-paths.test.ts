import { describe, expect, it } from "vitest";
import { authConfig } from "@/auth.config";

function authorized(pathname: string, hasSession = false): boolean {
  return authConfig.callbacks.authorized({
    auth: hasSession ? ({ user: { id: "u1" } } as never) : null,
    request: { nextUrl: { pathname } } as never,
  }) as boolean;
}

describe("public paths", () => {
  it.each(["/forgot-password", "/reset/some-raw-token", "/request-access", "/activate/x", "/login", "/"])(
    "allows %s without a session",
    (p) => expect(authorized(p)).toBe(true),
  );
  it("still protects /app without a session", () => {
    expect(authorized("/app")).toBe(false);
    expect(authorized("/app", true)).toBe(true);
  });
});
