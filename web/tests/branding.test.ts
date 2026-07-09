import { describe, it, expect } from "vitest";
import { dictionaries } from "@/i18n/dictionaries";

describe("Raphel branding", () => {
  it("uses Raphel as the app name in both locales", () => {
    expect(dictionaries.es.common.app).toBe("Raphel");
    expect(dictionaries.en.common.app).toBe("Raphel");
  });

  it("has no leftover 'Raphl' or 'RECORD 360' product name in i18n copy", () => {
    // The seeded demo credential (admin@record360.do) is intentionally
    // retained; it does not contain the display string "RECORD 360".
    const json = JSON.stringify(dictionaries);
    expect(json).not.toContain("Raphl");
    expect(json).not.toContain("RECORD 360");
  });
});
