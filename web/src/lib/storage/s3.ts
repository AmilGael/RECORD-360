import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import type { Storage } from "./types";
import { extensionForType } from "./mime";

export interface S3Config {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

/** Read S3/R2 config from env, throwing if any required value is missing. */
export function s3ConfigFromEnv(env: Record<string, string | undefined>): S3Config {
  const endpoint = env.S3_ENDPOINT;
  const bucket = env.S3_BUCKET;
  const accessKeyId = env.S3_ACCESS_KEY_ID;
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "S3 storage is enabled (S3_BUCKET set) but S3_ENDPOINT, S3_ACCESS_KEY_ID, or S3_SECRET_ACCESS_KEY is missing.",
    );
  }
  // R2 ignores region but the SDK requires one; "auto" is the R2 convention.
  return { endpoint, bucket, accessKeyId, secretAccessKey, region: env.S3_REGION || "auto" };
}

/**
 * S3-compatible object storage (works with Cloudflare R2, AWS S3, Backblaze B2…).
 * Objects are kept PRIVATE — they are never served directly from the bucket.
 * Reads flow through the authenticated /api/media/[key] route, which calls get().
 */
export class S3Storage implements Storage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3Config) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      // Path-style avoids per-bucket subdomain DNS, which R2 endpoints don't serve.
      forcePathStyle: true,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async put(file: { buffer: Buffer; filename: string; contentType: string }) {
    // Validate against the MIME allowlist and derive the extension from the
    // validated type — the user-supplied filename is never trusted. (Same
    // contract as LocalDiskStorage.)
    const ext = extensionForType(file.contentType);
    if (!ext) throw new Error(`Unsupported file type: ${file.contentType}`);
    const key = `${randomUUID()}${ext}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.contentType,
      }),
    );
    return { key, url: `/api/media/${key}` };
  }

  async get(key: string): Promise<NodeJS.ReadableStream> {
    const safe = key.split("/").pop() ?? key; // defence-in-depth; route already sanitizes
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: safe }));
    if (!res.Body) throw new Error(`Object not found: ${safe}`);
    // In the Node runtime the S3 SDK returns the body as a Readable stream.
    return res.Body as Readable;
  }
}
