import { describe, expect, it } from "vitest";
import { isSafeNotificationLink } from "@/lib/notifications/link";

describe("isSafeNotificationLink", () => {
  it("allows exactly /app, /app/ paths and /app? queries", () => {
    expect(isSafeNotificationLink("/app")).toBe(true);
    expect(isSafeNotificationLink("/app/partidas/abc")).toBe(true);
    expect(isSafeNotificationLink("/app?tab=planos")).toBe(true);
  });

  it("rejects other paths, schemes, slashes, whitespace and controls", () => {
    expect(isSafeNotificationLink("/apple")).toBe(false);
    expect(isSafeNotificationLink("/login")).toBe(false);
    expect(isSafeNotificationLink("/app /x")).toBe(false);
    expect(isSafeNotificationLink("/app/\tfoo")).toBe(false);
    expect(isSafeNotificationLink("/app/\nfoo")).toBe(false);
    expect(isSafeNotificationLink("/app/\u0000foo")).toBe(false);
    expect(isSafeNotificationLink("//evil.example")).toBe(false);
    expect(isSafeNotificationLink("/app/foo//bar")).toBe(false);
    expect(isSafeNotificationLink("/app\\foo")).toBe(false);
    expect(isSafeNotificationLink("https://evil.example")).toBe(false);
    expect(isSafeNotificationLink("javascript:alert(1)")).toBe(false);
    expect(isSafeNotificationLink(null)).toBe(false);
    expect(isSafeNotificationLink("")).toBe(false);
  });
});
