import { describe, it, expect } from "vitest";
import { canonicalPayload, type RegistroPayload } from "@/lib/registro/canonical";

const base: RegistroPayload = {
  ledgerVersion: 2,
  category: "MATERIALES",
  text: "hola",
  progressPct: 40,
  authorId: "u1",
  locationId: "loc1",
  gpsLat: 18.4861,
  gpsLng: -69.9312,
  serverCreatedAt: new Date("2026-06-02T12:00:00.000Z"),
  attachments: [
    { fileType: "IMAGE", sha256: "bbbb" },
    { fileType: "IMAGE", sha256: "aaaa" },
  ],
};

describe("canonicalPayload v2", () => {
  it("emits keys in sorted order and formats gps to 6 dp", () => {
    const s = canonicalPayload(base);
    expect(s).toContain('"authorId":"u1"');
    expect(s).toContain('"gpsLat":"18.486100"');
    expect(s).toContain('"ledgerVersion":2');
    expect(s.indexOf('"attachments"')).toBeLessThan(s.indexOf('"authorId"'));
  });

  it("is independent of attachment order (sorted by sha256)", () => {
    const reversed: RegistroPayload = {
      ...base,
      attachments: [
        { fileType: "IMAGE", sha256: "aaaa" },
        { fileType: "IMAGE", sha256: "bbbb" },
      ],
    };
    expect(canonicalPayload(base)).toBe(canonicalPayload(reversed));
  });

  it("represents nulls explicitly", () => {
    const s = canonicalPayload({ ...base, category: null, locationId: null, text: null, progressPct: null, gpsLat: null, gpsLng: null });
    expect(s).toContain('"category":null');
    expect(s).toContain('"locationId":null');
    expect(s).toContain('"gpsLat":null');
  });
});
