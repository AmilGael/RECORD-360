import { describe, it, expect } from "vitest";
import { prepareAttachments } from "@/lib/registro/upload";
import type { Storage } from "@/lib/storage/types";

const okStorage: Storage = {
  put: async () => ({ key: "k.png", url: "/api/media/k.png" }),
  get: async () => {
    throw new Error("unused");
  },
};

describe("prepareAttachments", () => {
  it("returns an empty list when there are no files", async () => {
    expect(await prepareAttachments([], okStorage)).toEqual([]);
  });

  it("skips empty (0-byte) files", async () => {
    const empty = new File([], "x.png", { type: "image/png" });
    expect(await prepareAttachments([empty], okStorage)).toEqual([]);
  });

  it("uploads multiple images with a content sha256 and IMAGE type", async () => {
    const a = new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" });
    const b = new File([new Uint8Array([9, 9, 9])], "b.jpg", { type: "image/jpeg" });
    const out = await prepareAttachments([a, b], okStorage);
    expect(out).toHaveLength(2);
    for (const att of out) {
      expect(att.fileType).toBe("IMAGE");
      expect(att.url).toBe("/api/media/k.png");
      expect(att.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(out[0].sha256).not.toBe(out[1].sha256);
  });

  it("rejects a disallowed type before touching storage", async () => {
    let called = false;
    const spy: Storage = {
      put: async () => {
        called = true;
        return { key: "", url: "" };
      },
      get: async () => {
        throw new Error("unused");
      },
    };
    const svg = new File([new Uint8Array([1])], "evil.svg", { type: "image/svg+xml" });
    await expect(prepareAttachments([svg], spy)).rejects.toThrow(/no permitido/i);
    expect(called).toBe(false);
  });

  it("maps a storage failure to a generic error", async () => {
    const failing: Storage = {
      put: async () => {
        throw new Error("disk full");
      },
      get: async () => {
        throw new Error("unused");
      },
    };
    const f = new File([new Uint8Array([1])], "p.png", { type: "image/png" });
    await expect(prepareAttachments([f], failing)).rejects.toThrow(/no se pudo guardar/i);
  });

  it("rejects more than 10 files", async () => {
    const many = Array.from({ length: 11 }, (_, i) => new File([new Uint8Array([i + 1])], `f${i}.png`, { type: "image/png" }));
    await expect(prepareAttachments(many, okStorage)).rejects.toThrow(/demasiados|too many|máx/i);
  });
  it("rejects a file larger than the per-type limit", async () => {
    // IMAGE cap is 15 MB (multimodal per-type caps); 16 MB must be rejected.
    const big = new File([new Uint8Array(16 * 1024 * 1024)], "big.png", { type: "image/png" });
    await expect(prepareAttachments([big], okStorage)).rejects.toThrow(/grande|large|máx/i);
  });
});
