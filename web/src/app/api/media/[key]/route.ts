import { storage } from "@/lib/storage";
import { contentTypeForKey } from "@/lib/storage/mime";
import { Readable } from "node:stream";
import path from "node:path";

// SECURITY: media is served inline on the first-party origin, so it must never
// be sniffable/executable as anything other than a known-safe raster image.
// The Content-Type comes from the stored extension (which put() derives from a
// validated MIME allowlist — SVG excluded), with nosniff + a locked-down CSP.
// TODO(Phase 3): gate this handler behind `auth()` so only signed-in users can
// fetch media; add per-company authorization once media is linked to a tenant.
export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const safeKey = path.basename(key); // prevent path traversal
  const contentType = contentTypeForKey(safeKey);
  if (!contentType) return new Response("Not found", { status: 404 });
  try {
    const nodeStream = await storage.get(safeKey);
    const webStream = Readable.toWeb(nodeStream as Readable) as ReadableStream;
    return new Response(webStream, {
      headers: {
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `inline; filename="${safeKey}"`,
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
