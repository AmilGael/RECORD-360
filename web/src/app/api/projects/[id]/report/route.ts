// Deterministic time-range PDF report for a whole obra (R2.1).
import { assembleReportData } from "@/lib/report/data";
import { buildReportPdf } from "@/lib/report/pdf";
import { requireFreshSession } from "@/lib/auth/session";
import { parseRangeParam, sanitizeFilename } from "@/lib/report/params";
import { prisma } from "@/lib/db";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const user = await requireFreshSession();
    const url = new URL(req.url);
    const from = parseRangeParam(url, "from");
    const to = parseRangeParam(url, "to");
    if (from === "invalid" || to === "invalid") return new Response("Rango invalido", { status: 400 });

    const data = await assembleReportData(
      { id: user.id, companyId: user.companyId, role: user.role },
      { type: "project", id },
      from, to,
    );
    if (!data) return new Response("Not found", { status: 404 });

    const requester = await prisma.user.findFirst({ where: { id: user.id }, select: { name: true } });
    const pdf = await buildReportPdf({ data, generatedBy: requester?.name ?? "-" });
    const filename = `${sanitizeFilename(data.project.name)}-reporte-${new Date().toISOString().slice(0, 10)}.pdf`;
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
