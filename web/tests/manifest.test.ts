import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

describe("PWA manifest", () => {
  it("is installable: standalone display, scope, icons, theme", () => {
    const m = manifest();
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/app");
    expect(m.theme_color).toBe("#0b0b0c");
    // Chrome install criteria: 192 + 512 icons, plus a maskable one.
    const sizes = m.icons?.map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(m.icons?.some((i) => i.purpose === "maskable")).toBe(true);
  });
});
