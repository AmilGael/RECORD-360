import { describe, it, expect } from "vitest";
import { prepareAttachments } from "@/lib/registro/upload";
import type { Storage } from "@/lib/storage/types";

const fakeStorage: Storage = {
  async put({ filename }) { return { key: `k-${filename}`, url: `/api/media/k-${filename}` }; },
  async get() { throw new Error("not used"); },
};

function file(name: string, type: string, bytes = 10): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("prepareAttachments (multimodal)", () => {
  it("derives fileType from MIME for image, pdf, video, audio", async () => {
    const out = await prepareAttachments(
      [file("a.png", "image/png"), file("b.pdf", "application/pdf"), file("c.mp4", "video/mp4"), file("d.mp3", "audio/mpeg")],
      fakeStorage,
    );
    expect(out.map((a) => a.fileType)).toEqual(["IMAGE", "PDF", "VIDEO", "AUDIO"]);
    expect(out[0].url).toBe("/api/media/k-a.png");
    expect(out[0].sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it("rejects disallowed types", async () => {
    await expect(prepareAttachments([file("e.txt", "text/plain")], fakeStorage)).rejects.toThrow();
  });
  it("skips empty (0-byte) files", async () => {
    expect(await prepareAttachments([file("z.png", "image/png", 0)], fakeStorage)).toEqual([]);
  });
});
