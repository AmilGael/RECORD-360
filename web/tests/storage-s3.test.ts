import { describe, expect, it, vi, beforeEach } from "vitest";
import { Readable } from "node:stream";

// Capture commands sent through the S3 client without hitting the network.
const sendMock = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/client-s3", () => {
  class PutObjectCommand {
    constructor(public input: Record<string, unknown>) {}
    readonly _type = "Put";
  }
  class GetObjectCommand {
    constructor(public input: Record<string, unknown>) {}
    readonly _type = "Get";
  }
  class S3Client {
    send = sendMock;
  }
  return { S3Client, PutObjectCommand, GetObjectCommand };
});

import { S3Storage, s3ConfigFromEnv } from "@/lib/storage/s3";
import { createStorage } from "@/lib/storage";
import { LocalDiskStorage } from "@/lib/storage/local";

const config = {
  endpoint: "https://acct.r2.cloudflarestorage.com",
  bucket: "raphl-media",
  accessKeyId: "ak",
  secretAccessKey: "sk",
  region: "auto",
};

beforeEach(() => sendMock.mockReset());

describe("S3Storage.put", () => {
  it("uploads a validated file and returns the first-party media URL", async () => {
    sendMock.mockResolvedValue({});
    const s3 = new S3Storage(config);
    const res = await s3.put({ buffer: Buffer.from("hi"), filename: "../evil.exe", contentType: "image/png" });

    expect(res.url).toBe(`/api/media/${res.key}`);
    expect(res.key).toMatch(/\.png$/); // extension comes from the MIME allowlist, not the filename
    expect(res.key).not.toContain("evil");
    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.input).toMatchObject({ Bucket: "raphl-media", Key: res.key, ContentType: "image/png" });
  });

  it("rejects a MIME type outside the allowlist (e.g. SVG)", async () => {
    const s3 = new S3Storage(config);
    await expect(
      s3.put({ buffer: Buffer.from("x"), filename: "a.svg", contentType: "image/svg+xml" }),
    ).rejects.toThrow(/Unsupported file type/);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe("S3Storage.get", () => {
  it("returns the object body as a stream", async () => {
    const body = Readable.from(["chunk"]);
    sendMock.mockResolvedValue({ Body: body });
    const s3 = new S3Storage(config);
    const stream = await s3.get("abc.png");
    expect(stream).toBe(body);
    expect(sendMock.mock.calls[0][0].input).toMatchObject({ Bucket: "raphl-media", Key: "abc.png" });
  });

  it("strips any path prefix before fetching (defence in depth)", async () => {
    sendMock.mockResolvedValue({ Body: Readable.from(["x"]) });
    const s3 = new S3Storage(config);
    await s3.get("../../secret/abc.png");
    expect(sendMock.mock.calls[0][0].input.Key).toBe("abc.png");
  });

  it("throws when the object has no body", async () => {
    sendMock.mockResolvedValue({ Body: undefined });
    const s3 = new S3Storage(config);
    await expect(s3.get("missing.png")).rejects.toThrow(/not found/i);
  });
});

describe("s3ConfigFromEnv", () => {
  it("reads config and defaults region to 'auto'", () => {
    const cfg = s3ConfigFromEnv({
      S3_ENDPOINT: "https://e", S3_BUCKET: "b", S3_ACCESS_KEY_ID: "a", S3_SECRET_ACCESS_KEY: "s",
    });
    expect(cfg).toEqual({ endpoint: "https://e", bucket: "b", accessKeyId: "a", secretAccessKey: "s", region: "auto" });
  });

  it("throws when a required value is missing", () => {
    expect(() => s3ConfigFromEnv({ S3_BUCKET: "b" })).toThrow(/missing/i);
  });
});

describe("createStorage driver selection", () => {
  it("uses S3 when S3_BUCKET is set", () => {
    const s = createStorage({
      S3_BUCKET: "b", S3_ENDPOINT: "https://e", S3_ACCESS_KEY_ID: "a", S3_SECRET_ACCESS_KEY: "s",
    });
    expect(s).toBeInstanceOf(S3Storage);
  });

  it("falls back to local disk when S3_BUCKET is absent", () => {
    expect(createStorage({})).toBeInstanceOf(LocalDiskStorage);
  });
});
