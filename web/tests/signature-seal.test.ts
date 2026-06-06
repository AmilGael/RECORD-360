import { describe, it, expect } from "vitest";
import { computeSignatureSeal, type SignatureSealInput } from "@/lib/signatures/seal";

const base: SignatureSealInput = {
  partidaId: "p1",
  signerId: "u1",
  signerName: "Ana Méndez",
  signerRole: "SUPERVISOR",
  statement: "Conforme con el avance",
  chainHead: "abc123def456",
  signedAt: new Date("2026-06-05T10:00:00Z"),
};

describe("computeSignatureSeal", () => {
  it("returns a 64-char hex digest", () => {
    const seal = computeSignatureSeal(base);
    expect(seal).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic: same input → same hash", () => {
    expect(computeSignatureSeal(base)).toBe(computeSignatureSeal(base));
  });

  it("changes when signerId changes", () => {
    expect(computeSignatureSeal(base)).not.toBe(
      computeSignatureSeal({ ...base, signerId: "u2" })
    );
  });

  it("changes when chainHead changes", () => {
    expect(computeSignatureSeal(base)).not.toBe(
      computeSignatureSeal({ ...base, chainHead: "different" })
    );
  });

  it("changes when statement changes", () => {
    expect(computeSignatureSeal(base)).not.toBe(
      computeSignatureSeal({ ...base, statement: "Other statement" })
    );
  });

  it("changes when signedAt changes", () => {
    expect(computeSignatureSeal(base)).not.toBe(
      computeSignatureSeal({ ...base, signedAt: new Date("2026-06-05T11:00:00Z") })
    );
  });

  it("treats null statement differently from a non-null statement", () => {
    expect(computeSignatureSeal({ ...base, statement: null })).not.toBe(
      computeSignatureSeal({ ...base, statement: "anything" })
    );
  });
});
