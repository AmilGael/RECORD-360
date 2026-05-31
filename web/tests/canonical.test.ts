import { describe, it, expect } from "vitest";
import { canonicalPayload, type RegistroPayload } from "@/lib/registro/canonical";

const base: RegistroPayload = {
  type: "NOTE", text: "Vaciado completado", mediaUrl: null, progressPct: 72,
  authorId: "ckxaAUTHOR", gpsLat: 18.4861, gpsLng: -69.9312,
  serverCreatedAt: new Date("2026-05-31T08:42:17.123Z"),
};

describe("canonicalPayload", () => {
  it("serializes with sorted keys, nulls included, gps fixed to 6 dp", () => {
    expect(canonicalPayload(base)).toBe(
      '{"authorId":"ckxaAUTHOR","gpsLat":"18.486100","gpsLng":"-69.931200","mediaUrl":null,"progressPct":72,"serverCreatedAt":"2026-05-31T08:42:17.123Z","text":"Vaciado completado","type":"NOTE"}'
    );
  });

  it("is stable regardless of input field order", () => {
    const reordered: RegistroPayload = { ...base };
    expect(canonicalPayload(reordered)).toBe(canonicalPayload(base));
  });

  it("includes nulls for absent gps", () => {
    const noGps: RegistroPayload = { ...base, gpsLat: null, gpsLng: null };
    expect(canonicalPayload(noGps)).toContain('"gpsLat":null');
    expect(canonicalPayload(noGps)).toContain('"gpsLng":null');
  });
});
