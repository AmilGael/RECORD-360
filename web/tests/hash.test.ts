import { describe, it, expect } from "vitest";
import { computeHash, verifyChain, GENESIS_PREV_HASH, type StoredRegistro } from "@/lib/registro/hash";
import { type RegistroPayload } from "@/lib/registro/canonical";

const payload = (over: Partial<RegistroPayload> = {}): RegistroPayload => ({
  type: "NOTE", text: "a", mediaUrl: null, progressPct: null, authorId: "u1",
  gpsLat: null, gpsLng: null, serverCreatedAt: new Date("2026-05-31T08:00:00.000Z"), ...over,
});

const stored = (p: RegistroPayload, id: string, prevHash: string): StoredRegistro => ({
  id, prevHash, hash: computeHash(prevHash, p),
  type: p.type, text: p.text, mediaUrl: p.mediaUrl, progressPct: p.progressPct,
  authorId: p.authorId, gpsLat: p.gpsLat, gpsLng: p.gpsLng, serverCreatedAt: p.serverCreatedAt,
});

describe("hash chain", () => {
  it("genesis registro uses the 64-zero sentinel", () => {
    expect(GENESIS_PREV_HASH).toBe("0".repeat(64));
    const g = stored(payload(), "g", GENESIS_PREV_HASH);
    expect(verifyChain([g])).toEqual({ ok: true });
  });

  it("links second entry prevHash to first hash", () => {
    const a = stored(payload({ text: "first" }), "a", GENESIS_PREV_HASH);
    const b = stored(payload({ text: "second", serverCreatedAt: new Date("2026-05-31T09:00:00.000Z") }), "b", a.hash);
    expect(b.prevHash).toBe(a.hash);
    expect(verifyChain([a, b])).toEqual({ ok: true });
  });

  it("detects tampering with a stored field", () => {
    const a = stored(payload({ text: "first" }), "a", GENESIS_PREV_HASH);
    const tampered = { ...a, text: "changed" };
    expect(verifyChain([tampered])).toEqual({ ok: false, brokenAt: "a" });
  });

  it("detects a broken link", () => {
    const a = stored(payload({ text: "first" }), "a", GENESIS_PREV_HASH);
    const b = stored(payload({ text: "second" }), "b", "deadbeef".repeat(8));
    expect(verifyChain([a, b])).toEqual({ ok: false, brokenAt: "b" });
  });
});
