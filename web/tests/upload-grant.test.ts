import { describe, expect, it } from "vitest";
import { issueUploadGrant, verifyUploadGrant } from "@/lib/uploads/grant";

describe("upload grants", () => {
  it("round-trips a valid grant", () => {
    const g = issueUploadGrant("user-1", "abc.pdf", "PDF");
    expect(verifyUploadGrant("user-1", g)).toBe(true);
  });
  it("rejects a grant issued to another user", () => {
    const g = issueUploadGrant("user-1", "abc.pdf", "PDF");
    expect(verifyUploadGrant("user-2", g)).toBe(false);
  });
  it("rejects a tampered key", () => {
    const g = issueUploadGrant("user-1", "abc.pdf", "PDF");
    expect(verifyUploadGrant("user-1", { ...g, key: "other.pdf" })).toBe(false);
  });
  it("rejects a tampered fileType", () => {
    const g = issueUploadGrant("user-1", "abc.pdf", "PDF");
    expect(verifyUploadGrant("user-1", { ...g, fileType: "IMAGE" })).toBe(false);
  });
  it("rejects an expired grant", () => {
    const g = issueUploadGrant("user-1", "abc.pdf", "PDF", Date.now() - 60 * 60 * 1000);
    expect(verifyUploadGrant("user-1", g)).toBe(false);
  });
  it("rejects a forged token", () => {
    const g = issueUploadGrant("user-1", "abc.pdf", "PDF");
    expect(verifyUploadGrant("user-1", { ...g, token: "0".repeat(g.token.length) })).toBe(false);
  });
});
