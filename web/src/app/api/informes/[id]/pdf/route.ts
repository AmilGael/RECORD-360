// Renders a persisted AI informe as PDF: code+QR header, fixed-format body,
// requester firma + company seal in the footer (spec R2.2).
import { prisma } from "@/lib/db";
import { projectAccessWhere } from "@/lib/authz/projects";
import { buildReportPdf } from "@/lib/report/pdf";
import { missingSealResponse, sanitizeFilename } from "@/lib/report/params";
import { storage } from "@/lib/storage";
import { requireFreshSession } from "@/lib/auth/session";
import { getDict } from "@/i18n/server";
import { ARCHETYPE_LABEL_ES } from "@/lib/informes/archetypes";

async function keyToBuffer(key: string | null): Promise<Buffer | null> {
  if (!key) return null;
  try {
    const stream = await storage.get(key);
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(Buffer.from(c as Buffer));
    return Buffer.concat(chunks);
  } catch {
    return null; // missing image never blocks the report
  }
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const user = await requireFreshSession();
    const sessionUser = { id: user.id, companyId: user.companyId, role: user.role };

    // status READY: a PENDING (still generating) or FAILED informe has no
    // content to render — 404, same as not existing. Legacy rows default READY.
    const informe = await prisma.informe.findFirst({
      where: { id, status: "READY", project: projectAccessWhere(sessionUser) },
      include: { project: { select: { id: true, name: true, registrationCode: true, company: { select: { name: true, sealKey: true } } } } },
    });
    if (!informe) return new Response("Not found", { status: 404 });

    const requester = await prisma.user.findFirst({
      where: { id: informe.requestedById, companyId: user.companyId },
      select: { name: true, signatureKey: true },
    });

    const scopeLabel = informe.partidaId ? "Informe de partida" : informe.segmentId ? "Informe de bloque" : "Informe de obra";
    const [firmaPng, sealPng] = await Promise.all([
      keyToBuffer(requester?.signatureKey ?? null),
      keyToBuffer(informe.project.company.sealKey),
    ]);
    if (!sealPng) return missingSealResponse();

    const pdf = await buildReportPdf({
      data: {
        project: {
          id: informe.project.id,
          name: informe.project.name,
          registrationCode: informe.project.registrationCode,
          companyName: informe.project.company.name,
        },
        scopeLabel,
        from: informe.periodFrom,
        to: informe.periodTo,
        partidas: [],
        registros: [],
        cambios: [],
      },
      generatedBy: requester?.name ?? "—",
      sealPng,
      informe: {
        contentMd: informe.contentMd,
        requesterName: requester?.name ?? "—",
        firmaPng,
        archetypeLabel: informe.archetype ? ARCHETYPE_LABEL_ES[informe.archetype] : null,
      },
    });

    const filename = `${sanitizeFilename(informe.project.name)}-informe-${informe.createdAt.toISOString().slice(0, 10)}.pdf`;
    // `inline` so the browser renders the informe in a tab instead of forcing a
    // download; the filename still names the file when the user saves from the
    // viewer. Safe to serve inline: the PDF is generated server-side by pdfkit
    // from sanitized text (never a user-uploaded file), the Content-Type is
    // fixed, nosniff blocks type-sniffing, and sanitizeFilename whitelists
    // [a-zA-Z0-9._-] so the header cannot be broken out of.
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    const { t } = await getDict();
    if (e instanceof Error && (e.message === "Unauthorized" || e.message === "Forbidden")) {
      return new Response(t.serverErrors.unauthorized, { status: e.message === "Forbidden" ? 403 : 401 });
    }
    console.error("[informe pdf]", e);
    return new Response(t.serverErrors.generic, { status: 500 });
  }
}
