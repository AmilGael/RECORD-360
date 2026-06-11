// Renders a persisted AI informe as PDF: code+QR header, fixed-format body,
// requester firma + company seal in the footer (spec R2.2).
import { prisma } from "@/lib/db";
import { projectAccessWhere } from "@/lib/authz/projects";
import { buildReportPdf } from "@/lib/report/pdf";
import { sanitizeFilename } from "@/lib/report/params";
import { storage } from "@/lib/storage";
import { requireFreshSession } from "@/lib/auth/session";

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

    const informe = await prisma.informe.findFirst({
      where: { id, project: projectAccessWhere(sessionUser) },
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
      informe: {
        contentMd: informe.contentMd,
        requesterName: requester?.name ?? "—",
        firmaPng,
        sealPng,
      },
    });

    const filename = `${sanitizeFilename(informe.project.name)}-informe-${informe.createdAt.toISOString().slice(0, 10)}.pdf`;
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") return new Response("Unauthorized", { status: 401 });
    if (e instanceof Error && e.message === "Forbidden") return new Response("Forbidden", { status: 403 });
    return new Response("Error", { status: 500 });
  }
}
