import { storage } from "@/lib/storage";
import { contentTypeForKey } from "@/lib/storage/mime";
import { Readable } from "node:stream";
import path from "node:path";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

// SECURITY: media is served inline on the first-party origin. The Content-Type
// comes from the stored extension (which put() derives from a validated MIME
// allowlist — image/pdf/video/audio; SVG and other executable types excluded),
// with nosniff + a locked-down CSP so nothing is sniffed or executed as script.
export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const safeKey = path.basename(key); // prevent path traversal
  const contentType = contentTypeForKey(safeKey);
  if (!contentType) return new Response("Not found", { status: 404 });

  // Auth gate: reject unauthenticated requests before touching storage,
  // so we don't leak whether the key exists.
  const session = await auth();
  const user = session?.user as { companyId?: string } | undefined;
  if (!user?.companyId) return new Response("Unauthorized", { status: 401 });

  const url = `/api/media/${safeKey}`;
  const owned =
    (await prisma.attachment.findFirst({
      where: { url, registro: { partida: { project: { companyId: user.companyId } } } },
      select: { id: true },
    })) ??
    (await prisma.changeAttachment.findFirst({
      where: { url, changeRequest: { project: { companyId: user.companyId } } },
      select: { id: true },
    }));
  if (!owned) return new Response("Not found", { status: 404 });

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
