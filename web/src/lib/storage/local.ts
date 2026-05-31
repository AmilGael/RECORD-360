import { createReadStream, existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Storage } from "./types";
import { extensionForType } from "./mime";

const ROOT = path.join(process.cwd(), ".uploads");

export class LocalDiskStorage implements Storage {
  async put(file: { buffer: Buffer; filename: string; contentType: string }) {
    // Validate against the MIME allowlist and derive the extension from the
    // validated type — the user-supplied filename is never trusted.
    const ext = extensionForType(file.contentType);
    if (!ext) {
      throw new Error(`Unsupported file type: ${file.contentType}`);
    }
    if (!existsSync(ROOT)) mkdirSync(ROOT, { recursive: true });
    const key = `${randomUUID()}${ext}`;
    await writeFile(path.join(ROOT, key), file.buffer);
    return { key, url: `/api/media/${key}` };
  }

  async get(key: string): Promise<NodeJS.ReadableStream> {
    const safe = path.basename(key); // prevent traversal
    return createReadStream(path.join(ROOT, safe));
  }
}
