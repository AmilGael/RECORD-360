import { describe, expect, it } from "vitest";
import { prepareAttachments } from "@/lib/registro/upload";

const storage = {
  put: async () => ({ url: "/api/media/test.bin", key: "test.bin" }),
} as const;

function file(name: string, type: string, size: number) {
  return new File([new Uint8Array(size)], name, { type });
}

describe("prepareAttachments total size", () => {
  it("rejects when the combined payload exceeds the safe total cap", async () => {
    const files = [file("a.pdf", "application/pdf", 30 * 1024 * 1024), file("b.mp4", "video/mp4", 26 * 1024 * 1024)];
    await expect(prepareAttachments(files, storage as never)).rejects.toThrow(/total|tama[ñn]o total|l[ií]mite/i);
  });
});

