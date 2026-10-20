import { describe, expect, it } from "vitest";
import { sanitizeFileName } from "@/lib/storage/filename";

describe("sanitizeFileName", () => {
  it("keeps the basename only", () => {
    expect(sanitizeFileName("C:\\\\planos\\\\Planta.pdf")).toBe("Planta.pdf");
    expect(sanitizeFileName("/Users/x/Planta Arquitectónica.pdf")).toBe("Planta Arquitectónica.pdf");
  });
  it("normalizes NFC, strips controls, collapses whitespace, caps at 200", () => {
    expect(sanitizeFileName("Planta\u0000  Eléctrica.pdf")).toBe("Planta Eléctrica.pdf");
    expect(sanitizeFileName("  a\n\tb  ")).toBe("a b");
    const long = `${"n".repeat(250)}.pdf`;
    const out = sanitizeFileName(long);
    expect(out).toHaveLength(200);
  });
  it("returns null when empty after cleaning", () => {
    expect(sanitizeFileName("")).toBeNull();
    expect(sanitizeFileName("///")).toBeNull();
    expect(sanitizeFileName("   \u0007  ")).toBeNull();
  });
});
