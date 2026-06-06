import { describe, it, expect } from "vitest";
import { computeHash, verifyChain, GENESIS_PREV_HASH, type StoredRegistro } from "@/lib/registro/hash";
import type { RegistroPayload } from "@/lib/registro/canonical";

function make(prevHash: string, id: string, over: Partial<RegistroPayload> = {}): StoredRegistro {
  const payload: RegistroPayload = {
    ledgerVersion: 2, category: null, text: "x", progressPct: null, authorId: "u1",
    locationId: null, gpsLat: null, gpsLng: null, serverCreatedAt: new Date("2026-06-02T12:00:00.000Z"),
    attachments: [], ...over,
  };
  return { ...payload, id, prevHash, hash: computeHash(prevHash, payload) };
}

describe("verifyChain v2", () => {
  it("accepts a valid two-record chain", () => {
    const r1 = make(GENESIS_PREV_HASH, "r1");
    const r2 = make(r1.hash, "r2", { text: "y" });
    expect(verifyChain([r1, r2])).toEqual({ ok: true });
  });

  it("detects a tampered attachment hash", () => {
    const r1 = make(GENESIS_PREV_HASH, "r1", { attachments: [{ fileType: "IMAGE" as const, sha256: "aaaa" }] });
    const tampered = { ...r1, attachments: [{ fileType: "IMAGE" as const, sha256: "ffff" }] };
    expect(verifyChain([tampered])).toEqual({ ok: false, brokenAt: "r1" });
  });

  it("detects a tampered category", () => {
    const r1 = make(GENESIS_PREV_HASH, "r1", { category: "MATERIALES" });
    const tampered = { ...r1, category: "COSTOS" as const };
    expect(verifyChain([tampered])).toEqual({ ok: false, brokenAt: "r1" });
  });

  it("rejects a record stamped with a non-v2 ledgerVersion", () => {
    const r1 = make(GENESIS_PREV_HASH, "r1");
    expect(verifyChain([{ ...r1, ledgerVersion: 1 }])).toEqual({ ok: false, brokenAt: "r1" });
  });

  it("detects a broken prevHash link", () => {
    const r1 = make(GENESIS_PREV_HASH, "r1");
    const r2 = make("deadbeef".repeat(8), "r2"); // prevHash does not match r1.hash
    expect(verifyChain([r1, r2])).toEqual({ ok: false, brokenAt: "r2" });
  });
});
