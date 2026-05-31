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
    // Same values, properties authored in reverse-alphabetical order — output
    // must be byte-identical to `base`, proving the canonical sort drives it.
    const reordered: RegistroPayload = {
      serverCreatedAt: new Date("2026-05-31T08:42:17.123Z"),
      gpsLng: -69.9312, gpsLat: 18.4861, authorId: "ckxaAUTHOR",
      progressPct: 72, mediaUrl: null, text: "Vaciado completado", type: "NOTE",
    };
    expect(canonicalPayload(reordered)).toBe(canonicalPayload(base));
  });

  it("rounds non-integer progressPct to an integer", () => {
    expect(canonicalPayload({ ...base, progressPct: 71.6 })).toContain('"progressPct":72');
  });

  it("includes nulls for absent gps", () => {
    const noGps: RegistroPayload = { ...base, gpsLat: null, gpsLng: null };
    expect(canonicalPayload(noGps)).toContain('"gpsLat":null');
    expect(canonicalPayload(noGps)).toContain('"gpsLng":null');
  });
});
