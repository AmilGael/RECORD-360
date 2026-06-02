import { describe, it, expect } from "vitest";
import { prepareMedia } from "@/lib/registro/upload";
import type { Storage } from "@/lib/storage/types";

const okStorage: Storage = {
  put: async () => ({ key: "k.png", url: "/api/media/k.png" }),
  get: async () => {
    throw new Error("unused");
  },
};

describe("prepareMedia", () => {
  it("returns NOTE/null when there is no photo", async () => {
    expect(await prepareMedia(null, okStorage)).toEqual({ mediaUrl: null, type: "NOTE" });
  });

  it("returns NOTE/null for an empty (0-byte) file", async () => {
    const empty = new File([], "x.png", { type: "image/png" });
    expect(await prepareMedia(empty, okStorage)).toEqual({ mediaUrl: null, type: "NOTE" });
  });

  it("stores an allowed image and returns PHOTO + url", async () => {
    const f = new File([new Uint8Array([1, 2, 3])], "p.png", { type: "image/png" });
    expect(await prepareMedia(f, okStorage)).toEqual({ mediaUrl: "/api/media/k.png", type: "PHOTO" });
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
    const f = new File([new Uint8Array([1])], "evil.svg", { type: "image/svg+xml" });
    await expect(prepareMedia(f, spy)).rejects.toThrow(/no permitido/i);
    expect(called).toBe(false);
  });

  it("maps a storage failure to a generic error, not a file-type error", async () => {
    const failing: Storage = {
      put: async () => {
        throw new Error("disk full");
      },
      get: async () => {
        throw new Error("unused");
      },
    };
    const f = new File([new Uint8Array([1])], "p.png", { type: "image/png" });
    await expect(prepareMedia(f, failing)).rejects.toThrow(/no se pudo guardar/i);
  });
});
