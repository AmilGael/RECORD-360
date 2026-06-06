import { LocalDiskStorage } from "./local";
import { S3Storage, s3ConfigFromEnv } from "./s3";
import type { Storage } from "./types";

/**
 * Pick the storage driver from the environment. Setting S3_BUCKET switches the
 * app to S3-compatible object storage (e.g. Cloudflare R2); without it, files
 * land on local disk (fine for dev, lost on redeploy in prod).
 */
export function createStorage(env: Record<string, string | undefined>): Storage {
  if (env.S3_BUCKET) return new S3Storage(s3ConfigFromEnv(env));
  return new LocalDiskStorage();
}

export const storage: Storage = createStorage(process.env);
