import { storage } from "@/lib/storage";
import { contentTypeForKey } from "@/lib/storage/mime";
import { Readable } from "node:stream";
import path from "node:path";
import { prisma } from "@/lib/db";
import { projectAccessWhere } from "@/lib/authz/projects";
import { requireFreshSession } from "@/lib/auth/session";

// SECURITY: media is served inline on the first-party origin. The Content-Type
// comes from the stored extension (which put() derives from a validated MIME
// allowlist — image/pdf/video/audio; SVG and other executable types excluded),
// with nosniff + a locked-down CSP so nothing is sniffed or executed as script.
export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const safeKey = path.basename(key); // prevent path traversal
  const contentType = contentTypeForKey(safeKey);
  if (!contentType) return new Response("Not found", { status: 404 });

  try {
    // Auth gate: reject unauthenticated requests before touching storage,
    // so we don't leak whether the key exists.
    const user = await requireFreshSession();
    const sessionUser = { id: user.id, companyId: user.companyId, role: user.role };

    const url = `/api/media/${safeKey}`;
    const accessWhere = projectAccessWhere(sessionUser);
    const [attachment, changeAttachment, document, coverProject, member, company] = await Promise.all([
      prisma.attachment.findFirst({
        where: { url, registro: { partida: { project: accessWhere } } },
        select: { id: true },
      }),
      prisma.changeAttachment.findFirst({
        where: { url, changeRequest: { project: accessWhere } },
        select: { id: true },
      }),
      prisma.document.findFirst({
        where: { url, project: accessWhere },
        select: { id: true },
      }),
      // Identity images (R1): covers are project-scoped; member photos/firmas and
      // the company seal are company-scoped.
      prisma.project.findFirst({ where: { coverImageKey: safeKey, ...accessWhere }, select: { id: true } }),
      prisma.user.findFirst({
        where: { companyId: sessionUser.companyId, OR: [{ photoKey: safeKey }, { signatureKey: safeKey }] },
        select: { id: true },
      }),
      prisma.company.findFirst({ where: { id: sessionUser.companyId, sealKey: safeKey }, select: { id: true } }),
    ]);
    if (!attachment && !changeAttachment && !document && !coverProject && !member && !company) {
      return new Response("Not found", { status: 404 });
    }

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
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return new Response("Unauthorized", { status: 401 });
    if (error instanceof Error && error.message === "Forbidden") return new Response("Forbidden", { status: 403 });
    return new Response("Not found", { status: 404 });
  }
}
