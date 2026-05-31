import { describe, it, expect } from "vitest";
import { extensionForType, contentTypeForKey } from "@/lib/storage/mime";

describe("storage mime allowlist", () => {
  it("maps allowed raster image types to extensions", () => {
    expect(extensionForType("image/jpeg")).toBe(".jpg");
    expect(extensionForType("image/png")).toBe(".png");
    expect(extensionForType("image/webp")).toBe(".webp");
    expect(extensionForType("image/gif")).toBe(".gif");
  });

  it("rejects script-capable and non-image types", () => {
    expect(extensionForType("image/svg+xml")).toBeUndefined();
    expect(extensionForType("text/html")).toBeUndefined();
    expect(extensionForType("application/octet-stream")).toBeUndefined();
  });

  it("derives content-type from a stored key extension", () => {
    expect(contentTypeForKey("abc123.jpg")).toBe("image/jpeg");
    expect(contentTypeForKey("abc123.png")).toBe("image/png");
    expect(contentTypeForKey("abc123.html")).toBeUndefined();
    expect(contentTypeForKey("noext")).toBeUndefined();
  });
});
