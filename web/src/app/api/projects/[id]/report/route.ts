// Deterministic time-range PDF report for a whole obra (R2.1).
import { assembleReportData } from "@/lib/report/data";
import { buildReportPdf } from "@/lib/report/pdf";
import { requireFreshSession } from "@/lib/auth/session";
import { missingSealResponse, parseRangeParam, sanitizeFilename } from "@/lib/report/params";
import { loadCompanySealPng } from "@/lib/report/seal";
import { getDict } from "@/i18n/server";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const user = await requireFreshSession();
    const url = new URL(req.url);
    const from = parseRangeParam(url, "from");
    const to = parseRangeParam(url, "to");
    if (from === "invalid" || to === "invalid") {
      const { t } = await getDict();
      return new Response(t.serverErrors.informeDateInvalid, { status: 400 });
    }

    const data = await assembleReportData(
      { id: user.id, companyId: user.companyId, role: user.role },
      { type: "project", id },
      from, to,
    );
    if (!data) return new Response("Not found", { status: 404 });

    // R3 WS11: company seal on every page. Scoped to the CALLER's own tenant
    // (user.companyId) — never the target project's, though they coincide
    // here since assembleReportData already access-checked the project.
    const sealPng = await loadCompanySealPng(user.companyId);
    if (!sealPng) return missingSealResponse();

    const pdf = await buildReportPdf({ data, generatedBy: user.name, sealPng });
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
    const { t } = await getDict();
    if (e instanceof Error && (e.message === "Unauthorized" || e.message === "Forbidden")) {
      return new Response(t.serverErrors.unauthorized, { status: e.message === "Forbidden" ? 403 : 401 });
    }
    console.error("[project report]", e);
    return new Response(t.serverErrors.generic, { status: 500 });
  }
}
