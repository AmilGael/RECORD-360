import { getPartidaPreview } from "@/lib/partida/preview";
import { requireFreshSession } from "@/lib/auth/session";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireFreshSession();
    const { id } = await ctx.params;
    const preview = await getPartidaPreview(
      { id: user.id, companyId: user.companyId, role: user.role },
      id,
    );
    if (!preview) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(preview, {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Not found";
    if (message === "Unauthorized") return Response.json({ error: message }, { status: 401 });
    if (message === "Forbidden") return Response.json({ error: message }, { status: 403 });
    return Response.json({ error: "Not found" }, { status: 404 });
  }
}
