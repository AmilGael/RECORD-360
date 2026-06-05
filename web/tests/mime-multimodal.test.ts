import { describe, it, expect } from "vitest";
import { extensionForType, attachmentKindForType, contentTypeForKey } from "@/lib/storage/mime";

describe("multimodal mime allowlist", () => {
  it("maps images to IMAGE", () => {
    expect(attachmentKindForType("image/png")).toBe("IMAGE");
    expect(extensionForType("image/png")).toBe(".png");
  });
  it("maps pdf / video / audio to their kinds", () => {
    expect(attachmentKindForType("application/pdf")).toBe("PDF");
    expect(attachmentKindForType("video/mp4")).toBe("VIDEO");
    expect(attachmentKindForType("audio/mpeg")).toBe("AUDIO");
    expect(extensionForType("video/mp4")).toBe(".mp4");
  });
  it("rejects disallowed types (incl. svg)", () => {
    expect(attachmentKindForType("image/svg+xml")).toBeUndefined();
    expect(extensionForType("text/html")).toBeUndefined();
  });
  it("resolves content-type from a stored key extension", () => {
    expect(contentTypeForKey("abc.pdf")).toBe("application/pdf");
    expect(contentTypeForKey("abc.mp4")).toBe("video/mp4");
    expect(contentTypeForKey("abc.png")).toBe("image/png");
  });
});
