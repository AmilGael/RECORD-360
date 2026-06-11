import { describe, it, expect } from "vitest";
import { uploadBrandedImage } from "@/lib/storage/image-upload";
import type { Storage } from "@/lib/storage/types";

const fakeStorage: Storage = {
  async put(file) {
    return { key: `fake-${file.contentType.split("/")[1]}.bin`, url: "/api/media/x" };
  },
  async get() {
    throw new Error("not used");
  },
};

function file(type: string, bytes = 16): File {
  return new File([new Uint8Array(bytes)], "img", { type });
}

describe("uploadBrandedImage", () => {
  it("accepts jpeg/png/webp for general images", async () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      await expect(uploadBrandedImage(file(type), fakeStorage)).resolves.toBeTruthy();
    }
  });
  it("rejects non-image and dangerous types", async () => {
    await expect(uploadBrandedImage(file("image/svg+xml"), fakeStorage)).rejects.toThrow();
    await expect(uploadBrandedImage(file("application/pdf"), fakeStorage)).rejects.toThrow();
  });
  it("pngOnly mode rejects everything but PNG (firma/seal contract)", async () => {
    await expect(uploadBrandedImage(file("image/png"), fakeStorage, { pngOnly: true })).resolves.toBeTruthy();
    await expect(uploadBrandedImage(file("image/jpeg"), fakeStorage, { pngOnly: true })).rejects.toThrow(/PNG/i);
  });
  it("rejects oversize files", async () => {
    await expect(uploadBrandedImage(file("image/png", 9 * 1024 * 1024), fakeStorage)).rejects.toThrow(/8 MB/);
  });
});
